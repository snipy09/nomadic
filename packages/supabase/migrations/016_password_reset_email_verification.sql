-- 016: password reset and email verification (F2, sent through Resend).
--
-- Codes are 8 digits, stored only as bcrypt hashes, expire (reset 30 min, verify 24 h),
-- are single use, allow 5 wrong guesses before they are burned, and a newer code
-- replaces older unused ones. Requests are limited per email and purpose to 3 an hour and 10 a day,
-- so a targeted guesser gets at most 50 tries a day against a 10^8 space.
--
-- Who may call what:
--   request_password_reset       service_role only (auth-email Edge Function, which sends the email)
--   request_email_verification   service_role only (auth-email Edge Function); session-checked inside
--   confirm_password_reset       anon: proves inbox control with the emailed code (no session exists yet)
--   confirm_email_verification   anon: session-checked
--   account_email_status         anon: session-checked
-- All are SECURITY DEFINER with search_path = public, extensions.

ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Accounts that already proved inbox control through Google (migration 015, if applied).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users_profile' AND column_name = 'google_sub') THEN
    EXECUTE 'UPDATE public.users_profile SET email_verified_at = COALESCE(last_login, NOW())
             WHERE google_sub IS NOT NULL AND email_verified_at IS NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.account_email_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
  code_hash  TEXT NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_email_codes_user ON public.account_email_codes (user_id, purpose, created_at DESC);
ALTER TABLE public.account_email_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_email_codes FROM anon, authenticated;

-- Every request counts toward the limit, including ones for unknown emails, so the
-- limit itself does not reveal whether an account exists.
CREATE TABLE IF NOT EXISTS public.account_email_requests (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_email_requests ON public.account_email_requests (email, purpose, created_at DESC);
ALTER TABLE public.account_email_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_email_requests FROM anon, authenticated;

-- Internal: rate limit + replace older codes + issue a new one. Returns the plaintext code or NULL when limited.
CREATE OR REPLACE FUNCTION public.account_email_issue_code(p_user_id UUID, p_email TEXT, p_purpose TEXT, p_ttl INTERVAL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF (SELECT count(*) FROM public.account_email_requests r
       WHERE r.email = p_email AND r.purpose = p_purpose AND r.created_at > NOW() - INTERVAL '1 hour') >= 3
     OR (SELECT count(*) FROM public.account_email_requests r
       WHERE r.email = p_email AND r.purpose = p_purpose AND r.created_at > NOW() - INTERVAL '1 day') >= 10 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.account_email_requests (email, purpose) VALUES (p_email, p_purpose);
  DELETE FROM public.account_email_requests r WHERE r.created_at < NOW() - INTERVAL '2 days';
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.account_email_codes c SET used_at = NOW()
   WHERE c.user_id = p_user_id AND c.purpose = p_purpose AND c.used_at IS NULL;
  DELETE FROM public.account_email_codes c WHERE c.expires_at < NOW() - INTERVAL '7 days';

  -- 00000000-99999999 from 4 random bytes (modulo bias < 3%, irrelevant with 5 guesses per code).
  v_code := LPAD(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::TEXT, 8, '0');
  INSERT INTO public.account_email_codes (user_id, purpose, code_hash, expires_at)
  VALUES (p_user_id, p_purpose, crypt(v_code, gen_salt('bf', 8)), NOW() + p_ttl);
  RETURN v_code;
END;
$$;

-- Internal: checks a code against the newest live code for (user, purpose); burns it on success or after 5 misses.
CREATE OR REPLACE FUNCTION public.account_email_check_code(p_user_id UUID, p_purpose TEXT, p_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c public.account_email_codes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.account_email_codes ac
   WHERE ac.user_id = p_user_id AND ac.purpose = p_purpose AND ac.used_at IS NULL AND ac.expires_at > NOW()
   ORDER BY ac.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF p_code ~ '^[0-9]{8}$' AND crypt(p_code, c.code_hash) = c.code_hash THEN
    UPDATE public.account_email_codes SET used_at = NOW() WHERE id = c.id;
    RETURN TRUE;
  END IF;
  UPDATE public.account_email_codes
     SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
   WHERE id = c.id;
  RETURN FALSE;
END;
$$;

-- Password reset ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_password_reset(p_email TEXT)
RETURNS TABLE (send BOOLEAN, email TEXT, full_name TEXT, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  u       public.users_profile%ROWTYPE;
  v_code  TEXT;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR LENGTH(v_email) > 254 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1;
  v_code := public.account_email_issue_code(CASE WHEN FOUND AND u.status = 'active' THEN u.id END, v_email, 'password_reset', INTERVAL '30 minutes');
  IF v_code IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, u.email, u.full_name, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_password_reset(p_email TEXT, p_code TEXT, p_new_password TEXT)
RETURNS TABLE (ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  u       public.users_profile%ROWTYPE;
BEGIN
  IF p_new_password IS NULL OR LENGTH(p_new_password) < 6 OR LENGTH(p_new_password) > 1000 THEN
    RETURN QUERY SELECT FALSE, 'Password must be at least 6 characters.';
    RETURN;
  END IF;
  SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1;
  -- One message for unknown email, wrong, expired or used code (no account enumeration).
  IF NOT FOUND OR u.status <> 'active' OR NOT public.account_email_check_code(u.id, 'password_reset', TRIM(COALESCE(p_code, ''))) THEN
    RETURN QUERY SELECT FALSE, 'That code is wrong or has expired. Request a new one.';
    RETURN;
  END IF;

  UPDATE public.users_profile
     SET password_hash = crypt(public.login_prehash(u.email, p_new_password), gen_salt('bf', 10)),
         email_verified_at = COALESCE(email_verified_at, NOW()),
         updated_at = NOW()
   WHERE public.users_profile.id = u.id;
  -- A reset signs every device out and clears the lockout so the new password works at once.
  UPDATE public.user_sessions s SET is_active = FALSE WHERE s.user_id = u.id;
  DELETE FROM public.login_tickets lt WHERE lt.user_id = u.id;
  DELETE FROM public.login_attempts la WHERE la.email = LOWER(u.email) AND la.succeeded = FALSE;
  RETURN QUERY SELECT TRUE, 'Password changed. Sign in with your new password.';
END;
$$;

-- Email verification -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_session_user(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_sessions s
                  WHERE s.user_id = p_user_id AND s.session_token = p_session_token
                    AND s.device_fingerprint = p_device_fingerprint AND s.is_active);
$$;

CREATE OR REPLACE FUNCTION public.request_email_verification(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (send BOOLEAN, reason TEXT, email TEXT, full_name TEXT, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  u      public.users_profile%ROWTYPE;
  v_code TEXT;
BEGIN
  IF NOT public.account_session_user(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
  IF u.email_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'Your email is already verified.', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  v_code := public.account_email_issue_code(u.id, LOWER(u.email), 'email_verification', INTERVAL '24 hours');
  IF v_code IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Too many emails requested. Try again later.', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, 'ok', u.email, u.full_name, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_email_verification(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_code TEXT)
RETURNS TABLE (ok BOOLEAN, reason TEXT, email_verified_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_at TIMESTAMPTZ;
BEGIN
  IF NOT public.account_session_user(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  SELECT up.email_verified_at INTO v_at FROM public.users_profile up WHERE up.id = p_user_id;
  IF v_at IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'Your email is already verified.', v_at;
    RETURN;
  END IF;
  IF NOT public.account_email_check_code(p_user_id, 'email_verification', TRIM(COALESCE(p_code, ''))) THEN
    RETURN QUERY SELECT FALSE, 'That code is wrong or has expired. Request a new one.', NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  UPDATE public.users_profile SET email_verified_at = NOW(), updated_at = NOW()
   WHERE public.users_profile.id = p_user_id RETURNING public.users_profile.email_verified_at INTO v_at;
  RETURN QUERY SELECT TRUE, 'Email verified.', v_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_email_status(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, email TEXT, email_verified_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.account_session_user(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, NULL::TEXT, up.email, up.email_verified_at FROM public.users_profile up WHERE up.id = p_user_id;
END;
$$;

-- Grants (008 default-deny: nothing new is callable until granted here) --------
REVOKE ALL ON FUNCTION public.account_email_issue_code(UUID, TEXT, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_email_check_code(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_session_user(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_password_reset(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_email_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_password_reset(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_email_verification(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_email_status(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_email_verification(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_password_reset(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_email_verification(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_status(UUID, TEXT, TEXT) TO anon, authenticated;
