from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from sqlalchemy.orm import Session

from app.services.api_football import current_epl_season, get_standings, get_upcoming_matches
from app.services.model_predictor import predict_match_from_notebook_model
from app.services.storage_service import create_prediction, get_or_create_default_model, upsert_match_from_fixture


@dataclass
class UpcomingMatchesResponse:
    league: int
    season: int
    matches: list[dict]
    note: str | None


class PredictionService:
    def get_upcoming_matches(
        self,
        league: int = 152,
        season: int | None = None,
        limit: int = 10,
        db: Session | None = None,
    ) -> UpcomingMatchesResponse:
        season_value = season if season is not None else current_epl_season()
        matches = get_upcoming_matches(league=league, season=season, next_matches=limit)
        note = None
        if not matches:
            note = "No upcoming fixtures returned by AllSportsAPI for the selected date range/league."
        if db is not None:
            for item in matches:
                home = item.get("home_team")
                away = item.get("away_team")
                if not home or not away:
                    continue
                upsert_match_from_fixture(
                    db,
                    season=str(season_value),
                    fixture_id=item.get("fixture_id"),
                    kickoff=item.get("kickoff"),
                    home_team_name=home,
                    away_team_name=away,
                    league=str(league),
                    venue=item.get("venue"),
                    status=item.get("status"),
                    kickoff_tz=item.get("timezone"),
                    odds_home=item.get("odds_home"),
                    odds_draw=item.get("odds_draw"),
                    odds_away=item.get("odds_away"),
                )
            db.commit()

        return UpcomingMatchesResponse(
            league=league,
            season=season_value,
            matches=matches,
            note=note,
        )

    def predict_match(
        self,
        home_team: str,
        away_team: str,
        *,
        season: int | None = None,
        fixture_id: str | None = None,
        kickoff: str | None = None,
        league: int | None = None,
        venue: str | None = None,
        status: str | None = None,
        kickoff_tz: str | None = None,
        odds_home: float | None = None,
        odds_draw: float | None = None,
        odds_away: float | None = None,
        db: Session | None = None,
        user_id: int | None = None,
    ) -> dict:
        result = predict_match_from_notebook_model(
            home_team=home_team,
            away_team=away_team,
            odds_home=odds_home,
            odds_draw=odds_draw,
            odds_away=odds_away,
        )
        prediction_id: int | None = None
        if db is not None:
            season_value = str(season if season is not None else current_epl_season())
            match = upsert_match_from_fixture(
                db,
                season=season_value,
                fixture_id=fixture_id,
                kickoff=kickoff,
                home_team_name=home_team,
                away_team_name=away_team,
                league=str(league) if league is not None else None,
                venue=venue,
                status=status,
                kickoff_tz=kickoff_tz,
                odds_home=odds_home,
                odds_draw=odds_draw,
                odds_away=odds_away,
            )
            model = get_or_create_default_model(db)
            pred_label = "H"
            if result.probabilities.get("Draw", 0) >= max(result.probabilities.get("HomeWin", 0), result.probabilities.get("AwayWin", 0)):
                pred_label = "D"
            elif result.probabilities.get("AwayWin", 0) > result.probabilities.get("HomeWin", 0):
                pred_label = "A"

            inv_sum = 0.0
            if odds_home and odds_home > 0:
                inv_sum += 1.0 / odds_home
            if odds_draw and odds_draw > 0:
                inv_sum += 1.0 / odds_draw
            if odds_away and odds_away > 0:
                inv_sum += 1.0 / odds_away

            bookmaker_p_home = bookmaker_p_draw = bookmaker_p_away = None
            value_edge = None
            if inv_sum > 0:
                bookmaker_p_home = (1.0 / odds_home) / inv_sum if odds_home else None
                bookmaker_p_draw = (1.0 / odds_draw) / inv_sum if odds_draw else None
                bookmaker_p_away = (1.0 / odds_away) / inv_sum if odds_away else None
                model_prob = (
                    float(result.probabilities.get("HomeWin", 0.0))
                    if pred_label == "H"
                    else float(result.probabilities.get("Draw", 0.0))
                    if pred_label == "D"
                    else float(result.probabilities.get("AwayWin", 0.0))
                )
                book_prob = (
                    bookmaker_p_home if pred_label == "H" else bookmaker_p_draw if pred_label == "D" else bookmaker_p_away
                )
                if book_prob is not None:
                    value_edge = model_prob - book_prob

            saved = create_prediction(
                db,
                match=match,
                model=model,
                p_home=float(result.probabilities.get("HomeWin", 0.0)),
                p_draw=float(result.probabilities.get("Draw", 0.0)),
                p_away=float(result.probabilities.get("AwayWin", 0.0)),
                pred_label=pred_label,
                user_id=user_id,
                value_edge=value_edge,
                bookmaker_p_home=bookmaker_p_home,
                bookmaker_p_draw=bookmaker_p_draw,
                bookmaker_p_away=bookmaker_p_away,
            )
            db.commit()
            prediction_id = saved.id

        return {
            "home_team": result.home_team,
            "away_team": result.away_team,
            "predicted_result": result.predicted_label,
            "confidence": round(result.confidence, 4),
            "selected_edge_threshold": round(float(result.selected_edge_threshold), 4),
            "probabilities": {k: round(v, 4) for k, v in result.probabilities.items()},
            "used_fallback_for": result.used_fallback_for,
            "prediction_id": prediction_id,
        }

    def standings(self, league: int, season: int, team: int | None = None) -> dict:
        return get_standings(league=league, season=season, team=team)


@lru_cache(maxsize=1)
def get_prediction_service() -> PredictionService:
    return PredictionService()
