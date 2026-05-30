from __future__ import annotations

import glob
import json
import os
import pickle
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
REQUIRED_COLUMNS = ["Date", "HomeTeam", "AwayTeam", "FTR"]
LABEL_MAP = {"H": 0, "D": 1, "A": 2}

INITIAL_ELO = 1500.0
ELO_K = 20.0
ELO_HOME_ADVANTAGE = 100.0
EDGE_FALLBACK = 0.10
BOOK_COLS = ["BookProbH", "BookProbD", "BookProbA", "BookOverround"]

TEAM_ALIASES = {
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Newcastle United": "Newcastle",
    "Nottingham Forest": "Nott'm Forest",
    "Tottenham Hotspur": "Tottenham",
    "Wolverhampton Wanderers": "Wolves",
    "West Ham United": "West Ham",
    "Leicester City": "Leicester",
    "Leeds United": "Leeds",
    "AFC Bournemouth": "Bournemouth",
    "Brighton & Hove Albion": "Brighton",
    "Sheffield Utd": "Sheffield United",
    "Nottingham": "Nott'm Forest",
}

POST_MATCH_COLS = {
    "goals_for": ("FTHG", "FTAG"),
    "goals_against": ("FTAG", "FTHG"),
    "shots_for": ("HS", "AS"),
    "shots_against": ("AS", "HS"),
    "shotsT_for": ("HST", "AST"),
    "shotsT_against": ("AST", "HST"),
    "corners_for": ("HC", "AC"),
    "corners_against": ("AC", "HC"),
    "fouls_for": ("HF", "AF"),
    "fouls_against": ("AF", "HF"),
    "yellow_for": ("HY", "AY"),
    "yellow_against": ("AY", "HY"),
    "red_for": ("HR", "AR"),
    "red_against": ("AR", "HR"),
}


@dataclass
class NotebookPrediction:
    predicted_label: str
    probabilities: dict[str, float]
    confidence: float
    used_fallback_for: list[str]
    selected_edge_threshold: float


class NotebookMLPredictor:
    def __init__(self, datasets_dir: Path):
        self.datasets_dir = datasets_dir

        self.model = None
        self.best_model_name: str = "GradientBoosting"
        self.best_window: int = 20
        self.best_edge: float = EDGE_FALLBACK

        self.roll_feature_cols: list[str] = []
        self.x_cols_before_corr: list[str] = []
        self.x_cols: list[str] = []

        self.team_latest: dict[str, np.ndarray] = {}
        self.team_elo_latest: dict[str, float] = {}
        self.global_mean: np.ndarray | None = None
        self.global_elo: float = INITIAL_ELO

        self.ready = False
        self.artifacts_dir = self.datasets_dir.parent / "artifacts"
        self.model_artifact = self.artifacts_dir / "notebook_gb.pkl"
        self.metadata_artifact = self.artifacts_dir / "notebook_gb_metadata.json"
        self._artifacts_mtime: float | None = None

    def ensure_ready(self) -> None:
        if self.ready:
            return

        loaded = self._try_load_artifacts()
        if not loaded:
            raise RuntimeError(
                "Model artifacts not found or incompatible. "
                "Train in Jupyter and save notebook_gb.pkl + notebook_gb_metadata.json first."
            )

        df = self._load_raw()
        self._refresh_team_elo_latest(df)
        self._refresh_team_latest_rollups(df)

        self._artifacts_mtime = self._get_artifacts_mtime()
        self.ready = True

    def predict(
        self,
        home_team: str,
        away_team: str,
        odds_home: float | None = None,
        odds_draw: float | None = None,
        odds_away: float | None = None,
    ) -> NotebookPrediction:
        self._refresh_if_artifacts_changed()
        self.ensure_ready()

        assert self.model is not None
        assert self.global_mean is not None

        home_norm = normalize_team_name(home_team)
        away_norm = normalize_team_name(away_team)

        fallback: list[str] = []
        home_vec = self.team_latest.get(home_norm)
        away_vec = self.team_latest.get(away_norm)

        if home_vec is None:
            home_vec = self.global_mean
            fallback.append(home_team)
        if away_vec is None:
            away_vec = self.global_mean
            fallback.append(away_team)

        elo_home = float(self.team_elo_latest.get(home_norm, self.global_elo))
        elo_away = float(self.team_elo_latest.get(away_norm, self.global_elo))
        elo_diff = elo_home - elo_away

        feats: dict[str, float] = {}
        for i, c in enumerate(self.roll_feature_cols):
            feats[f"H_{c}"] = float(home_vec[i])
            feats[f"A_{c}"] = float(away_vec[i])

        feats["EloHome"] = elo_home
        feats["EloAway"] = elo_away
        feats["EloDiff"] = elo_diff

        if all(c in self.x_cols for c in BOOK_COLS):
            bph, bpd, bpa, over = self._book_probs_from_direct_odds(odds_home, odds_draw, odds_away)
            feats["BookProbH"] = bph
            feats["BookProbD"] = bpd
            feats["BookProbA"] = bpa
            feats["BookOverround"] = over

        x_row = np.array([feats.get(c, 0.0) for c in self.x_cols], dtype=np.float32).reshape(1, -1)
        probs = self.model.predict_proba(x_row)[0]

        labels = ["HomeWin", "Draw", "AwayWin"]
        idx = int(np.argmax(probs))
        prob_map = {labels[i]: float(probs[i]) for i in range(3)}

        return NotebookPrediction(
            predicted_label=labels[idx],
            probabilities=prob_map,
            confidence=float(probs[idx]),
            used_fallback_for=fallback,
            selected_edge_threshold=float(self.best_edge),
        )

    def _try_load_artifacts(self) -> bool:
        if not (self.model_artifact.exists() and self.metadata_artifact.exists()):
            return False

        metadata = json.loads(self.metadata_artifact.read_text(encoding="utf-8"))
        artifact_x_cols = metadata.get("x_cols")
        artifact_roll_cols = metadata.get("roll_feature_cols")
        artifact_model_name = metadata.get("best_model_name")

        if (
            not artifact_x_cols
            or not artifact_roll_cols
            or not artifact_model_name
            or metadata.get("pipeline_variant") != "UNTITLED_NO_ABLATION"
        ):
            return False

        with self.model_artifact.open("rb") as f:
            model = pickle.load(f)
        if not hasattr(model, "predict_proba"):
            return False

        self.model = model
        self.best_model_name = str(artifact_model_name)
        self.x_cols = list(artifact_x_cols)
        self.roll_feature_cols = list(artifact_roll_cols)
        self.x_cols_before_corr = list(metadata.get("x_cols_before_corr", self.x_cols))
        self.best_window = int(metadata.get("best_window", 20))
        self.best_edge = float(metadata.get("best_edge", EDGE_FALLBACK))
        return True

    def _refresh_if_artifacts_changed(self) -> None:
        current = self._get_artifacts_mtime()
        if self._artifacts_mtime is None or current is None or current <= self._artifacts_mtime:
            return

        self.ready = False
        self.model = None
        self.best_model_name = "GradientBoosting"
        self.best_window = 20
        self.best_edge = EDGE_FALLBACK
        self.roll_feature_cols = []
        self.x_cols_before_corr = []
        self.x_cols = []
        self.team_latest = {}
        self.team_elo_latest = {}
        self.global_mean = None
        self.global_elo = INITIAL_ELO

    def _get_artifacts_mtime(self) -> float | None:
        if not (self.model_artifact.exists() and self.metadata_artifact.exists()):
            return None
        return max(self.model_artifact.stat().st_mtime, self.metadata_artifact.stat().st_mtime)

    def _load_raw(self) -> pd.DataFrame:
        csv_files = sorted(glob.glob(str(self.datasets_dir / "*.csv")))
        if not csv_files:
            raise RuntimeError(f"No CSV files found in {self.datasets_dir}")

        dfs: list[pd.DataFrame] = []
        for path in csv_files:
            try:
                dfi = pd.read_csv(path, low_memory=False)
            except Exception:
                continue

            missing = [c for c in REQUIRED_COLUMNS if c not in dfi.columns]
            if missing:
                continue

            dfi.columns = [str(c).strip() for c in dfi.columns]
            dfi["SeasonFile"] = os.path.basename(path)
            dfs.append(dfi)

        if not dfs:
            raise RuntimeError("No valid CSV files for notebook model")

        df = pd.concat(dfs, ignore_index=True)
        df["Date"] = parse_dates(df["Date"])
        df = df.dropna(subset=["Date", "HomeTeam", "AwayTeam", "FTR"]).copy()

        if "Time" in df.columns:
            df = df.sort_values(["Date", "Time"], na_position="last").reset_index(drop=True)
        else:
            df = df.sort_values(["Date"], na_position="last").reset_index(drop=True)

        df["y"] = df["FTR"].map(LABEL_MAP)
        df = df.dropna(subset=["y"]).copy()
        df["y"] = df["y"].astype(np.int64)
        return df

    def _refresh_team_latest_rollups(self, df: pd.DataFrame) -> None:
        long_df = self._build_long_table_with_rollups(df, self.best_window, self.roll_feature_cols)

        latest = long_df.sort_values(["Team", "Date", "MatchIdx"]).groupby("Team", as_index=False).tail(1)

        self.team_latest = {}
        for _, row in latest.iterrows():
            team = normalize_team_name(str(row["Team"]))
            vals = row[self.roll_feature_cols].astype(float).to_numpy(dtype=np.float32)
            self.team_latest[team] = vals

        self.global_mean = long_df[self.roll_feature_cols].mean().fillna(0.0).to_numpy(dtype=np.float32)

    def _build_long_table_with_rollups(self, df: pd.DataFrame, window: int, roll_cols: list[str]) -> pd.DataFrame:
        dfx = df.copy().sort_values("Date").reset_index(drop=True)

        dfx["HomePts"] = np.select([dfx["FTR"] == "H", dfx["FTR"] == "D"], [3, 1], default=0)
        dfx["AwayPts"] = np.select([dfx["FTR"] == "A", dfx["FTR"] == "D"], [3, 1], default=0)

        # roll col like "shots_for_roll25" -> base "shots_for"
        bases: list[str] = []
        for rc in roll_cols:
            m = re.match(r"^(.*)_roll\d+$", rc)
            if m:
                bases.append(m.group(1))

        rows = []
        for idx, r in dfx.iterrows():
            home = normalize_team_name(str(r["HomeTeam"]))
            away = normalize_team_name(str(r["AwayTeam"]))

            rec_h = {"MatchIdx": idx, "Date": r["Date"], "Team": home, "IsHome": 1}
            rec_a = {"MatchIdx": idx, "Date": r["Date"], "Team": away, "IsHome": 0}

            for base in bases:
                if base == "Pts":
                    rec_h[base] = r["HomePts"]
                    rec_a[base] = r["AwayPts"]
                    continue

                cols = POST_MATCH_COLS.get(base)
                if cols is None:
                    rec_h[base] = np.nan
                    rec_a[base] = np.nan
                    continue

                hcol, acol = cols
                rec_h[base] = pd.to_numeric(r.get(hcol), errors="coerce")
                rec_a[base] = pd.to_numeric(r.get(acol), errors="coerce")

            rows.extend([rec_h, rec_a])

        long_df = pd.DataFrame(rows).sort_values(["Team", "Date", "MatchIdx"]).reset_index(drop=True)

        for rc in roll_cols:
            m = re.match(r"^(.*)_roll(\d+)$", rc)
            if not m:
                long_df[rc] = 0.0
                continue

            base = m.group(1)
            w = int(m.group(2))

            if base not in long_df.columns:
                long_df[rc] = 0.0
                continue

            long_df[rc] = (
                long_df.groupby("Team")[base]
                .apply(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
                .reset_index(level=0, drop=True)
            )

        long_df[roll_cols] = long_df[roll_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
        return long_df

    def _refresh_team_elo_latest(self, df: pd.DataFrame) -> None:
        elo: dict[str, float] = {}
        for _, row in df.iterrows():
            home = normalize_team_name(str(row["HomeTeam"]))
            away = normalize_team_name(str(row["AwayTeam"]))

            h_rating = float(elo.get(home, INITIAL_ELO))
            a_rating = float(elo.get(away, INITIAL_ELO))

            expected_home = 1.0 / (1.0 + 10.0 ** ((a_rating - (h_rating + ELO_HOME_ADVANTAGE)) / 400.0))
            if row["FTR"] == "H":
                score_home = 1.0
            elif row["FTR"] == "D":
                score_home = 0.5
            else:
                score_home = 0.0

            elo[home] = h_rating + ELO_K * (score_home - expected_home)
            elo[away] = a_rating + ELO_K * ((1.0 - score_home) - (1.0 - expected_home))

        self.team_elo_latest = elo
        self.global_elo = float(np.mean(list(elo.values()))) if elo else INITIAL_ELO

    def _book_probs_from_direct_odds(
        self,
        odds_home: float | None,
        odds_draw: float | None,
        odds_away: float | None,
    ) -> tuple[float, float, float, float]:
        if (
            odds_home is None
            or odds_draw is None
            or odds_away is None
            or odds_home <= 1.0
            or odds_draw <= 1.0
            or odds_away <= 1.0
        ):
            return 0.0, 0.0, 0.0, 0.0

        inv_h = 1.0 / float(odds_home)
        inv_d = 1.0 / float(odds_draw)
        inv_a = 1.0 / float(odds_away)
        inv_sum = inv_h + inv_d + inv_a
        if inv_sum <= 0:
            return 0.0, 0.0, 0.0, 0.0

        return float(inv_h / inv_sum), float(inv_d / inv_sum), float(inv_a / inv_sum), float(inv_sum - 1.0)


def normalize_team_name(team: str) -> str:
    cleaned = " ".join(str(team).strip().split())
    return TEAM_ALIASES.get(cleaned, cleaned)


def parse_dates(series: pd.Series) -> pd.Series:
    try:
        return pd.to_datetime(series, format="mixed", dayfirst=True, errors="coerce")
    except (TypeError, ValueError):
        return pd.to_datetime(series, dayfirst=True, errors="coerce")


@lru_cache(maxsize=1)
def get_notebook_predictor(datasets_dir: Path) -> NotebookMLPredictor:
    predictor = NotebookMLPredictor(datasets_dir=datasets_dir)
    predictor.ensure_ready()
    return predictor
