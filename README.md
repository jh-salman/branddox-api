# branddox-api

Express + Prisma + PostgreSQL API for Branddox (leads, auth, n8n webhook).

## Local PostgreSQL

Pick one:

### A) Docker (quickest)

```bash
docker compose up -d
cp .env.example .env
# DATABASE_URL should match docker-compose.yml (postgres/postgres, db: branddox)
```

### B) Postgres.app / Homebrew / system install

1. Create a database user and database, e.g. `branddox`.
2. Set `DATABASE_URL` in `.env`, for example:

```text
postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/branddox
```

No `?sslmode=require` needed for typical local installs.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: DATABASE_URL (local or remote), optional N8N_WEBHOOK_URL, CLOUDINARY_*, etc.
npx prisma generate
npx prisma migrate dev
npm run dev
```

## Env

- `DATABASE_URL` – PostgreSQL connection string (local or hosted)
- `PORT` – default 4000
- `N8N_WEBHOOK_URL` – optional; forwards new leads to n8n
- `AUTH_SECRET` – for auth

## Endpoints

- `GET /health`
- `GET /api` – endpoint list
- `POST /auth/register`, `POST /auth/login`
- `GET /leads`, `GET /leads/stats`, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id`, `DELETE /leads/:id`
