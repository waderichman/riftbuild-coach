-- Core aggregated recommendation table used by app reads
CREATE TABLE IF NOT EXISTS recommendation_agg (
  id BIGSERIAL PRIMARY KEY,
  patch TEXT NOT NULL,
  champion TEXT NOT NULL,
  feature_bucket TEXT NOT NULL,
  comp_key TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'UNKNOWN',
  rank_tier TEXT NOT NULL DEFAULT 'ANY',
  title TEXT NOT NULL,
  items JSONB NOT NULL,
  runes JSONB NOT NULL,
  reasoning TEXT NOT NULL,
  why JSONB,
  confidence DOUBLE PRECISION NOT NULL,
  sample_size INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS recommendation_agg_unique_idx
ON recommendation_agg (patch, champion, feature_bucket, comp_key, role, rank_tier, title);

CREATE INDEX IF NOT EXISTS recommendation_agg_lookup_comp_idx
ON recommendation_agg (champion, patch, role, rank_tier, comp_key);

CREATE INDEX IF NOT EXISTS recommendation_agg_lookup_bucket_idx
ON recommendation_agg (champion, patch, role, rank_tier, feature_bucket);

CREATE INDEX IF NOT EXISTS recommendation_agg_updated_at_idx
ON recommendation_agg (updated_at DESC);

-- Simple lock table for cron jobs to prevent overlap
CREATE TABLE IF NOT EXISTS job_locks (
  job_name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
