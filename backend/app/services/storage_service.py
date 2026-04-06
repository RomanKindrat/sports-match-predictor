from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Match, ModelRun, Prediction, Team
from app.services.api_football import get_fixtures_range, is_finished_status


def _parse_kickoff(kickoff: str | None) -> datetime | None:
    if not kickoff:
        return None
    text = kickoff.strip()
    if not text:
        return None
    try:
        # Support plain ISO and trailing Z.
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def get_or_create_team(db: Session, *, name: str, league: str | None = None, country: str | None = None) -> Team:
    team = db.query(Team).filter(Team.name == name).one_or_none()
    if team:
        if league and team.league != league:
            team.league = league
        if country and team.country != country:
            team.country = country
        return team

    team = Team(name=name, league=league, country=country)
    db.add(team)
    db.flush()
    return team


def upsert_match_from_fixture(
    db: Session,
    *,
    season: str | None,
    fixture_id: str | None,
    kickoff: str | None,
    home_team_name: str,
    away_team_name: str,
    league: str | None = None,
    country: str | None = None,
    venue: str | None = None,
    status: str | None = None,
    kickoff_tz: str | None = None,
    odds_home: float | None = None,
    odds_draw: float | None = None,
    odds_away: float | None = None,
) -> Match:
    home_team = get_or_create_team(db, name=home_team_name, league=league, country=country)
    away_team = get_or_create_team(db, name=away_team_name, league=league, country=country)
    match_date = _parse_kickoff(kickoff)

    match: Match | None = None
    if fixture_id:
        match = db.query(Match).filter(Match.fixture_id == str(fixture_id)).one_or_none()

    match = (
        match
        or db.query(Match)
        .filter(
            Match.season == season,
            Match.date == match_date,
            Match.home_team_id == home_team.id,
            Match.away_team_id == away_team.id,
        )
        .one_or_none()
    )
    if match:
        match.fixture_id = str(fixture_id) if fixture_id else match.fixture_id
        match.kickoff_tz = kickoff_tz or match.kickoff_tz
        match.status = status or match.status
        match.venue = venue or match.venue
        if odds_home is not None:
            match.odds_home = odds_home
        if odds_draw is not None:
            match.odds_draw = odds_draw
        if odds_away is not None:
            match.odds_away = odds_away
        return match

    match = Match(
        season=season,
        fixture_id=str(fixture_id) if fixture_id else None,
        date=match_date,
        kickoff_tz=kickoff_tz,
        status=status,
        venue=venue,
        home_team_id=home_team.id,
        away_team_id=away_team.id,
        home_goals=None,
        away_goals=None,
        result=None,
        odds_home=odds_home,
        odds_draw=odds_draw,
        odds_away=odds_away,
    )
    db.add(match)
    db.flush()
    return match


def get_or_create_default_model(db: Session) -> ModelRun:
    model = (
        db.query(ModelRun)
        .filter(
            ModelRun.name == "Notebook Predictor",
            ModelRun.type == "gradient_boosting",
        )
        .order_by(ModelRun.id.desc())
        .first()
    )
    if model:
        return model

    model = ModelRun(
        name="Notebook Predictor",
        type="gradient_boosting",
        metrics=None,
        artifact_path="model/notebook_model.py",
    )
    db.add(model)
    db.flush()
    return model


def create_prediction(
    db: Session,
    *,
    match: Match,
    model: ModelRun,
    p_home: float,
    p_draw: float,
    p_away: float,
    pred_label: str,
    user_id: int | None,
    value_edge: float | None = None,
    bookmaker_p_home: float | None = None,
    bookmaker_p_draw: float | None = None,
    bookmaker_p_away: float | None = None,
) -> Prediction:
    # Keep one prediction per user per match to avoid duplicates in history.
    if user_id is not None:
        existing = (
            db.query(Prediction)
            .filter(Prediction.user_id == user_id, Prediction.match_id == match.id)
            .order_by(Prediction.id.desc())
            .first()
        )
        if existing:
            existing.model_id = model.id
            existing.created_at = datetime.utcnow()
            existing.p_home = p_home
            existing.p_draw = p_draw
            existing.p_away = p_away
            existing.pred_label = pred_label
            existing.value_edge = value_edge
            existing.bookmaker_p_home = bookmaker_p_home
            existing.bookmaker_p_draw = bookmaker_p_draw
            existing.bookmaker_p_away = bookmaker_p_away
            existing.is_correct = None
            existing.settled_at = None
            existing.roi = None
            db.flush()
            return existing

    row = Prediction(
        match_id=match.id,
        model_id=model.id,
        p_home=p_home,
        p_draw=p_draw,
        p_away=p_away,
        pred_label=pred_label,
        user_id=user_id,
        value_edge=value_edge,
        bookmaker_p_home=bookmaker_p_home,
        bookmaker_p_draw=bookmaker_p_draw,
        bookmaker_p_away=bookmaker_p_away,
    )
    db.add(row)
    db.flush()
    return row


def sync_history_match_results(db: Session, *, user_id: int, league: int = 152) -> int:
    user_matches = (
        db.query(Match)
        .join(Prediction, Prediction.match_id == Match.id)
        .filter(Prediction.user_id == user_id, Match.fixture_id.isnot(None))
        .all()
    )
    if not user_matches:
        return 0

    dates = [m.date for m in user_matches if m.date is not None]
    if dates:
        from_value = min(dates).date() - timedelta(days=2)
        to_value = datetime.utcnow().date() + timedelta(days=2)
    else:
        from_value = datetime.utcnow().date() - timedelta(days=45)
        to_value = datetime.utcnow().date() + timedelta(days=2)

    fixtures = get_fixtures_range(league=league, from_date=from_value, to_date=to_value)
    by_fixture = {str(item.get("fixture_id")): item for item in fixtures if item.get("fixture_id")}

    changed = 0
    for match in user_matches:
        data = by_fixture.get(str(match.fixture_id))
        if not data:
            continue

        prev = (match.status, match.home_goals, match.away_goals, match.result)
        match.status = data.get("status") or match.status
        match.venue = data.get("venue") or match.venue
        if data.get("home_goals") is not None:
            match.home_goals = int(data["home_goals"])
        if data.get("away_goals") is not None:
            match.away_goals = int(data["away_goals"])
        if data.get("result") is not None:
            match.result = data["result"]
        cur = (match.status, match.home_goals, match.away_goals, match.result)
        if cur != prev:
            changed += 1

    # Settle prediction correctness for finished matches.
    preds = (
        db.query(Prediction)
        .join(Match, Prediction.match_id == Match.id)
        .filter(Prediction.user_id == user_id)
        .all()
    )
    now = datetime.utcnow()
    for pred in preds:
        match = pred.match
        has_result = match and match.result in {"H", "D", "A"}
        finished = bool(match and (is_finished_status(match.status) or has_result))
        if not finished:
            continue
        if has_result:
            pred.is_correct = pred.pred_label == match.result
        pred.settled_at = now
        if pred.is_correct is not None:
            if pred.is_correct:
                odd = match.odds_home if pred.pred_label == "H" else match.odds_draw if pred.pred_label == "D" else match.odds_away
                pred.roi = (float(odd) - 1.0) if odd else 0.0
            else:
                pred.roi = -1.0

    db.commit()
    return changed
