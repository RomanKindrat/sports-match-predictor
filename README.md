# Sports Match Predictor

Information system for predicting football match outcomes. The application
provides upcoming match data, generates probabilities for home win, draw and
away win, stores prediction history and evaluates completed predictions.

## Main Features

- user registration, email verification and authentication;
- viewing upcoming football matches;
- match outcome prediction using a saved machine learning model;
- comparison of model probabilities with bookmaker probabilities;
- personal prediction history and analytics;
- integration with an external sports data API;
- automated backend and frontend tests.

## Project Structure

```text
backend/        FastAPI server, database models, services and migrations
frontend/       React client application
model/          historical datasets, Jupyter Notebook and ML artifacts
tests/          backend and frontend tests
scripts/        shared utility scripts
docker-compose.yml
```

## Technology Stack

- Backend: Python, FastAPI, Uvicorn, SQLAlchemy, Alembic
- Frontend: JavaScript, React, Vite
- Database: PostgreSQL
- Machine learning: pandas, NumPy, scikit-learn, joblib
- Testing: pytest, pytest-cov, Vitest
- Containerization: Docker, Docker Compose

## Environment Configuration

The backend reads its configuration from `backend/.env`. At minimum, configure
the database connection and the external sports API key:

```env
DATABASE_URL=postgresql+psycopg://sports:sports@localhost:5433/sports_ai
API_FOOTBALL_KEY=your_api_key
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

Email verification can be configured with the following variables:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_USE_TLS=true
AUTH_DEV_EXPOSE_CODE=true
```

`AUTH_DEV_EXPOSE_CODE` may expose the verification code in development
responses. It must be disabled in a production environment.

The frontend API URL is configured in `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Do not commit files containing real secrets.

## Run with Docker Compose

Ensure that Docker is running and `backend/.env` is configured, then execute:

```bash
docker compose up --build
```

The services will be available at:

- frontend: `http://localhost:5173`;
- backend API: `http://localhost:8000`;
- PostgreSQL: `localhost:5433`.

Database migrations are applied automatically before the backend starts.

Stop the services with:

```bash
docker compose down
```

## Local Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Testing

Run backend tests:

```bash
backend/.venv/bin/python backend/scripts/run_tests_with_coverage.py
```

Run frontend tests:

```bash
npm run test --prefix frontend
```

Run backend and frontend coverage checks with one command:

```bash
npm run test:coverage
```

## Machine Learning Artifacts

Historical datasets and the experimental Jupyter Notebook are stored in
`model/`. The backend uses saved artifacts from `model/artifacts/` to generate
predictions without retraining the model for each request.
