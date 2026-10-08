-- 034: In-app review, asked once a new account is 7 days old (the end of the trial week).
--
-- app_reviews            one review per user: the 10 System Usability Scale answers (1-5), how likely they are to
--                        recommend Nomadic (0-10), the best and the most frustrating thing (free text, optional),
--                        the platform and app version. RLS on, no client grants; reached only through the RPCs below.
--                        Deleting the account deletes the review (cascade).
-- app_review_status      anon, session-checked: due = the account is at least 7 days old and has no review yet.
-- app_review_submit      anon, session-checked; one review per user (a second one returns already_reviewed).
-- account_export_data    same signature; adds app_reviews.
--
-- Idempotent; nothing is dropped. The owner reads results with SQL (SUS score = sum of odd (a-1) and even (5-a),
-- times 2.5).
CREATE TABLE IF NOT EXISTS public.app_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES public.users_profile(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('windows', 'mac', 'android')),
  app_version  TEXT CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  sus          SMALLINT[] NOT NULL CHECK (array_length(sus, 1) = 10 AND 1 <= ALL (sus) AND 5 >= ALL (sus)),
  recommend    SMALLINT NOT NULL CHECK (recommend BETWEEN 0 AND 10),
  best         TEXT CHECK (best IS NULL OR char_length(best) <= 2000),
  frustrating  TEXT CHECK (frustrating IS NULL OR char_length(frustrating) <= 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_reviews FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_review_status(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, due BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', FALSE; RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, NULL::TEXT,
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = p_user_id AND up.created_at <= NOW() - INTERVAL '7 days')
    AND NOT EXISTS (SELECT 1 FROM public.app_reviews ar WHERE ar.user_id = p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_review_submit(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_platform TEXT, p_app_version TEXT, p_sus SMALLINT[], p_recommend SMALLINT, p_best TEXT, p_frustrating TEXT
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'; RETURN;
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('windows', 'mac', 'android')
     OR p_sus IS NULL OR array_length(p_sus, 1) IS DISTINCT FROM 10 OR NOT (1 <= ALL (p_sus) AND 5 >= ALL (p_sus))
     OR p_recommend IS NULL OR p_recommend NOT BETWEEN 0 AND 10
     OR char_length(COALESCE(p_app_version, '')) > 40
     OR char_length(COALESCE(p_best, '')) > 2000 OR char_length(COALESCE(p_frustrating, '')) > 2000 THEN
    RETURN QUERY SELECT FALSE, 'bad_request'; RETURN;
  END IF;
  INSERT INTO public.app_reviews (user_id, platform, app_version, sus, recommend, best, frustrating)
  VALUES (p_user_id, p_platform, NULLIF(BTRIM(p_app_version), ''), p_sus, p_recommend,
          NULLIF(BTRIM(p_best), ''), NULLIF(BTRIM(p_frustrating), ''))
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'already_reviewed'; RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- Export: same as 028 plus app_reviews.
CREATE OR REPLACE FUNCTION public.account_export_data(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, data JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT;
  v_data  JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions s
                  WHERE s.user_id = p_user_id AND s.session_token = p_session_token
                    AND s.device_fingerprint = p_device_fingerprint AND s.is_active) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::JSONB;
    RETURN;
  END IF;
  SELECT LOWER(up.email) INTO v_email FROM public.users_profile up WHERE up.id = p_user_id;
  SELECT jsonb_build_object(
    'account', (SELECT to_jsonb(up) - 'password_hash' FROM public.users_profile up WHERE up.id = p_user_id),
    'cloud_profile', (SELECT to_jsonb(p) - 'user_id' FROM public.user_cloud_profiles p WHERE p.user_id = p_user_id),
    'preferences', (SELECT to_jsonb(p) - 'user_id' FROM public.user_preferences p WHERE p.user_id = p_user_id),
    'applications', COALESCE((SELECT jsonb_agg(to_jsonb(a) - 'user_id' ORDER BY a.applied_at) FROM public.user_applications a WHERE a.user_id = p_user_id), '[]'::jsonb),
    'saved_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id') FROM public.user_saved_jobs s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'hidden_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(h) - 'user_id' ORDER BY h.hidden_at) FROM public.user_hidden_jobs h WHERE h.user_id = p_user_id), '[]'::jsonb),
    'resumes', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.user_resumes r WHERE r.user_id = p_user_id), '[]'::jsonb),
    'job_matches', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'user_id') FROM public.user_job_matches m WHERE m.user_id = p_user_id), '[]'::jsonb),
    'learning_tracks', COALESCE((SELECT jsonb_agg(to_jsonb(t) - 'user_id') FROM public.user_tracks t WHERE t.user_id = p_user_id), '[]'::jsonb),
    'learn_state', COALESCE((SELECT jsonb_agg(to_jsonb(ls) - 'user_id' ORDER BY ls.kind) FROM public.user_learn_state ls WHERE ls.user_id = p_user_id), '[]'::jsonb),
    'app_reviews', COALESCE((SELECT jsonb_agg(to_jsonb(ar) - 'user_id' ORDER BY ar.created_at) FROM public.app_reviews ar WHERE ar.user_id = p_user_id), '[]'::jsonb),
    'learning_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at) FROM public.learning_events e WHERE e.user_id = p_user_id), '[]'::jsonb),
    'outreach_reports', COALESCE((SELECT jsonb_agg(to_jsonb(o) - 'user_id' ORDER BY o.created_at) FROM public.outreach_contact_reports o WHERE o.user_id = p_user_id), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'session_token' ORDER BY s.created_at) FROM public.user_sessions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp) - 'user_id' - 'raw_payload' ORDER BY rp.created_at)
                            FROM public.razorpay_payments rp WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email), '[]'::jsonb),
    'billing_records', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM public.billing_records b WHERE LOWER(b.user_email) = v_email), '[]'::jsonb)
  ) INTO v_data;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_data;
END;
$$;

REVOKE ALL ON FUNCTION public.app_review_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_review_submit(UUID, TEXT, TEXT, TEXT, TEXT, SMALLINT[], SMALLINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_review_status(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_review_submit(UUID, TEXT, TEXT, TEXT, TEXT, SMALLINT[], SMALLINT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
