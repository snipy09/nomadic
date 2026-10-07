-- 031: Sources for the Home feed (docs/plans/HOME_FEED_PLAN.md), written by the feed scraper
-- (packages/scrapers/src/feed, `npm run scrape:feed -- --publish`, service role).
--
-- companies                  famous companies people can follow; has_careers_feed is false for companies whose
--                            careers site has no public listing we can read (their hiring windows are curated).
-- company_openings           India-open roles read from each company's own careers site or ATS
--                            (full time and internships), one row per posting; closed postings go inactive.
-- company_hiring_snapshots   one row per company per IST day: open roles, internships, entry level, new since the
--                            last run. baseline = first run for that company (every role counts as new; the feed
--                            must not announce a hiring burst from it).
-- hackathons                 upcoming hackathons from Devfolio, Unstop, Devpost and HackerEarth, online or in India.
--
-- Clients may read: all companies and snapshots, active openings, active hackathons that have not ended.
-- Only the service role writes. Idempotent.
CREATE TABLE IF NOT EXISTS public.companies (
  slug             TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  domain           TEXT CHECK (length(domain) <= 253),
  careers_url      TEXT NOT NULL CHECK (length(careers_url) BETWEEN 8 AND 2000),
  category         TEXT NOT NULL CHECK (category IN ('big_tech', 'product', 'indian_product', 'fintech', 'finance', 'semiconductor', 'services')),
  has_careers_feed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companies FROM anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
DROP POLICY IF EXISTS "read companies" ON public.companies;
CREATE POLICY "read companies" ON public.companies FOR SELECT TO anon, authenticated USING (TRUE);
CREATE TABLE IF NOT EXISTS public.company_openings (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_slug  TEXT NOT NULL REFERENCES public.companies (slug) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'eightfold', 'oracle', 'amazon', 'google')),
  source_job_id TEXT NOT NULL CHECK (length(source_job_id) BETWEEN 1 AND 300),
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  kind          TEXT NOT NULL CHECK (kind IN ('internship', 'full_time', 'other', 'unknown')),
  level         TEXT NOT NULL CHECK (level IN ('entry', 'experienced', 'unknown')),
  role_family   TEXT NOT NULL CHECK (role_family IN ('software', 'data', 'ml', 'devops', 'security', 'qa', 'design', 'product', 'hardware', 'other')),
  location      TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 300),
  remote        BOOLEAN NOT NULL DEFAULT FALSE,
  url           TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 2000),
  posted_at     TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_slug, source_job_id)
);
CREATE INDEX IF NOT EXISTS idx_company_openings_active ON public.company_openings (company_slug, first_seen_at DESC) WHERE is_active;
ALTER TABLE public.company_openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_openings FROM anon, authenticated;
GRANT SELECT ON public.company_openings TO anon, authenticated;
DROP POLICY IF EXISTS "read active openings" ON public.company_openings;
CREATE POLICY "read active openings" ON public.company_openings FOR SELECT TO anon, authenticated USING (is_active);
CREATE TABLE IF NOT EXISTS public.company_hiring_snapshots (
  company_slug  TEXT NOT NULL REFERENCES public.companies (slug) ON DELETE CASCADE,
  taken_on      DATE NOT NULL,
  open_total    INT NOT NULL CHECK (open_total >= 0),
  internships   INT NOT NULL CHECK (internships >= 0),
  full_time     INT NOT NULL CHECK (full_time >= 0),
  entry_level   INT NOT NULL CHECK (entry_level >= 0),
  new_openings  INT NOT NULL CHECK (new_openings >= 0),
  baseline      BOOLEAN NOT NULL DEFAULT FALSE,
  role_families JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_titles JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_slug, taken_on)
);
ALTER TABLE public.company_hiring_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_hiring_snapshots FROM anon, authenticated;
GRANT SELECT ON public.company_hiring_snapshots TO anon, authenticated;
DROP POLICY IF EXISTS "read hiring snapshots" ON public.company_hiring_snapshots;
CREATE POLICY "read hiring snapshots" ON public.company_hiring_snapshots FOR SELECT TO anon, authenticated USING (TRUE);
CREATE TABLE IF NOT EXISTS public.hackathons (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source               TEXT NOT NULL CHECK (source IN ('devfolio', 'unstop', 'devpost', 'hackerearth')),
  source_id            TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 300),
  title                TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  organiser            TEXT CHECK (length(organiser) <= 200),
  url                  TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 2000),
  mode                 TEXT NOT NULL CHECK (mode IN ('online', 'in_person', 'hybrid', 'unknown')),
  city                 TEXT CHECK (length(city) <= 120),
  country              TEXT CHECK (length(country) <= 120),
  in_india             BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at            TIMESTAMPTZ,
  ends_at              TIMESTAMPTZ,
  registration_ends_at TIMESTAMPTZ,
  themes               TEXT[] NOT NULL DEFAULT '{}',
  prize_text           TEXT CHECK (length(prize_text) <= 200),
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_hackathons_upcoming ON public.hackathons (starts_at) WHERE is_active;
ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hackathons FROM anon, authenticated;
GRANT SELECT ON public.hackathons TO anon, authenticated;
DROP POLICY IF EXISTS "read upcoming hackathons" ON public.hackathons;
CREATE POLICY "read upcoming hackathons" ON public.hackathons FOR SELECT TO anon, authenticated
  USING (is_active AND (ends_at IS NULL OR ends_at > NOW()));
