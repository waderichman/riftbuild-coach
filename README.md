# RiftBuild Coach (Next.js + TypeScript)

Web app for League of Legends build recommendations.

## What Is Wired

- `POST /api/recommend` uses this priority:
  1. Statistical recommendations from `data/buildRecommendations.json`
  2. Rule-based fallback in `lib/lol.ts`
- Filters now supported end-to-end:
  - `patch`
  - `role` (`ANY|TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY`)
  - `rankTier` (`ANY|CHALLENGER|GRANDMASTER|MASTER`)
- Ingestion upgrades for better quality/coverage:
  - Multi-tier seed discovery (Challenger + Grandmaster + Master)
  - Rank-tier tagging per seed/player
  - Role extraction from match participant positions
  - Configurable minimum sample threshold

## API Routes

- `GET /api/health`
- `GET /api/champions`
- `POST /api/recommend`

## Environment

Copy `.env.example` to `.env` and set:

- `RIOT_API_KEY` (required)
- `RIOT_REGION` (default `americas`)
- `RIOT_PLATFORM` (default `na1`)
- `PATCH_VERSION` (default `latest`)
- `RIOT_QUEUE` (default `420`)
- `RIOT_MATCH_COUNT` (default `20`)
- `RIOT_MAX_SEEDS` (default `0` = no cap)
- `RIOT_REQUEST_DELAY_MS` (default `180`)
- `RIOT_MAX_RETRIES` (default `6`)
- `RIOT_MIN_GAMES` (default `3`)
- `RIOT_DEFAULT_RANK_TIER` (default `CHALLENGER`)
- `RIOT_SEED_PUUIDS` (generated seed CSV)
- `RIOT_SEED_QUEUE` (default `RANKED_SOLO_5x5`)
- `RIOT_SEED_LIMIT` (default `50`, per tier)
- `RIOT_SEED_TIERS` (default `CHALLENGER,GRANDMASTER,MASTER`)
- `RECOMMEND_MIN_SAMPLE_SIZE` (default `3`)

## Run

```bash
npm install
npm run seed:puuids
# copy output csv into RIOT_SEED_PUUIDS in .env
npm run ingest:riot
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- Seed script writes:
  - `data/seed-puuids.txt`
  - `data/seed-puuids.json` (includes rank tier per puuid)
- Ingest script writes:
  - `data/buildRecommendations.json`
- Optional production DB schema is in `db/schema.sql`.