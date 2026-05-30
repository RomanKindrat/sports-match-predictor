from dataclasses import dataclass

from app.services.prediction_service import PredictionService


@dataclass
class _RawPrediction:
    home_team: str = "Arsenal"
    away_team: str = "Chelsea"
    predicted_label: str = "Перемога Arsenal"
    probabilities: dict | None = None
    confidence: float = 0.61234
    used_fallback_for: list | None = None
    selected_edge_threshold: float = 0.15

    def __post_init__(self):
        self.probabilities = self.probabilities or {"HomeWin": 0.61234, "Draw": 0.2, "AwayWin": 0.18766}
        self.used_fallback_for = self.used_fallback_for or []


class _SavedPrediction:
    id = 42


class _Db:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


def test_get_upcoming_matches_adds_note_when_provider_returns_empty(monkeypatch):
    monkeypatch.setattr("app.services.prediction_service.current_epl_season", lambda: 2025)
    monkeypatch.setattr("app.services.prediction_service.get_upcoming_matches", lambda **kwargs: [])

    result = PredictionService().get_upcoming_matches(league=152, limit=5)

    assert result.league == 152
    assert result.season == 2025
    assert result.matches == []
    assert result.note is not None


def test_get_upcoming_matches_persists_valid_matches(monkeypatch):
    db = _Db()
    saved = []
    monkeypatch.setattr(
        "app.services.prediction_service.get_upcoming_matches",
        lambda **kwargs: [
            {
                "fixture_id": "1",
                "home_team": "Arsenal",
                "away_team": "Chelsea",
                "kickoff": "2026-08-10T15:00:00",
                "timezone": "Europe/Kyiv",
                "venue": "Emirates",
                "status": "NS",
                "odds_home": 2.0,
                "odds_draw": 3.5,
                "odds_away": 4.0,
            },
            {"fixture_id": "bad", "home_team": "", "away_team": "Chelsea"},
        ],
    )
    monkeypatch.setattr("app.services.prediction_service.upsert_match_from_fixture", lambda db, **kwargs: saved.append(kwargs))

    result = PredictionService().get_upcoming_matches(league=152, season=2026, limit=5, db=db)

    assert len(result.matches) == 2
    assert len(saved) == 1
    assert saved[0]["home_team_name"] == "Arsenal"
    assert db.commits == 1


def test_predict_match_returns_rounded_prediction_without_database(monkeypatch):
    monkeypatch.setattr("app.services.prediction_service.predict_match_from_notebook_model", lambda **kwargs: _RawPrediction())

    result = PredictionService().predict_match("Arsenal", "Chelsea", odds_home=2.0, odds_draw=3.5, odds_away=4.0)

    assert result["predicted_result"] == "Перемога Arsenal"
    assert result["confidence"] == 0.6123
    assert result["probabilities"]["HomeWin"] == 0.6123
    assert result["prediction_id"] is None


def test_predict_match_persists_prediction_and_calculates_value_edge(monkeypatch):
    db = _Db()
    created = {}
    monkeypatch.setattr("app.services.prediction_service.current_epl_season", lambda: 2026)
    monkeypatch.setattr("app.services.prediction_service.predict_match_from_notebook_model", lambda **kwargs: _RawPrediction())
    monkeypatch.setattr("app.services.prediction_service.upsert_match_from_fixture", lambda db, **kwargs: object())
    monkeypatch.setattr("app.services.prediction_service.get_or_create_default_model", lambda db: object())

    def fake_create_prediction(db, **kwargs):
        created.update(kwargs)
        return _SavedPrediction()

    monkeypatch.setattr("app.services.prediction_service.create_prediction", fake_create_prediction)

    result = PredictionService().predict_match(
        "Arsenal",
        "Chelsea",
        fixture_id="1",
        league=152,
        odds_home=2.0,
        odds_draw=4.0,
        odds_away=4.0,
        db=db,
        user_id=9,
    )

    assert result["prediction_id"] == 42
    assert created["pred_label"] == "H"
    assert round(created["bookmaker_p_home"], 2) == 0.5
    assert round(created["value_edge"], 2) == 0.11
    assert db.commits == 1


def test_standings_delegates_to_provider(monkeypatch):
    monkeypatch.setattr("app.services.prediction_service.get_standings", lambda league, season, team=None: {"league": league, "season": season, "team": team})

    assert PredictionService().standings(152, 2026, team=1) == {"league": 152, "season": 2026, "team": 1}
