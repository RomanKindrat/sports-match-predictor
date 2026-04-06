from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"
ALLSPORTS_BASE_URLS = (
    "https://apiv2.allsportsapi.com/football/",
    "https://allsportsapi.com/api/football/",
)
DEFAULT_APL_LEAGUE_ID = "152"


def _headers() -> dict:
    key = os.getenv("API_FOOTBALL_KEY")
    if not key:
        raise RuntimeError("API_FOOTBALL_KEY is not set (check backend/.env)")
    return {"x-apisports-key": key}


def _request(path: str, params: dict) -> dict:
    response = requests.get(
        f"{API_FOOTBALL_BASE_URL}{path}",
        headers=_headers(),
        params=params,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def _allsports_key() -> str:
    # Backward-compatible: if user reused old variable name we still work.
    key = os.getenv("ALLSPORTS_API_KEY") or os.getenv("API_FOOTBALL_KEY")
    if not key:
        raise RuntimeError("ALLSPORTS_API_KEY is not set (check backend/.env)")
    return key


def _allsports_request(params: dict[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None
    for base_url in ALLSPORTS_BASE_URLS:
        try:
            response = requests.get(
                base_url,
                params=params,
                timeout=20,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # pragma: no cover - network/provider dependent
            last_error = exc
            continue

    raise RuntimeError(f"AllSports request failed: {last_error}")


def _normalize_league_id(league: int | str) -> str:
    # FastAPI league id for EPL is 39 (API-Football). AllSports uses another id.
    if str(league) == "39":
        return DEFAULT_APL_LEAGUE_ID
    return str(league)


def _kickoff_iso(event_date: str | None, event_time: str | None) -> str | None:
    if not event_date:
        return None
    if event_time:
        return f"{event_date}T{event_time}:00"
    return event_date


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if not text:
        return None
    try:
        v = float(text)
        return v if v > 0 else None
    except ValueError:
        return None


def _extract_1x2_from_obj(obj: Any) -> tuple[float | None, float | None, float | None] | None:
    if isinstance(obj, dict):
        home = _to_float(obj.get("odd_1") or obj.get("home_odds") or obj.get("odds_home"))
        draw = _to_float(obj.get("odd_x") or obj.get("draw_odds") or obj.get("odds_draw"))
        away = _to_float(obj.get("odd_2") or obj.get("away_odds") or obj.get("odds_away"))
        if home and draw and away:
            return home, draw, away

        for value in obj.values():
            nested = _extract_1x2_from_obj(value)
            if nested:
                return nested
        return None

    if isinstance(obj, list):
        for item in obj:
            nested = _extract_1x2_from_obj(item)
            if nested:
                return nested
    return None


def _fetch_odds_for_match(match_id: str) -> tuple[float | None, float | None, float | None]:
    if not match_id:
        return None, None, None
    payload = _allsports_request(
        {
            "met": "Odds",
            "matchId": match_id,
            "APIkey": _allsports_key(),
        }
    )
    extracted = _extract_1x2_from_obj(payload.get("result") or payload)
    if not extracted:
        return None, None, None
    return extracted


def _is_finished_status(status: str) -> bool:
    s = status.strip().upper()
    return s in {
        "FT",
        "AET",
        "PEN",
        "FINISHED",
        "MATCH FINISHED",
        "AFTER PEN.",
        "POSTPONED",
        "CANCELED",
        "ABANDONED",
        "AWARDED",
    }


def is_finished_status(status: str | None) -> bool:
    if not status:
        return False
    return _is_finished_status(str(status))


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _parse_score_pair(text: str | None) -> tuple[int | None, int | None]:
    if not text:
        return None, None
    raw = str(text).replace(":", "-")
    parts = [p.strip() for p in raw.split("-")]
    if len(parts) != 2:
        return None, None
    return _to_int(parts[0]), _to_int(parts[1])


def _extract_score(item: dict[str, Any]) -> tuple[int | None, int | None]:
    home = _to_int(
        item.get("event_home_final_result")
        or item.get("event_home_ft_result")
        or item.get("event_home_result")
        or item.get("home_score")
    )
    away = _to_int(
        item.get("event_away_final_result")
        or item.get("event_away_ft_result")
        or item.get("event_away_result")
        or item.get("away_score")
    )
    if home is not None and away is not None:
        return home, away

    pair = (
        item.get("event_ft_result")
        or item.get("event_final_result")
        or item.get("event_halftime_result")
    )
    h2, a2 = _parse_score_pair(pair)
    return h2, a2


def get_fixtures_range(league: int = 39, from_date: date | None = None, to_date: date | None = None) -> list[dict]:
    from_value = from_date or (datetime.utcnow().date() - timedelta(days=2))
    to_value = to_date or (datetime.utcnow().date() + timedelta(days=2))
    league_id = _normalize_league_id(league)
    payload = _allsports_request(
        {
            "met": "Fixtures",
            "APIkey": _allsports_key(),
            "from": from_value.isoformat(),
            "to": to_value.isoformat(),
            "leagueId": league_id,
        }
    )
    if str(payload.get("success")) not in {"1", "true", "True"}:
        return []

    fixtures = payload.get("result") or []
    normalized = []
    seen_ids: set[str] = set()
    for item in fixtures:
        fixture_id = str(item.get("event_key") or "")
        if not fixture_id or fixture_id in seen_ids:
            continue
        seen_ids.add(fixture_id)
        hg, ag = _extract_score(item)
        result = None
        if hg is not None and ag is not None:
            result = "H" if hg > ag else "A" if hg < ag else "D"
        normalized.append(
            {
                "fixture_id": fixture_id,
                "status": str(item.get("event_status") or "").strip() or "NS",
                "kickoff": _kickoff_iso(item.get("event_date"), item.get("event_time")),
                "timezone": item.get("event_timezone"),
                "venue": item.get("event_stadium"),
                "home_goals": hg,
                "away_goals": ag,
                "result": result,
            }
        )
    return normalized


def current_epl_season(today: datetime | None = None) -> int:
    now = today or datetime.utcnow()
    # EPL season starts around July/August
    return now.year if now.month >= 7 else now.year - 1


def get_standings(league: int, season: int, team: int | None = None) -> dict:
    params: dict = {"league": league, "season": season}
    if team is not None:
        params["team"] = team
    return _request("/standings", params)


def get_upcoming_matches(league: int = 39, season: int | None = None, next_matches: int = 10) -> list[dict]:
    today = datetime.utcnow().date()
    from_date = today
    in_365_days = from_date + timedelta(days=365)
    league_id = _normalize_league_id(league)
    payload = _allsports_request(
        {
            "met": "Fixtures",
            "APIkey": _allsports_key(),
            "from": from_date.isoformat(),
            "to": in_365_days.isoformat(),
            "leagueId": league_id,
        }
    )
    if str(payload.get("success")) not in {"1", "true", "True"}:
        raise RuntimeError(f"AllSports error: {payload.get('result') or payload.get('message') or payload}")

    fixtures = payload.get("result") or []

    normalized = []
    seen_ids: set[str] = set()
    for item in fixtures:
        status = str(item.get("event_status") or "").strip()
        # keep not-finished fixtures (NS or in-play), skip finished/canceled.
        if status and _is_finished_status(status):
            continue

        fixture_id = str(item.get("event_key") or "")
        if fixture_id in seen_ids:
            continue
        if fixture_id:
            seen_ids.add(fixture_id)

        normalized.append(
            {
                "fixture_id": fixture_id,
                "kickoff": _kickoff_iso(item.get("event_date"), item.get("event_time")),
                "timezone": item.get("event_timezone"),
                "venue": item.get("event_stadium"),
                "status": status or "NS",
                "round": item.get("event_round"),
                "home_team": item.get("event_home_team"),
                "away_team": item.get("event_away_team"),
                # Optional 1X2 odds (provider-dependent key names).
                "odds_home": _to_float(item.get("odd_1") or item.get("home_odds") or item.get("odds_home")),
                "odds_draw": _to_float(item.get("odd_x") or item.get("draw_odds") or item.get("odds_draw")),
                "odds_away": _to_float(item.get("odd_2") or item.get("away_odds") or item.get("odds_away")),
            }
        )

    normalized = [m for m in normalized if m.get("home_team") and m.get("away_team")]
    normalized.sort(key=lambda item: item.get("kickoff") or "")
    normalized = normalized[:next_matches]

    # Fetch odds only for ближайші матчі, інакше full-season запит стає дуже повільним.
    for idx, match in enumerate(normalized):
        if idx >= 30:
            break
        # Fetch odds by event_key/matchId as a dedicated request.
        # This is the most reliable source for value-bet comparison.
        match_id = str(match.get("fixture_id") or "")
        try:
            h, d, a = _fetch_odds_for_match(match_id)
            if h and d and a:
                match["odds_home"] = h
                match["odds_draw"] = d
                match["odds_away"] = a
        except Exception:
            # Keep fixture data even if odds provider is unavailable.
            pass

    return normalized
