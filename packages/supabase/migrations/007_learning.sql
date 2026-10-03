-- ----------------------------------------------------------------------------
-- MIGRATION 007: Learn (REVAMP_PLAN steps 3B.1-3B.5)
--
-- Content: skills, prerequisites, role families + weights, curated resources,
-- lessons, practice items (published content readable by the app), reference
-- solutions (service role only).
-- Progress: append-only learning_events and user_tracks, written ONLY through
-- SECURITY DEFINER RPCs that verify the device session (same model as 003).
-- Gating (server-side): free tier = 1 active track + 10 practice attempts/day.
-- Idempotent.
-- ----------------------------------------------------------------------------

-- 1. Content ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skills (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  level           SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  estimated_hours NUMERIC NOT NULL CHECK (estimated_hours > 0),
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  patterns        TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.skill_prerequisites (
  skill_id        TEXT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  prerequisite_id TEXT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  strength        TEXT NOT NULL DEFAULT 'hard' CHECK (strength IN ('hard', 'soft')),
  PRIMARY KEY (skill_id, prerequisite_id),
  CHECK (skill_id <> prerequisite_id)
);

CREATE TABLE IF NOT EXISTS public.role_families (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL,
  legacy_roadmap_ids TEXT[] NOT NULL DEFAULT '{}',
  example_titles     TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.role_skills (
  role_id  TEXT NOT NULL REFERENCES public.role_families(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  weight   NUMERIC NOT NULL CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (role_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.learning_resources (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  url              TEXT NOT NULL UNIQUE CHECK (url LIKE 'https://%'),
  provider         TEXT NOT NULL,
  type             TEXT NOT NULL,
  duration_minutes INT,
  skill_ids        TEXT[] NOT NULL CHECK (cardinality(skill_ids) > 0),
  level            SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  quality          SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  is_free          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Only 'active' (passed the last link check) is ever shown.
  status           TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'active', 'broken', 'retired')),
  last_checked     TIMESTAMPTZ,
  http_status      INT,
  fail_count       INT NOT NULL DEFAULT 0,
  source           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learning_resources_skills ON public.learning_resources USING GIN (skill_ids);

CREATE TABLE IF NOT EXISTS public.lessons (
  id                TEXT PRIMARY KEY,
  skill_id          TEXT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  summary_md        TEXT NOT NULL CHECK (summary_md !~* 'https?://'),
  key_points        TEXT[] NOT NULL DEFAULT '{}',
  resource_ids      TEXT[] NOT NULL DEFAULT '{}',
  estimated_minutes INT NOT NULL CHECK (estimated_minutes > 0),
  is_core           BOOLEAN NOT NULL DEFAULT TRUE,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  ai_drafted        BOOLEAN NOT NULL DEFAULT FALSE,
  version           INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_lessons_skill ON public.lessons (skill_id);

CREATE TABLE IF NOT EXISTS public.practice_items (
  id           TEXT PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  lesson_id    TEXT REFERENCES public.lessons(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('mcq', 'fill_in', 'ordering', 'code')),
  difficulty   TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  company_tags TEXT[] NOT NULL DEFAULT '{}',
  -- Full item (prompt, options/answers, tests) as validated by @job-automator/learning.
  body         JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  ai_drafted   BOOLEAN NOT NULL DEFAULT FALSE,
  version      INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_practice_items_skill ON public.practice_items (skill_id);

CREATE TABLE IF NOT EXISTS public.practice_solutions (
  item_id       TEXT PRIMARY KEY REFERENCES public.practice_items(id) ON DELETE CASCADE,
  solution_code TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT ''
);

-- 2. Progress -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_events (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known')),
  skill_id   TEXT,
  item_id    TEXT,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_s INT NOT NULL DEFAULT 0 CHECK (duration_s BETWEEN 0 AND 86400),
  created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_events_user_time ON public.learning_events (user_id, created_at DESC);

-- Append-only: no updates; deletes only via cascade from users_profile.
CREATE OR REPLACE FUNCTION public.learning_events_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'learning_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_learning_events_immutable ON public.learning_events;
CREATE TRIGGER trg_learning_events_immutable BEFORE UPDATE ON public.learning_events
  FOR EACH ROW EXECUTE FUNCTION public.learning_events_immutable();

CREATE TABLE IF NOT EXISTS public.user_tracks (
  user_id        UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  track_id       TEXT NOT NULL REFERENCES public.role_families(id),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  horizon_months SMALLINT NOT NULL DEFAULT 3 CHECK (horizon_months IN (1, 3, 6)),
  daily_hours    SMALLINT NOT NULL DEFAULT 2 CHECK (daily_hours IN (1, 2, 4)),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, track_id)
);

-- 3. RLS ----------------------------------------------------------------------
ALTER TABLE public.skills              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_families       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_resources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_solutions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tracks         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read skills" ON public.skills;
CREATE POLICY "read skills" ON public.skills FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "read prerequisites" ON public.skill_prerequisites;
CREATE POLICY "read prerequisites" ON public.skill_prerequisites FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "read roles" ON public.role_families;
CREATE POLICY "read roles" ON public.role_families FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "read role skills" ON public.role_skills;
CREATE POLICY "read role skills" ON public.role_skills FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "read active resources" ON public.learning_resources;
CREATE POLICY "read active resources" ON public.learning_resources FOR SELECT TO anon, authenticated USING (status = 'active');
DROP POLICY IF EXISTS "read published lessons" ON public.lessons;
CREATE POLICY "read published lessons" ON public.lessons FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS "read published practice" ON public.practice_items;
CREATE POLICY "read published practice" ON public.practice_items FOR SELECT TO anon, authenticated USING (status = 'published');
-- practice_solutions, learning_events, user_tracks: no client policy (RPC / service role only).
REVOKE ALL ON public.practice_solutions, public.learning_events, public.user_tracks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.skills, public.skill_prerequisites, public.role_families, public.role_skills,
  public.learning_resources, public.lessons, public.practice_items FROM anon, authenticated;

-- 4. Session check + tier -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_session_ok(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = p_user_id AND session_token = p_session_token
      AND device_fingerprint = p_device_fingerprint AND is_active = TRUE
  );
$$;

-- 'free' | 'pro' | 'max'. Expired or trial subscriptions are free.
CREATE OR REPLACE FUNCTION public.learning_tier(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'free'
    WHEN u.subscription_tier IN ('max', 'enterprise', 'lifetime') THEN 'max'
    WHEN u.subscription_tier = 'pro' THEN 'pro'
    ELSE 'free' END
  FROM public.users_profile u WHERE u.id = p_user_id;
$$;

-- 5. Gated RPCs ---------------------------------------------------------------
-- Start (or resume) a track. Free tier: at most 1 active track.
CREATE OR REPLACE FUNCTION public.learning_start_track(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_track_id TEXT, p_horizon_months SMALLINT DEFAULT 3, p_daily_hours SMALLINT DEFAULT 2
) RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active INT;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learning_track:' || p_user_id::text));
  SELECT count(*) INTO v_active FROM public.user_tracks
  WHERE user_id = p_user_id AND status = 'active' AND track_id <> p_track_id;
  IF public.learning_tier(p_user_id) = 'free' AND v_active >= 1 THEN
    RETURN QUERY SELECT FALSE, 'free_tier_track_limit'; RETURN;
  END IF;
  INSERT INTO public.user_tracks (user_id, track_id, status, horizon_months, daily_hours)
  VALUES (p_user_id, p_track_id, 'active', p_horizon_months, p_daily_hours)
  ON CONFLICT (user_id, track_id) DO UPDATE
    SET status = 'active', horizon_months = EXCLUDED.horizon_months, daily_hours = EXCLUDED.daily_hours, archived_at = NULL;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.learning_archive_track(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_track_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN FALSE; END IF;
  UPDATE public.user_tracks SET status = 'archived', archived_at = NOW()
  WHERE user_id = p_user_id AND track_id = p_track_id;
  RETURN FOUND;
END;
$$;

-- Append events (idempotent by id). Practice attempts on the free tier are
-- capped at 10 per UTC day; over-limit attempts are rejected, not stored.
CREATE OR REPLACE FUNCTION public.learning_record_events(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_events JSONB
) RETURNS TABLE (accepted INT, rejected INT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e JSONB;
  v_tier TEXT;
  v_used INT;
  v_ok INT := 0;
  v_bad INT := 0;
  v_type TEXT;
  v_rows INT;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT 0, 0, 'unauthorized'; RETURN;
  END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 500 THEN
    RETURN QUERY SELECT 0, 0, 'bad_request'; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learning_events:' || p_user_id::text));
  v_tier := public.learning_tier(p_user_id);
  SELECT count(*) INTO v_used FROM public.learning_events
  WHERE user_id = p_user_id AND item_id IS NOT NULL
    AND type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done')
    AND received_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  FOR e IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_type := e->>'type';
    IF v_type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done') AND (e->>'item_id') IS NOT NULL
       AND v_tier = 'free' AND v_used >= 10
       AND NOT EXISTS (SELECT 1 FROM public.learning_events WHERE id = (e->>'id')::uuid) THEN
      v_bad := v_bad + 1;
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.learning_events (id, user_id, type, skill_id, item_id, payload, duration_s, created_at)
      VALUES ((e->>'id')::uuid, p_user_id, v_type, e->>'skill_id', e->>'item_id',
              COALESCE(e->'payload', '{}'::jsonb), COALESCE((e->>'duration_s')::int, 0),
              LEAST((e->>'created_at')::timestamptz, NOW() + INTERVAL '5 minutes'))
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_ok := v_ok + 1;
      IF v_rows > 0 AND v_type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done') AND (e->>'item_id') IS NOT NULL THEN
        v_used := v_used + 1;
      END IF;
    EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation OR invalid_datetime_format THEN
      v_bad := v_bad + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT v_ok, v_bad, NULL::TEXT;
END;
$$;

-- Pull events since a timestamp (sync / reinstall restore).
CREATE OR REPLACE FUNCTION public.learning_pull_events(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_since TIMESTAMPTZ DEFAULT 'epoch'
) RETURNS SETOF public.learning_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.learning_events
  WHERE user_id = p_user_id AND received_at > p_since ORDER BY created_at LIMIT 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_session_ok(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learning_tier(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learning_start_track(UUID, TEXT, TEXT, TEXT, SMALLINT, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_archive_track(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_record_events(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_pull_events(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learning_start_track(UUID, TEXT, TEXT, TEXT, SMALLINT, SMALLINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_archive_track(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_record_events(UUID, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_pull_events(UUID, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_session_ok(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.learning_tier(UUID) TO service_role;
