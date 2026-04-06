from __future__ import annotations

import glob
import json
import os
import pickle
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier

WINDOW = 20
REQUIRED_COLUMNS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
LABEL_MAP = {"H": 0, "D": 1, "A": 2}

# API team names -> historical dataset names
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

# Same post-match stats groups as in notebook
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


class NotebookMLPredictor:
    def __init__(self, datasets_dir: Path):
        self.datasets_dir = datasets_dir
        self.model: GradientBoostingClassifier | None = None
        self.feature_cols: list[str] = []
        self.x_cols: list[str] = []
        self.team_latest: dict[str, np.ndarray] = {}
        self.global_mean: np.ndarray | None = None
        self.ready = False
        self.artifacts_dir = self.datasets_dir.parent / "artifacts"
        self.model_artifact = self.artifacts_dir / "notebook_gb.pkl"
        self.metadata_artifact = self.artifacts_dir / "notebook_gb_metadata.json"

    def ensure_ready(self) -> None:
        if self.ready:
            return

        np.random.seed(42)

        df = self._load_raw()
        x, y, long_df = self._build_training_matrix(df=df)

        loaded = self._try_load_artifacts()
        if not loaded:
            # Best non-market model in notebook experiments.
            model = GradientBoostingClassifier(
                n_estimators=200,
                learning_rate=0.05,
                random_state=42,
            )
            model.fit(x, y)
            self.model = model
            self._save_artifacts()

        latest = (
            long_df.sort_values(["Team", "Date", "MatchIdx"])
            .groupby("Team", as_index=False)
            .tail(1)
        )

        self.team_latest = {}
        for _, row in latest.iterrows():
            team = normalize_team_name(str(row["Team"]))
            vals = row[self.feature_cols].astype(float).to_numpy(dtype=np.float32)
            self.team_latest[team] = vals

        self.global_mean = long_df[self.feature_cols].mean().fillna(0.0).to_numpy(dtype=np.float32)
        self.ready = True

    def _try_load_artifacts(self) -> bool:
        if not (self.model_artifact.exists() and self.metadata_artifact.exists()):
            return False

        metadata = json.loads(self.metadata_artifact.read_text(encoding="utf-8"))
        artifact_x_cols = metadata.get("x_cols")
        if artifact_x_cols != self.x_cols or metadata.get("model_type") != "GradientBoostingClassifier":
            return False

        with self.model_artifact.open("rb") as f:
            model = pickle.load(f)
        if not isinstance(model, GradientBoostingClassifier):
            return False
        self.model = model
        return True

    def _save_artifacts(self) -> None:
        assert self.model is not None
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

        with self.model_artifact.open("wb") as f:
            pickle.dump(self.model, f)

        metadata = {
            "model_type": "GradientBoostingClassifier",
            "x_cols": list(self.x_cols),
            "window": WINDOW,
        }
        self.metadata_artifact.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    def predict(self, home_team: str, away_team: str) -> NotebookPrediction:
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

        x_raw = np.concatenate([home_vec, away_vec], axis=0).reshape(1, -1).astype(np.float32)
        probs = self.model.predict_proba(x_raw)[0]

        label_idx = int(np.argmax(probs))
        labels = ["HomeWin", "Draw", "AwayWin"]
        prob_map = {labels[i]: float(probs[i]) for i in range(3)}

        return NotebookPrediction(
            predicted_label=labels[label_idx],
            probabilities=prob_map,
            confidence=float(probs[label_idx]),
            used_fallback_for=fallback,
        )

    def _load_raw(self) -> pd.DataFrame:
        csv_files = sorted(glob.glob(str(self.datasets_dir / "*.csv")))
        if not csv_files:
            raise RuntimeError(f"No CSV files found in {self.datasets_dir}")

        dfs = []
        for path in csv_files:
            df = pd.read_csv(path, low_memory=False)
            missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
            if missing:
                continue
            df["SeasonFile"] = os.path.basename(path)
            dfs.append(df)

        if not dfs:
            raise RuntimeError("No valid CSV files for notebook model training")

        df = pd.concat(dfs, ignore_index=True)
        df["Date"] = parse_dates(df["Date"])
        df = df.dropna(subset=["Date", "HomeTeam", "AwayTeam", "FTR"]).copy()

        if "Time" in df.columns:
            df = df.sort_values(["Date", "Time"], na_position="last").reset_index(drop=True)
        else:
            df = df.sort_values(["Date"], na_position="last").reset_index(drop=True)

        df["y"] = df["FTR"].map(LABEL_MAP)
        df = df.dropna(subset=["y"]).copy()
        df["y"] = df["y"].astype(int)
        return df

    def _build_training_matrix(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
        available = set(df.columns)
        usable_keys = [k for k, (h, a) in POST_MATCH_COLS.items() if h in available and a in available]

        def home_points(ftr: str) -> int:
            return 3 if ftr == "H" else 1 if ftr == "D" else 0

        def away_points(ftr: str) -> int:
            return 3 if ftr == "A" else 1 if ftr == "D" else 0

        df = df.copy()
        df["HomePts"] = df["FTR"].apply(home_points)
        df["AwayPts"] = df["FTR"].apply(away_points)

        rows = []
        for idx, r in df.iterrows():
            rec_h = {
                "MatchIdx": idx,
                "Date": r["Date"],
                "Team": normalize_team_name(str(r["HomeTeam"])),
                "IsHome": 1,
                "Pts": r["HomePts"],
            }
            rec_a = {
                "MatchIdx": idx,
                "Date": r["Date"],
                "Team": normalize_team_name(str(r["AwayTeam"])),
                "IsHome": 0,
                "Pts": r["AwayPts"],
            }

            for k in usable_keys:
                home_col, away_col = POST_MATCH_COLS[k]
                rec_h[k] = pd.to_numeric(r.get(home_col), errors="coerce")
                rec_a[k] = pd.to_numeric(r.get(away_col), errors="coerce")

            rows.append(rec_h)
            rows.append(rec_a)

        long_df = pd.DataFrame(rows).sort_values(["Team", "Date", "MatchIdx"]).reset_index(drop=True)

        self.feature_cols = []
        for col in ["Pts"] + usable_keys:
            roll_col = f"{col}_roll{WINDOW}"
            long_df[roll_col] = (
                long_df.groupby("Team")[col]
                .apply(lambda s: s.shift(1).rolling(WINDOW, min_periods=1).mean())
                .reset_index(level=0, drop=True)
            )
            self.feature_cols.append(roll_col)

        long_df[self.feature_cols] = long_df[self.feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)

        home_feats = long_df[long_df["IsHome"] == 1][["MatchIdx"] + self.feature_cols].copy().add_prefix("H_")
        away_feats = long_df[long_df["IsHome"] == 0][["MatchIdx"] + self.feature_cols].copy().add_prefix("A_")

        match_feats = df.copy()
        match_feats = match_feats.merge(home_feats, left_index=True, right_on="H_MatchIdx", how="left")
        match_feats = match_feats.merge(away_feats, left_index=True, right_on="A_MatchIdx", how="left")
        match_feats = match_feats.drop(columns=["H_MatchIdx", "A_MatchIdx"], errors="ignore")

        self.x_cols = [c for c in match_feats.columns if c.startswith("H_") or c.startswith("A_")]
        match_feats[self.x_cols] = match_feats[self.x_cols].fillna(0.0)

        x = match_feats[self.x_cols].values.astype(np.float32)
        y = match_feats["y"].values.astype(np.int64)
        return x, y, long_df


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
