from unittest.mock import patch

from app.services.model_predictor import predict_match_from_notebook_model


class _FakeRawPrediction:
    predicted_label = "AwayWin"
    probabilities = {"HomeWin": 0.2, "Draw": 0.25, "AwayWin": 0.55}
    confidence = 0.55
    used_fallback_for = ["Unknown FC"]
    selected_edge_threshold = 0.15


class _FakePredictor:
    def __init__(self):
        self.calls = []

    def predict(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeRawPrediction()


def test_predict_match_maps_raw_label_to_ukrainian_label():
    fake_predictor = _FakePredictor()

    with patch("app.services.model_predictor.get_predictor", return_value=fake_predictor):
        result = predict_match_from_notebook_model(
            "Arsenal",
            "Chelsea",
            odds_home=2.1,
            odds_draw=3.4,
            odds_away=3.2,
        )

    assert result.predicted_label == "Перемога Chelsea"
    assert result.probabilities["AwayWin"] == 0.55
    assert result.confidence == 0.55
    assert result.used_fallback_for == ["Unknown FC"]
    assert result.selected_edge_threshold == 0.15
    assert fake_predictor.calls[0] == {
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "odds_home": 2.1,
        "odds_draw": 3.4,
        "odds_away": 3.2,
    }
