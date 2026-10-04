-- Nomadic: migration 026 (sync hidden jobs and follow-up dates). Paste into Supabase SQL Editor and Run.
BEGIN;
-- 026: sync hidden jobs ("Not interested") and tracker follow-up dates to the account.
--
-- Both were stored only on the computer (desktop local migrations 5 and 6), so they were lost on a
-- reinstall or a new laptop.
--
-- user_hidden_jobs                 one row per hidden job (apply URL is the key, as for saved jobs).
-- user_applications.follow_up_at   optional follow-up date (calendar date, no time).
-- sync_hide_job / sync_unhide_job  anon, session-checked.
-- sync_pull_hidden_jobs            anon, session-checked; newest first, at most 2000.
-- sync_set_application_follow_up   anon, session-checked; NULL clears the date. Separate from
--                                  sync_push_application so that function keeps its signature.
-- sync_pull_user_data              same signature; applications now include follow_up_at.
-- account_export_data              same signature; adds hidden_jobs (follow_up_at comes with applications).
-- No DROP statements: existing clients keep working.
CREATE TABLE IF NOT EXISTS public.user_hidden_jobs (
  user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  apply_url TEXT NOT NULL CHECK (length(apply_url) BETWEEN 1 AND 2048),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 500),
  company TEXT NOT NULL DEFAULT '' CHECK (length(company) <= 500),
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, apply_url)
);
CREATE INDEX IF NOT EXISTS idx_user_hidden_jobs_user ON public.user_hidden_jobs (user_id, hidden_at DESC);
ALTER TABLE public.user_hidden_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_hidden_jobs FROM anon, authenticated;
ALTER TABLE public.user_applications ADD COLUMN IF NOT EXISTS follow_up_at DATE;
CREATE OR REPLACE FUNCTION public.sync_hide_job(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_apply_url TEXT, p_title TEXT DEFAULT NULL, p_company TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
    RETURN;
  END IF;
  IF p_apply_url IS NULL OR length(p_apply_url) NOT BETWEEN 1 AND 2048 THEN
    RETURN QUERY SELECT FALSE, 'Invalid job link.';
    RETURN;
  END IF;
  IF (SELECT COUNT(*) FROM public.user_hidden_jobs h WHERE h.user_id = p_user_id) >= 5000
     AND NOT EXISTS (SELECT 1 FROM public.user_hidden_jobs h WHERE h.user_id = p_user_id AND h.apply_url = p_apply_url) THEN
    RETURN QUERY SELECT FALSE, 'Too many hidden jobs (5000 max).';
    RETURN;
  END IF;
  INSERT INTO public.user_hidden_jobs (user_id, apply_url, title, company)
  VALUES (p_user_id, p_apply_url, left(COALESCE(p_title, ''), 500), left(COALESCE(p_company, ''), 500))
  ON CONFLICT (user_id, apply_url) DO UPDATE SET title = EXCLUDED.title, company = EXCLUDED.company;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_unhide_job(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_apply_url TEXT
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
    RETURN;
  END IF;
  DELETE FROM public.user_hidden_jobs h WHERE h.user_id = p_user_id AND h.apply_url = p_apply_url;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_pull_hidden_jobs(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (ok BOOLEAN, error TEXT, hidden_jobs JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_jobs JSONB;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::JSONB;
    RETURN;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_jobs
  FROM (
    SELECT h.apply_url, h.title, h.company, h.hidden_at
    FROM public.user_hidden_jobs h
    WHERE h.user_id = p_user_id
    ORDER BY h.hidden_at DESC
    LIMIT 2000
  ) x;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_jobs;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_set_application_follow_up(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_apply_url TEXT, p_follow_up_at DATE
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
    RETURN;
  END IF;
  UPDATE public.user_applications a
     SET follow_up_at = p_follow_up_at, updated_at = NOW()
   WHERE a.user_id = p_user_id AND a.apply_url = p_apply_url;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Application not found.';
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
-- Pull: same signature and body as 010, applications now include follow_up_at.
CREATE OR REPLACE FUNCTION public.sync_pull_user_data(
  p_user_id UUID,
  p_session_token TEXT,
  p_device_fingerprint TEXT
)
RETURNS TABLE (ok BOOLEAN, error TEXT, profile JSONB, applications JSONB, saved_jobs JSONB, resumes JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_valid BOOLEAN;
  v_profile JSONB;
  v_apps JSONB;
  v_saved JSONB;
  v_resumes JSONB;
BEGIN
  SELECT is_active INTO v_is_valid
  FROM public.user_sessions
  WHERE session_token = p_session_token
    AND user_id = p_user_id
    AND device_fingerprint = p_device_fingerprint
  LIMIT 1;
  IF NOT FOUND OR v_is_valid = FALSE THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::JSONB, NULL::JSONB, NULL::JSONB, NULL::JSONB;
    RETURN;
  END IF;
  SELECT to_jsonb(p) INTO v_profile
  FROM public.user_cloud_profiles p
  WHERE p.user_id = p_user_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_apps
  FROM (
    SELECT company, title, apply_url, status, mode, applied_at, notes, status_history, updated_at, follow_up_at
    FROM public.user_applications
    WHERE user_id = p_user_id
    ORDER BY applied_at DESC
    LIMIT 500
  ) a;
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_saved
  FROM (
    SELECT title, company, apply_url, location, salary, source, score, description, saved_at
    FROM public.user_saved_jobs
    WHERE user_id = p_user_id
    ORDER BY saved_at DESC
  ) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_resumes
  FROM (
    SELECT name, target_role, file_path, resume_text, is_default, created_at
    FROM public.user_resumes
    WHERE user_id = p_user_id
    ORDER BY is_default DESC, created_at DESC
  ) r;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_profile, v_apps, v_saved, v_resumes;
END;
$$;
-- Export: same as 022 plus hidden_jobs.
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
    'learning_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at) FROM public.learning_events e WHERE e.user_id = p_user_id), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'session_token' ORDER BY s.created_at) FROM public.user_sessions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp) - 'user_id' - 'raw_payload' ORDER BY rp.created_at)
                            FROM public.razorpay_payments rp WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email), '[]'::jsonb),
    'billing_records', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM public.billing_records b WHERE LOWER(b.user_email) = v_email), '[]'::jsonb)
  ) INTO v_data;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_data;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_hide_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_unhide_job(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_pull_hidden_jobs(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_set_application_follow_up(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_pull_user_data(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_hide_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_unhide_job(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull_hidden_jobs(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_set_application_follow_up(UUID, TEXT, TEXT, TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull_user_data(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('026_sync_hidden_jobs_follow_ups.sql', 'ae127a5ad0657fcc70ef29534f5ce42774669e52a9e58f964896d26a41b69d4d') ON CONFLICT (filename) DO NOTHING;
COMMIT;
