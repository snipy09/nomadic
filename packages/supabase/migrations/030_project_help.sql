-- 030: AI help inside guided Learn projects (ai-proxy kind project_help).
--
-- usage_counters metrics       + ai_project_help (all earlier metrics kept).
-- ai_project_help_limits(plan) AI help answers per day, rendered from packages/config
--                              (ai-project-help-limits-parity.test.ts).
-- consume_ai_quota             same signature as 029; maps project_help to its metric and limit.
-- refund_ai_quota              same signature as 029; maps project_help.
-- Grants as in 020/029: service_role only. Nothing is dropped, so this applies without a paste.
-- Quotas reset at midnight Asia/Kolkata (billing_today), returned as resets_at.

ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_metric_check;
ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_metric_check
  CHECK (metric IN ('apply', 'ai_rubric_feedback', 'ai_form_answers', 'ai_outreach_email', 'outreach_contact_rows',
                    'ai_roadmap', 'ai_roadmap_adjust', 'ai_project_help'));

CREATE OR REPLACE FUNCTION public.ai_project_help_limits(p_plan TEXT)
RETURNS TABLE (ai_project_help_per_day INT)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT t.ai_project_help_per_day
  FROM (VALUES
    -- BEGIN ai_project_help_limits (generated from packages/config)
    ('free', 5),
    ('pro', 40),
    ('max', 150)
    -- END ai_project_help_limits
  ) AS t(plan, ai_project_help_per_day)
  WHERE t.plan = p_plan;
$$;

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
                          WHEN 'form_answers'    THEN 'ai_form_answers'
                          WHEN 'outreach_email'  THEN 'ai_outreach_email'
                          WHEN 'roadmap_plan'    THEN 'ai_roadmap'
                          WHEN 'roadmap_adjust'  THEN 'ai_roadmap_adjust'
                          WHEN 'project_help'    THEN 'ai_project_help' END;
  IF v_metric IS NULL THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;

  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT * INTO l FROM public.ai_limits(v_plan);
  IF p_kind = 'rubric_feedback' THEN
    v_allowed := COALESCE(l.ai_feedback, FALSE) AND COALESCE(l.ai_feedback_per_day, 0) > 0;
    v_limit   := COALESCE(l.ai_feedback_per_day, 0);
  ELSIF p_kind = 'outreach_email' THEN
    v_limit   := COALESCE((SELECT o.ai_outreach_drafts_per_day FROM public.ai_outreach_limits(v_plan) o), 0);
    v_allowed := v_limit > 0;
  ELSIF p_kind = 'roadmap_plan' THEN
    v_limit   := COALESCE(l.ai_roadmap_per_day, 0);
    v_allowed := v_limit > 0;
  ELSIF p_kind = 'roadmap_adjust' THEN
    v_limit   := COALESCE(l.ai_roadmap_adjust_per_day, 0);
    v_allowed := v_limit > 0;
  ELSIF p_kind = 'project_help' THEN
    v_limit   := COALESCE((SELECT h.ai_project_help_per_day FROM public.ai_project_help_limits(v_plan) h), 0);
    v_allowed := v_limit > 0;
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

CREATE OR REPLACE FUNCTION public.refund_ai_quota(p_user_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_metric TEXT := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                               WHEN 'form_answers'    THEN 'ai_form_answers'
                               WHEN 'outreach_email'  THEN 'ai_outreach_email'
                               WHEN 'roadmap_plan'    THEN 'ai_roadmap'
                               WHEN 'roadmap_adjust'  THEN 'ai_roadmap_adjust'
                               WHEN 'project_help'    THEN 'ai_project_help' END;
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

REVOKE ALL ON FUNCTION public.ai_project_help_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_project_help_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, TEXT) TO service_role;
