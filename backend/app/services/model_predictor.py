from __future__ import annotations

import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass
class PredictionResult:
    home_team: str
    away_team: str
    predicted_label: str
    probabilities: dict[str, float]
    confidence: float
    used_fallback_for: list[str]
    selected_edge_threshold: float


def _load_notebook_module():
    project_root = Path(__file__).resolve().parents[3]
    root_str = str(project_root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    from model.notebook_model import get_notebook_predictor  # type: ignore

    return get_notebook_predictor


@lru_cache(maxsize=1)
def get_predictor():
    project_root = Path(__file__).resolve().parents[3]
    datasets_dir = project_root / "model" / "datasets"
    get_notebook_predictor = _load_notebook_module()
    return get_notebook_predictor(datasets_dir)


def predict_match_from_notebook_model(
    home_team: str,
    away_team: str,
    odds_home: float | None = None,
    odds_draw: float | None = None,
    odds_away: float | None = None,
) -> PredictionResult:
    predictor = get_predictor()
    raw = predictor.predict(
        home_team=home_team,
        away_team=away_team,
        odds_home=odds_home,
        odds_draw=odds_draw,
        odds_away=odds_away,
    )

    pretty_label = {
        "HomeWin": f"Перемога {home_team}",
        "Draw": "Нічия",
        "AwayWin": f"Перемога {away_team}",
    }

    return PredictionResult(
        home_team=home_team,
        away_team=away_team,
        predicted_label=pretty_label.get(raw.predicted_label, raw.predicted_label),
        probabilities=raw.probabilities,
        confidence=raw.confidence,
        used_fallback_for=raw.used_fallback_for,
        selected_edge_threshold=raw.selected_edge_threshold,
    )
