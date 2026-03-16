# branddox-api

Express + Prisma + PostgreSQL API for Branddox (leads, auth, n8n webhook).

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: DATABASE_URL, N8N_WEBHOOK_URL (optional)
npx prisma generate
npx prisma migrate dev
npm run dev
```

## Env

- `DATABASE_URL` – PostgreSQL connection string
- `PORT` – default 4000
- `N8N_WEBHOOK_URL` – optional; forwards new leads to n8n
- `AUTH_SECRET` – for auth

## Endpoints

- `GET /health`
- `GET /api` – endpoint list
- `POST /auth/register`, `POST /auth/login`
- `GET /leads`, `GET /leads/stats`, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id`, `DELETE /leads/:id`
