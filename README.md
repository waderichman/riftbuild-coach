# RiftBuild Coach

Statistical League of Legends build recommendations based on ingested Riot match data.

## Overview

RiftBuild Coach is a Next.js web app where a user picks:
- Their champion and role
- The 5 enemy champions and roles

The backend returns:
- Best build recommendations (items + runes)
- Confidence and sample size
- "Why this build" explanations

Recommendations are primarily read from aggregated DB data (`recommendation_agg`) and fall back to rule-based logic when no strong statistical match is available.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Neon Postgres
- Riot API (match + league endpoints)
- Vercel Cron Jobs

## Features

- Champion picker from Data Dragon (`/api/champions`)
- Role-aware and comp-aware recommendation lookup
- Exact comp-key matching when available
- Nearest bucket fallback when exact match is sparse
- “Why this build” explanation lines
- DB-backed recommendation store (no runtime dependency on giant JSON files)
- Daily automated ingestion/aggregation via Vercel cron
- Basic legal pages (`/about`, `/privacy`, `/terms`, `/how-it-works`)

## API Routes

- `GET /api/health`
- `GET /api/champions`
- `GET /api/assets`
- `POST /api/recommend`
- `GET /api/cron/ingest` (auth required)
- `GET /api/cron/aggregate` (auth required)

## Database Schema

Run `db/schema.sql` to create:

- `recommendation_agg`
- `job_locks`
- `cron_state`

`recommendation_agg` is keyed for upsert on:
`(patch, champion, feature_bucket, comp_key, role, rank_tier, title)`

## Environment Variables

Copy `.env.example` to `.env` and fill values.

### Core
- `PORT`
- `PATCH_VERSION`
- `RIOT_API_KEY`
- `RIOT_REGION`
- `RIOT_PLATFORM`

### Postgres / Neon
- `DATABASE_URL` (pooled, app runtime)
- `DATABASE_URL_UNPOOLED` (migrations/manual SQL)

### Cron Security
- `CRON_SECRET`

### Ingestion
- `RIOT_SEED_PUUIDS`
- `RIOT_QUEUE`
- `RIOT_MIN_GAMES`
- `RIOT_CRON_SEEDS_PER_RUN`
- `RIOT_CRON_MATCHES_PER_SEED`
- `RIOT_CRON_ALLOW_QUEUE_FALLBACK`

### Seed Discovery Script
- `RIOT_SEED_QUEUE`
- `RIOT_SEED_PLATFORMS`
- `RIOT_SEED_LIMIT`
- `RIOT_SEED_TIERS`
- `RIOT_SEED_DELAY_MS`
- `RIOT_SEED_MAX_RETRIES`

## Local Setup

1. Install deps
```bash
npm install
```

2. Generate seed PUUIDs
```bash
npm run seed:puuids
```

3. Put generated CSV from `data/seed-puuids.txt` into `RIOT_SEED_PUUIDS`.

4. (Optional) Build JSON dataset locally
```bash
npm run ingest:riot
```

5. Sync local JSON recommendations to DB
```bash
npm run sync:db
```

6. Run app
```bash
npm run dev
```

## Manual Cron Trigger (for testing)

PowerShell:

```powershell
$h = @{ Authorization = "Bearer YOUR_CRON_SECRET" }

1..5 | ForEach-Object {
  Invoke-RestMethod -Method Get -Headers $h "https://YOUR-DOMAIN/api/cron/ingest"
  Start-Sleep -Seconds 2
}

Invoke-RestMethod -Method Get -Headers $h "https://YOUR-DOMAIN/api/cron/aggregate"
```

## Vercel Cron Schedule

From `vercel.json`:

- `/api/cron/ingest` -> `0 2 * * *` (02:00 UTC daily)
- `/api/cron/aggregate` -> `30 2 * * *` (02:30 UTC daily)

## Deployment Checklist (Vercel + Neon)

1. Create Neon DB and run `db/schema.sql`.
2. Set Vercel production env vars:
- `DATABASE_URL`
- `RIOT_API_KEY`
- `RIOT_SEED_PUUIDS`
- `CRON_SECRET`
- optional ingestion tuning vars
3. Deploy.
4. Manually hit ingest/aggregate once.
5. Verify DB growth:
```sql
select count(*) as rows, sum(sample_size) as total_samples, max(updated_at) as last_update
from recommendation_agg;
```

## How Data Flows

1. Seed PUUID list (`RIOT_SEED_PUUIDS`) is used as crawler entry points.
2. Ingest cron fetches match IDs and match payloads from Riot.
3. Match data is transformed into aggregated recommendation candidates.
4. Top builds per key are upserted into `recommendation_agg`.
5. `/api/recommend` reads DB and serves best match (exact comp > nearest bucket > fallback logic).

## Coverage Notes

- Exact 5v5 comp+role matches are sparse by nature.
- Coverage improves with:
- Larger and fresher seed pool
- Higher cron batch settings
- Frequent successful cron runs
- Valid (non-expired) Riot key

## Common Troubleshooting

### `401 Unauthorized` on cron route
- `CRON_SECRET` mismatch between request header and Vercel env.

### `401 Unknown apikey` from Riot
- Riot key is expired/invalid. Refresh `RIOT_API_KEY`.

### `processedMatches = 0`
- Seed list stale, region mismatch, or invalid Riot key.
- Refresh seeds and verify `RIOT_REGION`.

### `rows` unchanged but app still updates
- Upserts may update existing rows; check `sum(sample_size)` and `max(updated_at)`.

### Missing `cron_state` table
- Re-run `db/schema.sql`.

## Security Notes

- Never commit `.env`.
- Rotate secrets immediately if exposed:
- `RIOT_API_KEY`
- `CRON_SECRET`
- `DATABASE_URL` credentials

## NPM Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "ingest:riot": "node --env-file=.env scripts/ingest-riot.mjs",
  "seed:puuids": "node --env-file=.env scripts/fetch-seed-puuids.mjs",
  "sync:db": "node --env-file=.env scripts/sync-recommendations-to-db.mjs"
}
```

## Disclaimer

RiftBuild Coach is an independent project and is not endorsed by Riot Games.  
Follow Riot API terms and developer policies for data usage and product behavior

