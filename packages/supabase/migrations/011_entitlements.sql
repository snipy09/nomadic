-- 011: entitlements service (F9).
--
-- One place on the server that answers "what may this user do today":
--   * plan_limits(plan)          limits per plan, rendered from packages/config
--   * billing_effective_plan(id) 'free' | 'pro' | 'max' after expiry/aliases
--   * get_entitlements(...)      session-checked: plan, expiry and today's usage
--   * consume_apply_quota(...)   session-checked: atomically checks and counts
--                                reviewed applications against today's limit
--
-- Limits are enforced HERE, never on the client (DECISIONS #15). The desktop
-- app calls consume_apply_quota right before each submission and refuses to
-- submit when it is refused or unreachable.
--
-- "Today" is the Asia/Kolkata calendar day (Indian users, DECISIONS #10); the
-- counter resets at local midnight.
-- Idempotent.

-- 1. Usage counters --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  metric     TEXT NOT NULL CHECK (metric IN ('apply')),
  used       INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date, metric)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_counters FROM PUBLIC, anon, authenticated;

-- 2. Plan limits (single source: packages/config/src/plans.ts) -------------------
-- The VALUES rows between the markers are checked line-for-line against
-- planLimitsSqlRows() by packages/supabase/src/__tests__/entitlements-parity.test.ts.
-- Change limits in packages/config, then paste the rows the test prints.
-- NULL = unlimited.
CREATE OR REPLACE FUNCTION public.plan_limits(p_plan TEXT)
RETURNS TABLE (
  applies_per_day  INT,
  feed_jobs        INT,
  learn_tracks     INT,
  practice_per_day INT,
  autonomous_apply BOOLEAN,
  resumes          INT
)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT t.applies_per_day, t.feed_jobs, t.learn_tracks, t.practice_per_day, t.autonomous_apply, t.resumes
  FROM (VALUES
    -- BEGIN plan_limits (generated from packages/config)
    ('free', 3, 10, 1, 10, FALSE, 1),
    ('pro', 10, NULL, NULL, NULL, FALSE, 5),
    ('max', NULL, NULL, NULL, NULL, TRUE, NULL)
    -- END plan_limits
  ) AS t(plan, applies_per_day, feed_jobs, learn_tracks, practice_per_day, autonomous_apply, resumes)
  WHERE t.plan = p_plan;
$$;

-- 3. Effective plan --------------------------------------------------------------
-- Mirrors normalizeTier() in packages/config. Expired subscriptions and
-- trials are Free; suspended accounts keep their plan name but every gated
-- RPC refuses them.
CREATE OR REPLACE FUNCTION public.billing_effective_plan(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE
    WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'free'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) IN ('max', 'seeker_max', 'lifetime', 'enterprise', 'turbo') THEN 'max'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) IN ('pro', 'lite', 'learner_pro', 'seeker_pro', 'learner', 'seeker') THEN 'pro'
    ELSE 'free' END
  FROM public.users_profile u WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.billing_session_ok(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.user_id = p_user_id AND s.session_token = p_session_token
      AND s.device_fingerprint = p_device_fingerprint AND s.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.billing_today()
RETURNS DATE LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
$$;

-- 4. get_entitlements ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entitlements(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (
  ok                  BOOLEAN,
  error               TEXT,
  plan                TEXT,
  stored_tier         TEXT,
  account_status      TEXT,
  expires_at          TIMESTAMPTZ,
  applies_per_day     INT,
  applies_used        INT,
  applies_remaining   INT,
  feed_jobs           INT,
  learn_tracks        INT,
  learn_tracks_active INT,
  practice_per_day    INT,
  autonomous_apply    BOOLEAN,
  resumes             INT,
  resets_at           TIMESTAMPTZ,
  server_time         TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  u      public.users_profile%ROWTYPE;
  v_plan TEXT;
  l      RECORD;
  v_used INT;
  v_tracks INT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
      NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::BOOLEAN, NULL::INT,
      NULL::TIMESTAMPTZ, NOW();
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT * INTO l FROM public.plan_limits(v_plan);

  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = public.billing_today() AND c.metric = 'apply';

  SELECT count(*)::INT INTO v_tracks FROM public.user_tracks t
  WHERE t.user_id = p_user_id AND t.status = 'active';

  RETURN QUERY SELECT
    TRUE, NULL::TEXT, v_plan, u.subscription_tier,
    CASE WHEN u.status = 'suspended' THEN 'suspended'
         WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'expired'
         ELSE 'active' END,
    u.expires_at,
    l.applies_per_day, v_used,
    CASE WHEN u.status = 'suspended' THEN 0
         WHEN l.applies_per_day IS NULL THEN NULL
         ELSE GREATEST(l.applies_per_day - v_used, 0) END,
    l.feed_jobs, l.learn_tracks, v_tracks, l.practice_per_day, l.autonomous_apply, l.resumes,
    ((public.billing_today() + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'),
    NOW();
END;
$$;

-- 5. consume_apply_quota ---------------------------------------------------------
-- Counts p_count applications against today's limit, all or nothing.
-- Returns ok = FALSE with error 'apply_limit_reached' (nothing counted) when
-- the request does not fit; serialised per user with an advisory lock.
CREATE OR REPLACE FUNCTION public.consume_apply_quota(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_count INT DEFAULT 1
)
RETURNS TABLE (
  ok                BOOLEAN,
  error             TEXT,
  plan              TEXT,
  applies_per_day   INT,
  applies_used      INT,
  applies_remaining INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_plan   TEXT;
  v_limit  INT;
  v_used   INT;
  v_status TEXT;
  v_today  DATE := public.billing_today();
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, NULL::INT, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 50 THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, NULL::INT, NULL::INT, NULL::INT; RETURN;
  END IF;

  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT l.applies_per_day INTO v_limit FROM public.plan_limits(v_plan) l;

  PERFORM pg_advisory_xact_lock(hashtext('apply_quota:' || p_user_id::text));
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = v_today AND c.metric = 'apply';

  IF v_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, 'account_suspended', v_plan, v_limit, v_used, 0; RETURN;
  END IF;

  IF v_limit IS NOT NULL AND v_used + p_count > v_limit THEN
    RETURN QUERY SELECT FALSE, 'apply_limit_reached', v_plan, v_limit, v_used, GREATEST(v_limit - v_used, 0);
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (user_id, usage_date, metric, used, updated_at)
  VALUES (p_user_id, v_today, 'apply', p_count, NOW())
  ON CONFLICT (user_id, usage_date, metric)
  DO UPDATE SET used = public.usage_counters.used + EXCLUDED.used, updated_at = NOW();

  v_used := v_used + p_count;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_plan, v_limit, v_used,
    CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(v_limit - v_used, 0) END;
END;
$$;

-- 6. Grants (allow-list rule, SECURITY_CHECKLIST) --------------------------------
-- Helpers stay private; only the two session-checked RPCs are callable by the app.
REVOKE ALL ON FUNCTION public.plan_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_effective_plan(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_session_ok(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_effective_plan(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_entitlements(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_apply_quota(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entitlements(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_apply_quota(UUID, TEXT, TEXT, INT) TO anon, authenticated, service_role;

-- Only today's rows are read by the RPCs; the date index keeps a future purge cheap.
CREATE INDEX IF NOT EXISTS idx_usage_counters_date ON public.usage_counters (usage_date);
