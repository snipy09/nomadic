-- 027: Learn v2 student state and event types.
--
-- user_learn_state        one JSON document per user and kind: roadmap | schedule | projects | notes.
--                         RLS on, no client grants; reached only through the RPCs below.
-- learning_save_state     anon, session-checked (learning_session_ok), advisory-locked per user.
--                         Last writer wins by the client's updated_at; an older write is ignored
--                         and reported as stale so the client pulls first. 512 KB per document.
-- learning_pull_state     anon, session-checked; every document of the user.
-- learning_events.type    widened with the v2 task, problem, project and roadmap events. They are not
--                         item-level practice, so learning_record_events (007) keeps them out of the
--                         free plan's 10 attempts a day (its cap only counts quiz_passed, quiz_failed,
--                         problem_solved and review_done with an item id); no change needed there.
-- account_export_data     same signature; adds learn_state. Deletion cascades from users_profile.
-- The constraint swap (DROP CONSTRAINT) is the only destructive statement.

ALTER TABLE public.learning_events DROP CONSTRAINT IF EXISTS learning_events_type_check;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_type_check CHECK (type IN (
  'lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known',
  'task_done', 'task_skipped', 'task_moved', 'problem_attempted', 'stage_done', 'project_started',
  'project_done', 'roadmap_accepted'
));

CREATE TABLE IF NOT EXISTS public.user_learn_state (
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('roadmap', 'schedule', 'projects', 'notes')),
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.user_learn_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_learn_state FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.learning_save_state(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_kind TEXT, p_value JSONB, p_updated_at TIMESTAMPTZ
)
RETURNS TABLE (ok BOOLEAN, error TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_current TIMESTAMPTZ;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('roadmap', 'schedule', 'projects', 'notes') OR p_value IS NULL
     OR p_updated_at IS NULL OR octet_length(p_value::text) > 524288 THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TIMESTAMPTZ; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learn_state:' || p_user_id::text));
  SELECT s.updated_at INTO v_current FROM public.user_learn_state s WHERE s.user_id = p_user_id AND s.kind = p_kind;
  IF v_current IS NOT NULL AND v_current > p_updated_at THEN
    RETURN QUERY SELECT FALSE, 'stale', v_current; RETURN;
  END IF;
  INSERT INTO public.user_learn_state (user_id, kind, value, updated_at, received_at)
  VALUES (p_user_id, p_kind, p_value, LEAST(p_updated_at, NOW() + INTERVAL '5 minutes'), NOW())
  ON CONFLICT (user_id, kind) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, received_at = NOW();
  RETURN QUERY SELECT TRUE, NULL::TEXT, LEAST(p_updated_at, NOW() + INTERVAL '5 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.learning_pull_state(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (kind TEXT, value JSONB, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN; END IF;
  RETURN QUERY SELECT s.kind, s.value, s.updated_at FROM public.user_learn_state s
  WHERE s.user_id = p_user_id ORDER BY s.kind;
END;
$$;

-- Export: same as 026 plus learn_state.
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
    'learning_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at) FROM public.learning_events e WHERE e.user_id = p_user_id), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'session_token' ORDER BY s.created_at) FROM public.user_sessions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp) - 'user_id' - 'raw_payload' ORDER BY rp.created_at)
                            FROM public.razorpay_payments rp WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email), '[]'::jsonb),
    'billing_records', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM public.billing_records b WHERE LOWER(b.user_email) = v_email), '[]'::jsonb)
  ) INTO v_data;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_data;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_save_state(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_pull_state(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learning_save_state(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_pull_state(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
