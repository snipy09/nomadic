-- ============================================================================
-- 006: Job freshness, filter columns and scrape-run observability (idempotent)
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- Columns the desktop feed already filters on (Full-time / Internships / Remote tabs).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'job';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS workplace_type  TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS experience_level TEXT;

-- Freshness: real posting date (when the source provides one) and the last scrape that still saw the job.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at    TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Fast feed query: active jobs, newest first.
CREATE INDEX IF NOT EXISTS idx_jobs_feed
  ON public.jobs (is_active, (COALESCE(posted_at, created_at)) DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source_seen ON public.jobs (source, last_seen_at);

-- One row per scraper run: per-source counts, errors and alerts. Written by the service role only.
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_jobs    INTEGER NOT NULL DEFAULT 0,
  upserted      INTEGER NOT NULL DEFAULT 0,
  expired       INTEGER NOT NULL DEFAULT 0,
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  alerts        JSONB NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;  -- no policies: only the service role can read/write
