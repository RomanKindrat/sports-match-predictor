from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm import aliased

from app.core.db import get_db
from app.models import Match, Prediction, Team, User
from app.services.prediction_facade import get_prediction_facade
from app.services.storage_service import sync_history_match_results
from app.services.auth_service import (
    change_user_password,
    decode_access_token,
    login_user,
    logout_user,
    register_user,
    resend_verification_code,
    update_user_name,
    verify_email_code,
)

load_dotenv()

app = FastAPI(title="Sports Match Predictor")
auth_scheme = HTTPBearer(auto_error=False)

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    confirm_password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ResendCodeRequest(BaseModel):
    email: str


class UpdateProfileRequest(BaseModel):
    name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str


def _get_current_user(
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user_id = int(payload.get("sub"))
    token_version = int(payload.get("ver", -1))
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if token_version != user.auth_version:
        raise HTTPException(status_code=401, detail="Token revoked")
    return user


def _get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> User | None:
    if credentials is None:
        return None
    try:
        return _get_current_user(credentials=credentials, db=db)
    except HTTPException:
        return None


@app.get("/")
def index() -> dict:
    return {"service": "sports-match-predictor-api", "status": "ok"}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register")
def auth_register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    try:
        if payload.password != payload.confirm_password:
            raise ValueError("Password and confirm password do not match")

        result = register_user(
            db=db,
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
        response = {
            "message": result.message,
            "email": payload.email,
            "expires_at": result.expires_at.isoformat(),
        }
        if result.dev_code:
            response["dev_code"] = result.dev_code
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Registration failed: {exc}") from exc


@app.post("/api/auth/verify-email")
def auth_verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    try:
        verify_email_code(db=db, email=payload.email, code=payload.code.strip())
        return {"message": "Email verified"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}") from exc


@app.post("/api/auth/resend-code")
def auth_resend_code(payload: ResendCodeRequest, db: Session = Depends(get_db)) -> dict:
    try:
        result = resend_verification_code(db=db, email=payload.email)
        response = {
            "message": result.message,
            "email": payload.email,
            "expires_at": result.expires_at.isoformat(),
        }
        if result.dev_code:
            response["dev_code"] = result.dev_code
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Resend failed: {exc}") from exc


@app.post("/api/auth/login")
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    try:
        result = login_user(db=db, email=payload.email, password=payload.password)
        return {
            "access_token": result.access_token,
            "token_type": result.token_type,
            "redirect_to": result.redirect_to,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Login failed: {exc}") from exc


@app.post("/api/auth/logout")
def auth_logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_current_user(credentials=credentials, db=db)
    logout_user(db=db, user=user)
    return {"message": "Logged out"}


@app.get("/api/auth/me")
def auth_me(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_current_user(credentials=credentials, db=db)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@app.patch("/api/auth/profile")
def auth_update_profile(
    payload: UpdateProfileRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_current_user(credentials=credentials, db=db)
    try:
        updated = update_user_name(db=db, user=user, name=payload.name)
        return {
            "id": updated.id,
            "name": updated.name,
            "email": updated.email,
            "is_verified": updated.is_verified,
            "is_active": updated.is_active,
            "created_at": updated.created_at.isoformat() if updated.created_at else None,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Profile update failed: {exc}") from exc


@app.post("/api/auth/change-password")
def auth_change_password(
    payload: ChangePasswordRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_current_user(credentials=credentials, db=db)
    try:
        if payload.new_password != payload.confirm_new_password:
            raise ValueError("New password and confirm password do not match")
        change_user_password(
            db=db,
            user=user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
        return {"message": "Password updated. Please login again."}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Change password failed: {exc}") from exc


@app.get("/api/history")
def api_history(
    limit: int = Query(200, ge=1, le=500),
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_current_user(credentials=credentials, db=db)
    try:
        sync_history_match_results(db, user_id=user.id, league=152)
    except Exception:
        # Do not fail history page if provider is temporarily unavailable.
        pass
    home_alias = aliased(Team)
    away_alias = aliased(Team)

    rows = (
        db.query(Prediction, Match, home_alias, away_alias)
        .join(Match, Prediction.match_id == Match.id)
        .join(home_alias, Match.home_team_id == home_alias.id)
        .join(away_alias, Match.away_team_id == away_alias.id)
        .filter(Prediction.user_id == user.id)
        .order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .limit(limit)
        .all()
    )

    items = []
    seen_match_ids: set[int] = set()
    for pred, match, home_team, away_team in rows:
        if match.id in seen_match_ids:
            continue
        seen_match_ids.add(match.id)
        pred_result = "Нічия" if pred.pred_label == "D" else f"Перемога {home_team.name if pred.pred_label == 'H' else away_team.name}"
        items.append(
            {
                "id": f"db-{pred.id}",
                "prediction_id": pred.id,
                "fixture_id": match.fixture_id or str(match.id),
                "home_team": home_team.name,
                "away_team": away_team.name,
                "kickoff": match.date.isoformat() if match.date else None,
                "venue": match.venue,
                "match_status": match.status,
                "saved_at": pred.created_at.isoformat() if pred.created_at else None,
                "predicted_result": pred_result,
                "predicted_outcome": pred.pred_label,
                "confidence": max(pred.p_home, pred.p_draw, pred.p_away),
                "probabilities": {
                    "HomeWin": pred.p_home,
                    "Draw": pred.p_draw,
                    "AwayWin": pred.p_away,
                },
                "value_edge": pred.value_edge,
                "odds_home": match.odds_home,
                "odds_draw": match.odds_draw,
                "odds_away": match.odds_away,
                "bookmaker_probs": {
                    "HomeWin": pred.bookmaker_p_home,
                    "Draw": pred.bookmaker_p_draw,
                    "AwayWin": pred.bookmaker_p_away,
                },
                "final_home_goals": match.home_goals,
                "final_away_goals": match.away_goals,
            }
        )

    return {"items": items}


@app.get("/api/matches/upcoming")
def matches_upcoming(
    league: int = Query(152, description="League id, default 152 for APL in AllSports"),
    season: int | None = Query(None, description="Season start year, e.g. 2025"),
    limit: int = Query(240, ge=1, le=380),
    db: Session = Depends(get_db),
) -> dict:
    try:
        facade = get_prediction_facade()
        response = facade.get_upcoming_matches(league=league, season=season, limit=limit, db=db)
        return {
            "league": response.league,
            "season": response.season,
            "matches": response.matches,
            "note": response.note,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch upcoming matches: {exc}") from exc


@app.get("/api/predict")
def predict_match(
    home_team: str = Query(..., min_length=2),
    away_team: str = Query(..., min_length=2),
    fixture_id: str | None = Query(None),
    league: int | None = Query(None),
    season: int | None = Query(None),
    kickoff: str | None = Query(None),
    timezone: str | None = Query(None),
    status: str | None = Query(None),
    venue: str | None = Query(None),
    odds_home: float | None = Query(None),
    odds_draw: float | None = Query(None),
    odds_away: float | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> dict:
    try:
        facade = get_prediction_facade()
        user = _get_optional_current_user(credentials=credentials, db=db)
        return facade.predict_match(
            home_team=home_team,
            away_team=away_team,
            season=season,
            fixture_id=fixture_id,
            kickoff=kickoff,
            league=league,
            venue=venue,
            status=status,
            kickoff_tz=timezone,
            odds_home=odds_home,
            odds_draw=odds_draw,
            odds_away=odds_away,
            db=db,
            user_id=user.id if user else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc


@app.get("/api/standings")
def standings(
    league: int = Query(..., description="League id, e.g. 39"),
    season: int = Query(..., description="Season year, e.g. 2025"),
    team: int | None = Query(None, description="Optional team id"),
) -> dict:
    try:
        facade = get_prediction_facade()
        return facade.standings(league=league, season=season, team=team)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch standings: {exc}") from exc
