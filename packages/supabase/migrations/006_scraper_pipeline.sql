-- ----------------------------------------------------------------------------
-- MIGRATION 006: Scraper pipeline (REVAMP_PLAN steps 2.2 / 2.3)
--
--  * jobs: normalized columns, upsert identity (source_key, source_id),
--    freshness (first_seen / last_seen / status / expired_at) and a feed index.
--  * status is authoritative; is_active is kept in sync by a trigger so the
--    existing RLS policy ("anon can read active jobs") and the desktop feed
--    query (is_active = true) hide expired jobs without code changes.
--  * maintain_jobs_lifecycle(): expires on last_seen instead of created_at
--    (a job still listed by its source stays live), and is no longer callable
--    with the anon key.
--  * scrape_runs: one row per source per pipeline run (service role only).
--
-- Idempotent: safe to re-run.
-- ----------------------------------------------------------------------------

-- 1. New columns on jobs -------------------------------------------------------
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_key      TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_id       TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS expired_at      TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS expire_reason   TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS canonical_url   TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dedupe_key      TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS remote          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS workplace_type  TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS seniority       TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS role_family     TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_min      NUMERIC;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_max      NUMERIC;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_currency TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_period   TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at       TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quality_score   INT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS link_status     TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS link_checked_at TIMESTAMPTZ;

-- Backfill existing (legacy) rows so status/freshness are meaningful.
UPDATE public.jobs
SET status     = CASE WHEN is_active THEN 'active' ELSE 'expired' END,
    first_seen = COALESCE(created_at, first_seen),
    last_seen  = COALESCE(created_at, last_seen),
    expired_at = CASE WHEN is_active THEN NULL ELSE COALESCE(expired_at, NOW()) END
WHERE source_id IS NULL;

DO $$
BEGIN
  ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_chk;
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_chk CHECK (status IN ('active', 'expired'));

  ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_salary_range_chk;
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_range_chk
    CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);

  ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_identity_chk;
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_identity_chk
    CHECK ((source_key IS NULL) = (source_id IS NULL));
END $$;

-- 2. Indexes ---------------------------------------------------------------
-- Upsert identity. NULLs are distinct, so legacy rows (no source_id) don't collide.
-- Must be a plain (non-partial) unique index for ON CONFLICT (source_key, source_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_source_identity ON public.jobs (source_key, source_id);

-- Feed query: status, type, newest first (keeps 18/36/54 pagination fast).
CREATE INDEX IF NOT EXISTS idx_jobs_feed
  ON public.jobs (status, employment_type, posted_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_active_recent
  ON public.jobs (COALESCE(posted_at, created_at) DESC) WHERE status = 'active';
-- Expiry scans per source.
CREATE INDEX IF NOT EXISTS idx_jobs_source_last_seen
  ON public.jobs (source_key, last_seen) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_canonical_url ON public.jobs (canonical_url);
CREATE INDEX IF NOT EXISTS idx_jobs_role_family ON public.jobs (role_family) WHERE status = 'active';

-- 3. Keep is_active and status in sync ----------------------------------------
CREATE OR REPLACE FUNCTION public.jobs_sync_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Legacy writers send only is_active; the pipeline sends both.
    IF NEW.is_active IS FALSE AND NEW.status = 'active' THEN
      NEW.status := 'expired';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NULL; -- status changed: it wins, is_active follows below
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'expired' END;
  END IF;

  NEW.is_active := (NEW.status = 'active');
  IF NEW.status = 'expired' THEN
    NEW.expired_at := COALESCE(NEW.expired_at, NOW());
  ELSE
    NEW.expired_at := NULL;
    NEW.expire_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_sync_status ON public.jobs;
CREATE TRIGGER trg_jobs_sync_status
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_sync_status();

-- 4. Lifecycle maintenance on last_seen -----------------------------------------
CREATE OR REPLACE FUNCTION public.maintain_jobs_lifecycle()
RETURNS TABLE(inactivated_count INT, purged_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inactivated INT;
  v_purged INT;
BEGIN
  -- Not seen by any source for 14 days => expired.
  UPDATE public.jobs
  SET status = 'expired', expire_reason = COALESCE(expire_reason, 'stale_14d')
  WHERE status = 'active'
    AND COALESCE(last_seen, created_at) < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_inactivated = ROW_COUNT;

  -- Expired for 30 days => deleted.
  DELETE FROM public.jobs
  WHERE status = 'expired'
    AND COALESCE(expired_at, last_seen, created_at) < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  RETURN QUERY SELECT v_inactivated, v_purged;
END;
$$;

-- It deletes rows: only the service role (CI / admin machine) may call it.
REVOKE ALL ON FUNCTION public.maintain_jobs_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_jobs_lifecycle() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_jobs_lifecycle() TO service_role;

-- 5. Feed view ---------------------------------------------------------------
-- security_invoker: the caller's RLS applies (anon sees active jobs only).
CREATE OR REPLACE VIEW public.jobs_feed
WITH (security_invoker = true) AS
SELECT
  id, title, company, location, remote, workplace_type, employment_type, seniority, role_family,
  salary_min, salary_max, salary_currency, salary_period, salary_range,
  posted_at, first_seen, last_seen, apply_url, source, source_key, quality_score, description, created_at
FROM public.jobs
WHERE status = 'active';

GRANT SELECT ON public.jobs_feed TO anon, authenticated;

-- 6. scrape_runs ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL,
  source       TEXT NOT NULL,
  tier         SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 3),
  status       TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  started_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ NOT NULL,
  duration_ms  INT NOT NULL DEFAULT 0,
  fetched      INT NOT NULL DEFAULT 0,
  valid        INT NOT NULL DEFAULT 0,
  invalid      INT NOT NULL DEFAULT 0,
  duplicates   INT NOT NULL DEFAULT 0,
  link_failed  INT NOT NULL DEFAULT 0,
  upserted     INT NOT NULL DEFAULT 0,
  expired      INT NOT NULL DEFAULT 0,
  error        TEXT,
  alert        TEXT,
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_started ON public.scrape_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_source_started ON public.scrape_runs (source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_run ON public.scrape_runs (run_id);

-- RLS on with no anon/authenticated policy: only the service role reads or writes.
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scrape_runs FROM anon, authenticated;
