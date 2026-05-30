from datetime import date, datetime

import pytest

from app.services import api_football


def test_normalize_league_id_maps_api_football_epl_id():
    assert api_football._normalize_league_id(39) == "152"
    assert api_football._normalize_league_id("152") == "152"


def test_kickoff_iso_handles_date_and_time():
    assert api_football._kickoff_iso("2026-05-07", "18:30") == "2026-05-07T18:30:00"
    assert api_football._kickoff_iso("2026-05-07", None) == "2026-05-07"
    assert api_football._kickoff_iso(None, "18:30") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("2.50", 2.5), ("2,50", 2.5), ("", None), ("0", None), (None, None), ("abc", None)],
)
def test_to_float(raw, expected):
    assert api_football._to_float(raw) == expected


def test_extract_1x2_from_nested_provider_payload():
    payload = {"result": [{"market": {"odd_1": "2.0", "odd_x": "3.5", "odd_2": "4.0"}}]}

    assert api_football._extract_1x2_from_obj(payload) == (2.0, 3.5, 4.0)


def test_score_parsing_and_result_extraction():
    assert api_football._parse_score_pair("2-1") == (2, 1)
    assert api_football._parse_score_pair("2:2") == (2, 2)
    assert api_football._parse_score_pair("bad") == (None, None)
    assert api_football._extract_score({"event_ft_result": "3-0"}) == (3, 0)


def test_finished_status_and_current_season():
    assert api_football.is_finished_status("FT") is True
    assert api_football.is_finished_status("NS") is False
    assert api_football.is_finished_status(None) is False
    assert api_football.current_epl_season(datetime(2026, 8, 1)) == 2026
    assert api_football.current_epl_season(datetime(2026, 5, 1)) == 2025


def test_get_fixtures_range_normalizes_provider_response(monkeypatch):
    monkeypatch.setattr(api_football, "_allsports_key", lambda: "key")
    monkeypatch.setattr(api_football, "_resolve_allsports_league_id", lambda league: "152")
    monkeypatch.setattr(
        api_football,
        "_allsports_request",
        lambda params: {
            "success": "1",
            "result": [
                {
                    "event_key": "100",
                    "event_status": "FT",
                    "event_date": "2026-05-07",
                    "event_time": "18:30",
                    "event_home_team": "A",
                    "event_away_team": "B",
                    "event_ft_result": "2-1",
                    "event_stadium": "Stadium",
                },
                {"event_key": "100", "event_status": "FT"},
            ],
        },
    )

    fixtures = api_football.get_fixtures_range(league=39, from_date=date(2026, 5, 7), to_date=date(2026, 5, 8))

    assert fixtures == [
        {
            "fixture_id": "100",
            "status": "FT",
            "kickoff": "2026-05-07T18:30:00",
            "timezone": None,
            "venue": "Stadium",
            "home_goals": 2,
            "away_goals": 1,
            "result": "H",
        }
    ]


def test_get_upcoming_matches_filters_finished_and_fetches_odds(monkeypatch):
    monkeypatch.setattr(api_football, "_allsports_key", lambda: "key")
    monkeypatch.setattr(api_football, "_resolve_allsports_league_id", lambda league: "152")
    monkeypatch.setattr(
        api_football,
        "_allsports_request",
        lambda params: {
            "success": "1",
            "result": [
                {
                    "event_key": "1",
                    "event_status": "FT",
                    "event_home_team": "Old",
                    "event_away_team": "Done",
                },
                {
                    "event_key": "2",
                    "event_status": "NS",
                    "event_date": "2026-08-10",
                    "event_time": "15:00",
                    "event_home_team": "Arsenal",
                    "event_away_team": "Chelsea",
                    "event_stadium": "Emirates",
                    "odd_1": "2.1",
                    "odd_x": "3.4",
                    "odd_2": "3.2",
                },
            ],
        },
    )
    monkeypatch.setattr(api_football, "_fetch_odds_for_match", lambda match_id: (2.0, 3.5, 4.0))

    matches = api_football.get_upcoming_matches(league=39, next_matches=10)

    assert len(matches) == 1
    assert matches[0]["fixture_id"] == "2"
    assert matches[0]["home_team"] == "Arsenal"
    assert matches[0]["odds_home"] == 2.0


def test_resolve_allsports_league_id_finds_english_premier_league(monkeypatch):
    monkeypatch.delenv("ALLSPORTS_LEAGUE_ID", raising=False)
    monkeypatch.setattr(
        api_football,
        "_allsports_supported_leagues",
        lambda: (
            {"league_key": 177, "league_name": "Premier League", "country_name": "Ghana"},
            {"league_key": 44, "league_name": "Premier League", "country_name": "England"},
        ),
    )

    assert api_football._resolve_allsports_league_id(39) == "44"
    assert api_football._resolve_allsports_league_id(152) == "44"


def test_resolve_allsports_league_id_explains_missing_epl(monkeypatch):
    monkeypatch.delenv("ALLSPORTS_LEAGUE_ID", raising=False)
    monkeypatch.setattr(
        api_football,
        "_allsports_supported_leagues",
        lambda: (
            {"league_key": 177, "league_name": "Premier League", "country_name": "Ghana"},
            {"league_key": 423, "league_name": "Cup", "country_name": "Lithuania"},
        ),
    )

    with pytest.raises(api_football.AllSportsLeagueUnavailable) as exc:
        api_football._resolve_allsports_league_id(39)

    assert "English Premier League is not available" in str(exc.value)
    assert "Ghana - Premier League (177)" in str(exc.value)
