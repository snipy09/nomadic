-- Nomadic: migration 022 (account export and deletion). Paste into Supabase SQL Editor and Run.
BEGIN;
-- 022: account data export and account deletion (F10, SAAS_PLAN section 2 "Trust", DPDP/GDPR).
--
-- account_export_data   anon, session-checked. Returns everything stored about the caller as one
--                       JSON document. Never returns password hashes, session tokens, login tickets
--                       or raw payment-gateway payloads.
-- account_delete        anon, session-checked AND requires a fresh one-time login ticket (the user
--                       re-entered their password through authenticate_user) plus the account email
--                       typed as confirmation. Deletes the account and everything that references it.
--                       Payment records are kept for accounting but detached from the person.
-- Both are SECURITY DEFINER with search_path = public, extensions.
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
CREATE OR REPLACE FUNCTION public.account_delete(
  p_user_id UUID,
  p_session_token TEXT,
  p_device_fingerprint TEXT,
  p_login_ticket TEXT,
  p_confirm_email TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions s
                  WHERE s.user_id = p_user_id AND s.session_token = p_session_token
                    AND s.device_fingerprint = p_device_fingerprint AND s.is_active) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
    RETURN;
  END IF;
  SELECT LOWER(up.email) INTO v_email FROM public.users_profile up WHERE up.id = p_user_id;
  IF v_email IS NULL OR v_email <> LOWER(TRIM(COALESCE(p_confirm_email, ''))) THEN
    RETURN QUERY SELECT FALSE, 'Type your account email exactly to confirm.';
    RETURN;
  END IF;
  -- Fresh re-authentication: a single-use ticket from authenticate_user issued to this user.
  UPDATE public.login_tickets lt SET used_at = NOW()
   WHERE lt.ticket_hash = encode(digest(COALESCE(p_login_ticket, ''), 'sha256'), 'hex')
     AND lt.user_id = p_user_id AND lt.used_at IS NULL AND lt.expires_at > NOW();
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Enter your password again to delete your account.';
    RETURN;
  END IF;
  -- Kept for accounting and refunds, without the person: no email, no user id, no gateway payload.
  UPDATE public.razorpay_payments rp
     SET user_id = NULL, email = 'deleted-account', raw_payload = '{}'::jsonb
   WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email;
  UPDATE public.billing_records b SET user_email = 'deleted-account' WHERE LOWER(b.user_email) = v_email;
  DELETE FROM public.login_attempts la WHERE la.email = v_email;
  DELETE FROM public.signup_attempts sa WHERE sa.email = v_email;
  -- Sessions, tickets, profile, applications, saved jobs, resumes, matches, preferences,
  -- learning events and tracks all reference users_profile ON DELETE CASCADE.
  -- learning_events is append-only (007 trigger blocks UPDATE, not DELETE).
  DELETE FROM public.users_profile up WHERE up.id = p_user_id;
  RETURN QUERY SELECT TRUE, 'Your account and its data were deleted.';
END;
$$;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_delete(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_delete(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('022_account_export_delete.sql', 'ee4c9d10f3666c4ba91420bde262f2b10d38bc2a46f51a6e2d519d6aa784dd55') ON CONFLICT DO NOTHING;
COMMIT;
