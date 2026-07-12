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

### YouTube Channel Finder (admin — requires `x-admin-secret`)

- `POST /youtube/search-channels` – discover channels by keyword with country, subscriber range, sort order, and "only with email" filters. Enriches each result with subscriber/video/view counts, country, thumbnail, and any email found in the public channel description.

  ```jsonc
  // request
  { "query": "personal finance", "country": "US", "minSubscribers": 1000,
    "maxSubscribers": 500000, "order": "viewCount", "maxResults": 50, "onlyWithEmail": true }
  // response
  { "channels": [ /* ChannelSearchRow[] */ ], "total": 42, "discovered": 50,
    "enriched": 50, "withEmail": 18, "quotaCost": 200 }
  ```

- `POST /youtube/save-leads` – bulk-save selected channels as leads. Deduped by `channelId` (falls back to `channelUrl` per source).

  ```jsonc
  { "leadSource": "youtube_search",
    "channels": [ { "channelId": "UC...", "channelUrl": "https://...", "title": "...",
                    "email": "hi@x.com", "subscriberCount": 12000, "country": "US" } ] }
  ```

> Search quota: ~100 YouTube Data API units per 50 channels (default daily quota is 10,000).
> Emails come from the public channel description only — the CAPTCHA-protected "business email"
> shown in YouTube's UI is not available via any API.

### Campaigns (admin — requires `x-admin-secret`)

AI-assisted cold outreach. For each selected lead, OpenAI picks the best-fit **service** from your
catalog and drafts a personalized subject + body. You review/edit every draft, approve the ones you
want, then send via your own SMTP inbox (throttled to protect sender reputation).

- `GET /campaigns/config` – returns `{ openai, smtp }` (whether each is configured).
- `POST /campaigns/verify-smtp` – test SMTP credentials/connection.
- `POST /campaigns` – create a campaign; drafts a best-fit service + email per lead.

  ```jsonc
  // request
  { "leadIds": ["clx...", "cly..."], "name": "HVAC – Feb" }
  // response: Campaign + recipients[] (each with recommendedService, aiReason, confidence, subject, body, status)
  ```

- `GET /campaigns`, `GET /campaigns/:id`
- `PATCH /campaigns/:id/recipients/:recipientId` – edit `subject`/`body` or set `status` (`draft`|`approved`|`skipped`).
- `POST /campaigns/:id/recipients/:recipientId/deep` – re-draft one recipient with the stronger model + the channel's recent video titles ("Deep analyze").
- `POST /campaigns/:id/send` – send all `approved` recipients via SMTP (capped at `SMTP_MAX_PER_RUN`, `SMTP_THROTTLE_MS` between each). Marks each `sent`/`failed` and flips the lead to `contacted`.

Env: `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, `OPENAI_DEEP_MODEL`), and SMTP
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`SMTP_MAX_PER_RUN`, `SMTP_THROTTLE_MS`). For Gmail, use an **App Password**.

> Drafts are never auto-sent — you approve each one first. Every email gets a plain-text opt-out
> line appended for deliverability/compliance.
