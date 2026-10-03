-- 020: per-user daily AI quota for the server-side AI proxy (DECISIONS #12, #20, #23).
--
-- The operator's model key lives in Vault and is used only by the `ai-proxy` Edge Function.
-- Every model call the proxy makes is counted here first:
--   * ai_limits(plan)        AI limits per plan, rendered from packages/config
--   * consume_ai_quota(...)  session-checked, atomic: checks the plan and today's count,
--                            then counts one call (or refuses without counting)
--   * refund_ai_quota(...)   gives back one call when the proxy could not get an answer
--                            from the model (provider down, invalid output); never below 0
--
-- Both RPCs are service_role only: the desktop app never calls them directly, it calls the
-- Edge Function, which passes the user's device session through and lets consume_ai_quota
-- check it. Counts live in usage_counters (011; RLS on, no client grants) under new metrics.
-- "Today" is the Asia/Kolkata day (billing_today, 011). Idempotent.

-- 1. New usage metrics -----------------------------------------------------------
ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_metric_check;
ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_metric_check
  CHECK (metric IN ('apply', 'ai_rubric_feedback', 'ai_form_answers'));

-- 2. AI limits (single source: packages/config/src/plans.ts) -----------------------
-- Rows between the markers are checked line-for-line against aiLimitsSqlRows() by
-- packages/supabase/src/__tests__/ai-limits-parity.test.ts. Change limits in
-- packages/config, then paste the rows the test prints into a new migration.
CREATE OR REPLACE FUNCTION public.ai_limits(p_plan TEXT)
RETURNS TABLE (
  ai_feedback           BOOLEAN,
  ai_feedback_per_day   INT,
  ai_form_calls_per_day INT
)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT t.ai_feedback, t.ai_feedback_per_day, t.ai_form_calls_per_day
  FROM (VALUES
    -- BEGIN ai_limits (generated from packages/config)
    ('free', FALSE, 0, 10),
    ('pro', TRUE, 30, 40),
    ('max', TRUE, 100, 300)
    -- END ai_limits
  ) AS t(plan, ai_feedback, ai_feedback_per_day, ai_form_calls_per_day)
  WHERE t.plan = p_plan;
$$;

-- 3. consume_ai_quota --------------------------------------------------------------
-- p_kind: 'rubric_feedback' | 'form_answers'. Errors (nothing counted):
--   unauthorized       no active session for this user + token + device
--   bad_request        unknown kind
--   account_suspended  suspended account
--   plan_required      the plan does not include this AI feature (limit 0 / flag off)
--   quota_exceeded     today's limit is used up
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_kind TEXT
)
RETURNS TABLE (
  ok          BOOLEAN,
  error       TEXT,
  plan        TEXT,
  kind        TEXT,
  daily_limit INT,
  used        INT,
  remaining   INT,
  resets_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_plan    TEXT;
  v_status  TEXT;
  v_metric  TEXT;
  v_allowed BOOLEAN;
  v_limit   INT;
  v_used    INT;
  v_today   DATE := public.billing_today();
  v_resets  TIMESTAMPTZ := ((public.billing_today() + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  l         RECORD;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;

  v_metric := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                          WHEN 'form_answers'    THEN 'ai_form_answers' END;
  IF v_metric IS NULL THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;

  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT * INTO l FROM public.ai_limits(v_plan);
  IF p_kind = 'rubric_feedback' THEN
    v_allowed := COALESCE(l.ai_feedback, FALSE) AND COALESCE(l.ai_feedback_per_day, 0) > 0;
    v_limit   := COALESCE(l.ai_feedback_per_day, 0);
  ELSE
    v_allowed := COALESCE(l.ai_form_calls_per_day, 0) > 0;
    v_limit   := COALESCE(l.ai_form_calls_per_day, 0);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_user_id::text));
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = v_today AND c.metric = v_metric;

  IF v_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, 'account_suspended', v_plan, p_kind, v_limit, v_used, 0, v_resets; RETURN;
  END IF;
  IF NOT v_allowed THEN
    RETURN QUERY SELECT FALSE, 'plan_required', v_plan, p_kind, v_limit, v_used, 0, v_resets; RETURN;
  END IF;
  IF v_used + 1 > v_limit THEN
    RETURN QUERY SELECT FALSE, 'quota_exceeded', v_plan, p_kind, v_limit, v_used, GREATEST(v_limit - v_used, 0), v_resets;
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (user_id, usage_date, metric, used, updated_at)
  VALUES (p_user_id, v_today, v_metric, 1, NOW())
  ON CONFLICT (user_id, usage_date, metric)
  DO UPDATE SET used = public.usage_counters.used + 1, updated_at = NOW();

  v_used := v_used + 1;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_plan, p_kind, v_limit, v_used, GREATEST(v_limit - v_used, 0), v_resets;
END;
$$;

-- 4. refund_ai_quota ---------------------------------------------------------------
-- Gives back one call counted today (the proxy calls it only after consume_ai_quota
-- succeeded and the model produced no usable answer). Returns the new count.
CREATE OR REPLACE FUNCTION public.refund_ai_quota(p_user_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_metric TEXT := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                               WHEN 'form_answers'    THEN 'ai_form_answers' END;
  v_used   INT;
BEGIN
  IF v_metric IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_user_id::text));
  UPDATE public.usage_counters c SET used = GREATEST(c.used - 1, 0), updated_at = NOW()
  WHERE c.user_id = p_user_id AND c.usage_date = public.billing_today() AND c.metric = v_metric
  RETURNING c.used INTO v_used;
  RETURN COALESCE(v_used, 0);
END;
$$;

-- 5. Grants (allow-list rule, SECURITY_CHECKLIST) ------------------------------------
-- None of these are client RPCs: only the ai-proxy Edge Function (service_role) calls them.
REVOKE ALL ON FUNCTION public.ai_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, TEXT) TO service_role;
