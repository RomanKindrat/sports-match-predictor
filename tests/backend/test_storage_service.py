from datetime import datetime

from app.models import Match, ModelRun, Prediction, Team, User
from app.services import storage_service
from app.services.storage_service import (
    _parse_kickoff,
    create_prediction,
    get_or_create_default_model,
    get_or_create_team,
    sync_history_match_results,
    upsert_match_from_fixture,
)


class _Query:
    def __init__(self, result=None, all_result=None):
        self.result = result
        self.all_result = [] if all_result is None else all_result

    def filter(self, *args, **kwargs):
        return self

    def join(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def one_or_none(self):
        return self.result

    def first(self):
        return self.result

    def all(self):
        return self.all_result


class _Db:
    def __init__(self):
        self.queues = {}
        self.added = []
        self.flushed = 0
        self.commits = 0

    def queue(self, model, *results):
        self.queues.setdefault(model, []).extend(results)

    def query(self, model):
        queue = self.queues.setdefault(model, [])
        if queue:
            item = queue.pop(0)
            if isinstance(item, list):
                return _Query(all_result=item)
            return _Query(result=item)
        return _Query()

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = len(self.added) + 1
        self.added.append(obj)

    def flush(self):
        self.flushed += 1

    def commit(self):
        self.commits += 1


def test_parse_kickoff_supports_iso_datetime():
    parsed = _parse_kickoff("2026-05-07T18:30:00")

    assert parsed.year == 2026
    assert parsed.month == 5
    assert parsed.day == 7
    assert parsed.hour == 18
    assert parsed.minute == 30


def test_parse_kickoff_supports_trailing_z():
    parsed = _parse_kickoff("2026-05-07T18:30:00Z")

    assert parsed.year == 2026
    assert parsed.hour == 18
    assert parsed.tzinfo is None


def test_parse_kickoff_returns_none_for_invalid_or_empty_values():
    assert _parse_kickoff(None) is None
    assert _parse_kickoff("") is None
    assert _parse_kickoff("not-a-date") is None


def test_get_or_create_team_creates_new_team():
    db = _Db()

    team = get_or_create_team(db, name="Arsenal", league="152", country="England")

    assert team.name == "Arsenal"
    assert team.league == "152"
    assert team.country == "England"
    assert db.added == [team]
    assert db.flushed == 1


def test_get_or_create_team_updates_existing_team_metadata():
    db = _Db()
    existing = Team(id=1, name="Arsenal", league="old", country="Old")
    db.queue(Team, existing)

    team = get_or_create_team(db, name="Arsenal", league="152", country="England")

    assert team is existing
    assert team.league == "152"
    assert team.country == "England"
    assert db.added == []


def test_upsert_match_from_fixture_creates_match_with_teams():
    db = _Db()

    match = upsert_match_from_fixture(
        db,
        season="2026",
        fixture_id="100",
        kickoff="2026-08-10T15:00:00",
        home_team_name="Arsenal",
        away_team_name="Chelsea",
        league="152",
        venue="Emirates",
        status="NS",
        odds_home=2.0,
        odds_draw=3.5,
        odds_away=4.0,
    )

    assert match.fixture_id == "100"
    assert match.status == "NS"
    assert match.venue == "Emirates"
    assert match.odds_home == 2.0
    assert isinstance(match.date, datetime)
    assert len(db.added) == 3


def test_upsert_match_from_fixture_updates_existing_match():
    db = _Db()
    db.queue(Team, Team(id=1, name="Arsenal"), Team(id=2, name="Chelsea"))
    existing = Match(id=5, season="2026", fixture_id="100", home_team_id=1, away_team_id=2)
    db.queue(Match, existing)

    match = upsert_match_from_fixture(
        db,
        season="2026",
        fixture_id="100",
        kickoff="2026-08-10T15:00:00",
        home_team_name="Arsenal",
        away_team_name="Chelsea",
        venue="Updated",
        status="FT",
        odds_home=1.9,
    )

    assert match is existing
    assert match.status == "FT"
    assert match.venue == "Updated"
    assert match.odds_home == 1.9


def test_get_or_create_default_model_returns_existing_model():
    db = _Db()
    model = ModelRun(id=1, name="Notebook Predictor", type="gradient_boosting")
    db.queue(ModelRun, model)

    assert get_or_create_default_model(db) is model


def test_get_or_create_default_model_creates_default_model():
    db = _Db()

    model = get_or_create_default_model(db)

    assert model.name == "Notebook Predictor"
    assert model.type == "gradient_boosting"
    assert model.artifact_path == "model/notebook_model.py"
    assert db.added == [model]


def test_create_prediction_creates_new_prediction():
    db = _Db()
    match = Match(id=1, season="2026", fixture_id="100", home_team_id=1, away_team_id=2)
    model = ModelRun(id=2, name="Model", type="gradient_boosting")

    prediction = create_prediction(
        db,
        match=match,
        model=model,
        p_home=0.5,
        p_draw=0.3,
        p_away=0.2,
        pred_label="H",
        user_id=None,
        value_edge=0.1,
    )

    assert prediction.match_id == 1
    assert prediction.model_id == 2
    assert prediction.pred_label == "H"
    assert prediction.value_edge == 0.1
    assert db.added == [prediction]


def test_create_prediction_updates_existing_user_match_prediction():
    db = _Db()
    match = Match(id=1, season="2026", fixture_id="100", home_team_id=1, away_team_id=2)
    model = ModelRun(id=2, name="Model", type="gradient_boosting")
    existing = Prediction(id=9, match_id=1, model_id=1, p_home=0.1, p_draw=0.8, p_away=0.1, pred_label="D", user_id=7)
    db.queue(Prediction, existing)

    prediction = create_prediction(
        db,
        match=match,
        model=model,
        p_home=0.6,
        p_draw=0.2,
        p_away=0.2,
        pred_label="H",
        user_id=7,
        bookmaker_p_home=0.5,
    )

    assert prediction is existing
    assert prediction.model_id == 2
    assert prediction.p_home == 0.6
    assert prediction.pred_label == "H"
    assert prediction.bookmaker_p_home == 0.5
    assert prediction.is_correct is None
    assert db.flushed == 1


def test_sync_history_match_results_updates_match_and_settles_prediction(monkeypatch):
    db = _Db()
    user = User(id=7, name="Roman", email="roman@example.com", password_hash="hash")
    match = Match(
        id=1,
        season="2026",
        fixture_id="100",
        date=datetime(2026, 8, 10, 15, 0),
        home_team_id=1,
        away_team_id=2,
        status="NS",
        odds_home=2.0,
        odds_draw=3.5,
        odds_away=4.0,
    )
    prediction = Prediction(id=1, match_id=1, model_id=1, p_home=0.6, p_draw=0.2, p_away=0.2, pred_label="H", user_id=7)
    prediction.match = match
    prediction.user = user
    db.queue(Match, [match])
    db.queue(Prediction, [prediction])
    monkeypatch.setattr(
        storage_service,
        "get_fixtures_range",
        lambda **kwargs: [{"fixture_id": "100", "status": "FT", "home_goals": 2, "away_goals": 1, "result": "H"}],
    )

    changed = sync_history_match_results(db, user_id=7, league=152)

    assert changed == 1
    assert match.status == "FT"
    assert match.home_goals == 2
    assert match.result == "H"
    assert prediction.is_correct is True
    assert prediction.roi == 1.0
    assert db.commits == 1
