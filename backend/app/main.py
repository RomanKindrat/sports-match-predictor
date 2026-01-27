from fastapi import FastAPI

app = FastAPI(title="MatchPredict AI")

@app.get("/")
def root():
    return {"status": "ok", "message": "MatchPredict AI backend is running"}
