# Frontend (React + Vite)

## 1) Install

```bash
cd frontend
npm install
```

## 2) Configure API URL

```bash
cp .env.example .env
```

By default:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## 3) Run

```bash
npm run dev
```

Open `http://127.0.0.1:5173`.

## Backend requirements

- Backend should run on `http://127.0.0.1:8000`
- `backend/.env` must contain `API_FOOTBALL_KEY=...`
- Optional CORS origin in backend `.env`:

```env
FRONTEND_ORIGIN=http://127.0.0.1:5173
```
