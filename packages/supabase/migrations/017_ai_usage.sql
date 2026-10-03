-- 017: AI usage counting for the ai-proxy Edge Function (decisions 12, 15, 20, 23).
--
-- The proxy calls ai_consume_quota() before every model call and ai_refund_quota()
-- when the call fails or the output does not validate, so users are only charged for
-- answers they receive. Both are service-role only; ai_consume_quota checks the
-- caller's device session itself, exactly like the sync_* RPCs.
--
-- Limits are per plan, per task, per day (Asia/Kolkata calendar day) and live in
-- ai_daily_limits so the operator can change them without a deploy. A task with no
-- row, or a limit of 0, is not available on that plan.

CREATE TABLE IF NOT EXISTS public.ai_daily_limits (
  plan        TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'max')),
  task        TEXT NOT NULL CHECK (task IN ('form_answers', 'practice_feedback', 'roadmap_explanation')),
  daily_limit INT  NOT NULL CHECK (daily_limit >= 0),
  PRIMARY KEY (plan, task)
);
ALTER TABLE public.ai_daily_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_daily_limits FROM anon, authenticated;

-- Starting limits (owner to confirm). practice_feedback follows packages/config: Free has no AI feedback.
INSERT INTO public.ai_daily_limits (plan, task, daily_limit) VALUES
  ('free', 'form_answers', 10), ('free', 'practice_feedback', 0),  ('free', 'roadmap_explanation', 3),
  ('pro',  'form_answers', 100), ('pro', 'practice_feedback', 50), ('pro',  'roadmap_explanation', 20),
  ('max',  'form_answers', 300), ('max', 'practice_feedback', 150), ('max', 'roadmap_explanation', 50)
ON CONFLICT (plan, task) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  task    TEXT NOT NULL,
  used    INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, day, task)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

-- Same mapping as normalizeTier in packages/config/src/tiers.ts; an expired paid plan counts as Free.
CREATE OR REPLACE FUNCTION public.ai_plan_for(p_tier TEXT, p_expires_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT CASE
    WHEN p_expires_at IS NOT NULL AND p_expires_at < NOW() THEN 'free'
    WHEN LOWER(TRIM(COALESCE(p_tier, ''))) IN ('max', 'seeker_max', 'lifetime', 'enterprise', 'turbo') THEN 'max'
    WHEN LOWER(TRIM(COALESCE(p_tier, ''))) IN ('pro', 'lite', 'learner_pro', 'seeker_pro', 'learner', 'seeker') THEN 'pro'
    ELSE 'free' END;
$$;

CREATE OR REPLACE FUNCTION public.ai_consume_quota(
  p_user_id UUID,
  p_session_token TEXT,
  p_device_fingerprint TEXT,
  p_task TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, plan TEXT, used INT, daily_limit INT, day DATE)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  u        public.users_profile%ROWTYPE;
  v_plan   TEXT;
  v_limit  INT;
  v_used   INT;
  v_day    DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions s
                  WHERE s.user_id = p_user_id AND s.session_token = p_session_token
                    AND s.device_fingerprint = p_device_fingerprint AND s.is_active) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::TEXT, NULL::INT, NULL::INT, v_day;
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
  IF NOT FOUND OR u.status <> 'active' THEN
    RETURN QUERY SELECT FALSE, 'This account cannot use AI features.', NULL::TEXT, NULL::INT, NULL::INT, v_day;
    RETURN;
  END IF;

  v_plan := public.ai_plan_for(u.subscription_tier, u.expires_at);
  SELECT l.daily_limit INTO v_limit FROM public.ai_daily_limits l WHERE l.plan = v_plan AND l.task = p_task;
  IF COALESCE(v_limit, 0) = 0 THEN
    RETURN QUERY SELECT FALSE, 'This AI feature is not included in your plan.', v_plan, 0, 0, v_day;
    RETURN;
  END IF;

  -- Atomic check-and-increment: the row only changes while used < limit.
  INSERT INTO public.ai_usage AS a (user_id, day, task, used) VALUES (p_user_id, v_day, p_task, 1)
  ON CONFLICT (user_id, day, task) DO UPDATE SET used = a.used + 1 WHERE a.used < v_limit
  RETURNING a.used INTO v_used;

  IF v_used IS NULL THEN
    RETURN QUERY SELECT FALSE, 'You have used today''s AI limit for this feature. It resets at midnight IST.', v_plan, v_limit, v_limit, v_day;
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, 'ok', v_plan, v_used, v_limit, v_day;
END;
$$;

-- Gives back one unit when the model call failed or its output was rejected.
CREATE OR REPLACE FUNCTION public.ai_refund_quota(p_user_id UUID, p_task TEXT, p_day DATE)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  UPDATE public.ai_usage SET used = GREATEST(used - 1, 0)
   WHERE user_id = p_user_id AND task = p_task AND day = p_day;
$$;

REVOKE ALL ON FUNCTION public.ai_plan_for(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_consume_quota(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_refund_quota(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_consume_quota(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_refund_quota(UUID, TEXT, DATE) TO service_role;
