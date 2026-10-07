-- Rehearsal for 033 on a local copy (after 001-033). Rolls back.
BEGIN;
INSERT INTO public.jobs (job_hash, source_key, source_id, source, title, company, location, apply_url, status, is_active, posted_at, last_seen)
VALUES
  ('h-new', 'lever', 'new', 'Lever', 'New role', 'Acme', 'Pune', 'https://x/1', 'active', TRUE, NOW() - INTERVAL '3 days', NOW()),
  ('h-old', 'lever', 'old', 'Lever', 'Old role', 'Acme', 'Pune', 'https://x/2', 'active', TRUE, NOW() - INTERVAL '40 days', NOW()),
  ('h-nodate', 'lever', 'nodate', 'Lever', 'No date', 'Acme', 'Pune', 'https://x/3', 'active', TRUE, NULL, NOW());
SELECT 'insert', source_id, status, is_active, expire_reason FROM public.jobs WHERE source_key = 'lever' ORDER BY source_id;
-- A source still listing the old job: the upsert must not bring it back.
INSERT INTO public.jobs (job_hash, source_key, source_id, source, title, company, location, apply_url, status, is_active, posted_at, last_seen, expired_at, expire_reason)
VALUES ('h-old', 'lever', 'old', 'Lever', 'Old role', 'Acme', 'Pune', 'https://x/2', 'active', TRUE, NOW() - INTERVAL '40 days', NOW(), NULL, NULL)
ON CONFLICT (source_key, source_id) DO UPDATE SET status = EXCLUDED.status, is_active = EXCLUDED.is_active, last_seen = EXCLUDED.last_seen, expired_at = EXCLUDED.expired_at, expire_reason = EXCLUDED.expire_reason;
SELECT 'upsert keeps old expired', status, is_active, expire_reason, expired_at IS NOT NULL FROM public.jobs WHERE source_id = 'old';
-- A job without a posting date ages from first_seen.
UPDATE public.jobs SET first_seen = NOW() - INTERVAL '31 days', status = 'active' WHERE source_id = 'nodate';
SELECT 'first_seen 31d', status, expire_reason FROM public.jobs WHERE source_id = 'nodate';
SELECT 'lifecycle', * FROM public.maintain_jobs_lifecycle();
SELECT 'new still active', status FROM public.jobs WHERE source_id = 'new';
INSERT INTO public.news_items (url, source, source_name, title, published_at, kind, company_name, company_slug, roles, headcount_text, period_text, starts_on, ends_on)
VALUES ('https://et.example/1', 'et-jobs', 'Economic Times', 'Google to hire 1,200 freshers', NOW() - INTERVAL '2 days', 'hiring', 'Google', 'google', '{Freshers}', '1,200 freshers', 'September to December', '2026-09-01', '2026-12-31'),
       ('https://et.example/2', 'et-jobs', 'Economic Times', 'Old news', NOW() - INTERVAL '60 days', 'hiring', NULL, NULL, '{}', NULL, NULL, NULL, NULL);
SET LOCAL ROLE anon;
SELECT 'anon sees recent news', count(*) FROM public.news_items;
RESET ROLE;
SELECT 'bad kind rejected';
SAVEPOINT s1;
INSERT INTO public.news_items (url, source, source_name, title, published_at, kind) VALUES ('https://et.example/3', 'et', 'ET', 'x', NOW(), 'gossip');
ROLLBACK TO SAVEPOINT s1;
INSERT INTO public.hackathons (source, kind, source_id, title, url, mode) VALUES ('codeforces', 'contest', '2150', 'Round', 'https://codeforces.com/contests/2150', 'online');
SELECT 'contest stored', source, kind FROM public.hackathons WHERE source = 'codeforces';
SELECT 'default kind', column_default FROM information_schema.columns WHERE table_name = 'hackathons' AND column_name = 'kind';
SELECT 'anon can write news?', has_table_privilege('anon', 'public.news_items', 'INSERT');
ROLLBACK;
