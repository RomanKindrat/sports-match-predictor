from fastapi import FastAPI
from sqlalchemy import text
from app.core.db import engine

app = FastAPI(title="Sports Match Predictor")

@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"db": "ok"}
