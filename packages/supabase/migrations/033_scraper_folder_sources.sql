-- 033: Sources added with the Desktop scraper folder (scripts/scraper-folder, docs/guides/SCRAPER_LAPTOP.md).
--
-- jobs              a job is active for at most 30 days after it was posted (or first seen when the source gives no
--                   date): a BEFORE trigger keeps older rows expired even when a source still lists them, and
--                   maintain_jobs_lifecycle() expires the ones already stored. Reason 'older_than_30d'.
-- news_items        hiring news from Indian publishers' RSS feeds (packages/scrapers/src/news): headline, link,
--                   date, the feed's summary, and facts read from that text (company, roles, headcount, period,
--                   cities). Kinds: hiring, campus, layoffs, funding, expansion. Clients read active items from the
--                   last 45 days; only the service role writes.
-- hackathons        kind 'hackathon' | 'contest' (Codeforces contests); sources hack2skill, mlh, codeforces added.
--
-- Idempotent. Paste-safe (no blank lines).
--
-- ── jobs: 30-day age ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jobs_enforce_max_age()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
     AND COALESCE(NEW.posted_at, NEW.first_seen, NEW.created_at, NOW()) < NOW() - INTERVAL '30 days' THEN
    NEW.status := 'expired';
    NEW.is_active := FALSE;
    IF TG_OP = 'UPDATE' AND OLD.status = 'expired' THEN
      NEW.expired_at := OLD.expired_at;
      NEW.expire_reason := OLD.expire_reason;
    ELSE
      NEW.expired_at := NOW();
      NEW.expire_reason := 'older_than_30d';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Runs before trg_jobs_sync_status (triggers fire in name order), which then keeps is_active in step.
DROP TRIGGER IF EXISTS trg_jobs_max_age ON public.jobs;
CREATE TRIGGER trg_jobs_max_age
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_enforce_max_age();
CREATE OR REPLACE FUNCTION public.maintain_jobs_lifecycle()
RETURNS TABLE(inactivated_count INT, purged_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale INT;
  v_old INT;
  v_purged INT;
BEGIN
  -- Not seen by any source for 14 days => expired.
  UPDATE public.jobs
  SET status = 'expired', expire_reason = COALESCE(expire_reason, 'stale_14d')
  WHERE status = 'active'
    AND COALESCE(last_seen, created_at) < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_stale = ROW_COUNT;
  -- Posted (or first seen) more than 30 days ago => expired.
  UPDATE public.jobs
  SET status = 'expired', expire_reason = COALESCE(expire_reason, 'older_than_30d')
  WHERE status = 'active'
    AND COALESCE(posted_at, first_seen, created_at) < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_old = ROW_COUNT;
  -- Expired for 30 days => deleted.
  DELETE FROM public.jobs
  WHERE status = 'expired'
    AND COALESCE(expired_at, last_seen, created_at) < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN QUERY SELECT v_stale + v_old, v_purged;
END;
$$;
REVOKE ALL ON FUNCTION public.maintain_jobs_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_jobs_lifecycle() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_jobs_lifecycle() TO service_role;
--
-- ── news_items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.news_items (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url            TEXT NOT NULL UNIQUE CHECK (length(url) BETWEEN 8 AND 2000),
  source         TEXT NOT NULL CHECK (source ~ '^[a-z0-9-]{1,40}$'),
  source_name    TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 80),
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 400),
  summary        TEXT CHECK (length(summary) <= 600),
  published_at   TIMESTAMPTZ NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('hiring', 'campus', 'layoffs', 'funding', 'expansion')),
  company_name   TEXT CHECK (length(company_name) <= 120),
  company_slug   TEXT CHECK (company_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  roles          TEXT[] NOT NULL DEFAULT '{}',
  headcount_text TEXT CHECK (length(headcount_text) <= 80),
  period_text    TEXT CHECK (length(period_text) <= 80),
  starts_on      DATE,
  ends_on        DATE,
  locations      TEXT[] NOT NULL DEFAULT '{}',
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_news_items_recent ON public.news_items (published_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_news_items_company ON public.news_items (company_slug, published_at DESC) WHERE is_active;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_items FROM anon, authenticated;
GRANT SELECT ON public.news_items TO anon, authenticated;
DROP POLICY IF EXISTS "read recent news" ON public.news_items;
CREATE POLICY "read recent news" ON public.news_items FOR SELECT TO anon, authenticated
  USING (is_active AND published_at > NOW() - INTERVAL '45 days');
--
-- ── hackathons: contests and new sources ─────────────────────────────────────
ALTER TABLE public.hackathons ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'hackathon';
ALTER TABLE public.hackathons DROP CONSTRAINT IF EXISTS hackathons_kind_check;
ALTER TABLE public.hackathons ADD CONSTRAINT hackathons_kind_check CHECK (kind IN ('hackathon', 'contest'));
ALTER TABLE public.hackathons DROP CONSTRAINT IF EXISTS hackathons_source_check;
ALTER TABLE public.hackathons ADD CONSTRAINT hackathons_source_check
  CHECK (source IN ('devfolio', 'unstop', 'devpost', 'hackerearth', 'hack2skill', 'mlh', 'codeforces'));
