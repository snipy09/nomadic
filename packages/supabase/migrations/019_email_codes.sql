-- 019: one-time email codes for password reset and email verification (DECISIONS #22: Resend via an Edge Function).
--
-- Flow
--   Edge Function send-email-code (service_role) -> request_email_code(...)  -> emails the code with Resend.
--   Desktop (anon key)                           -> confirm_password_reset(...) / confirm_email_verification(...).
--
-- Security properties (docs/SECURITY_CHECKLIST.md S11)
--   * Only a salted sha256 of each 6-digit code is stored; the plain code leaves the database once, in the
--     result of request_email_code, which only service_role may call.
--   * No account enumeration (S2d): for a reset, an unknown email, a rate-limited email and a real account all
--     look the same to the caller of the Edge Function; request rows are written for unknown emails too, so the
--     per-email limit behaves identically. confirm_password_reset returns one generic message for every failure.
--   * A code is valid for 15 minutes, single use, 5 wrong guesses lock it, and requesting a new code retires the
--     previous one. At most 3 codes per email per hour (all purposes) and 200 sent codes per hour overall
--     (protects the Resend quota).
--   * A successful reset writes the password exactly like set_user_password (bcrypt of login_prehash), ends
--     every device session, burns outstanding login tickets, clears failed sign-in attempts for that email and
--     marks the email verified (receiving the code proves ownership of the inbox).
--   * Unverified accounts keep full access (sign-in is never blocked); the app shows a reminder. Verification
--     only records users_profile.email_verified_at.
-- Idempotent: safe to re-run.

ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.email_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('reset', 'verify')),
  code_hash  TEXT NOT NULL,              -- '<salt hex>$<sha256(salt:code) hex>'
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON public.email_codes (email, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_codes_user ON public.email_codes (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_codes_created ON public.email_codes (created_at);
ALTER TABLE public.email_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_codes FROM PUBLIC, anon, authenticated;

-- Every request, including ones for emails without an account, so the per-email limit cannot be used to
-- tell the two apart.
CREATE TABLE IF NOT EXISTS public.email_code_requests (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_code_requests_email_time ON public.email_code_requests (email, created_at DESC);
ALTER TABLE public.email_code_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_code_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.email_code_requests_id_seq FROM PUBLIC, anon, authenticated;

-- Helpers (not callable by clients) ---------------------------------------------------------------------------

-- Constant-time equality of two hex strings (no early exit on the first differing byte).
CREATE OR REPLACE FUNCTION public.email_code_ct_equal(p_a TEXT, p_b TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = public, extensions AS $$
DECLARE
  a BYTEA;
  b BYTEA;
  d INT := 0;
BEGIN
  IF p_a IS NULL OR p_b IS NULL OR p_a !~ '^[0-9a-f]*$' OR p_b !~ '^[0-9a-f]*$'
     OR length(p_a) <> length(p_b) OR length(p_a) % 2 <> 0 THEN
    RETURN FALSE;
  END IF;
  a := decode(p_a, 'hex');
  b := decode(p_b, 'hex');
  FOR i IN 0 .. length(a) - 1 LOOP
    d := d | (get_byte(a, i) # get_byte(b, i));
  END LOOP;
  RETURN d = 0;
END;
$$;

-- True when stored ('salt$hash') matches the submitted code.
CREATE OR REPLACE FUNCTION public.email_code_matches(p_stored TEXT, p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT public.email_code_ct_equal(
    split_part(p_stored, '$', 2),
    encode(digest(split_part(p_stored, '$', 1) || ':' || COALESCE(p_code, ''), 'sha256'), 'hex'));
$$;

-- Same check as every session-checked RPC (sync_*, get_entitlements, admin_*).
CREATE OR REPLACE FUNCTION public.email_session_ok(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.user_id = p_user_id AND s.session_token = p_session_token
      AND s.device_fingerprint = p_device_fingerprint AND s.is_active = TRUE);
$$;

REVOKE ALL ON FUNCTION public.email_code_ct_equal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_code_matches(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_session_ok(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- request_email_code (service_role only) -----------------------------------------------------------------------
-- status:
--   'send'             code (6 digits) and email are set: the caller emails it.
--   'skip'             reset only: unknown email, rate limited or global cap. The caller must answer exactly as
--                      for 'send' (no enumeration) and send nothing.
--   'invalid'          malformed email or purpose (says nothing about accounts).
--   'unauthorized'     verify only: the session is not valid.
--   'already_verified' verify only.
--   'rate_limited'     verify only (the caller already proved who they are).
CREATE OR REPLACE FUNCTION public.request_email_code(
  p_email              TEXT,
  p_purpose            TEXT,
  p_user_id            UUID DEFAULT NULL,
  p_session_token      TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS TABLE (status TEXT, code TEXT, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email  TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  u        public.users_profile%ROWTYPE;
  v_found  BOOLEAN := FALSE;
  v_recent INT;
  v_global INT;
  v_code   TEXT;
  v_salt   TEXT;
BEGIN
  IF p_purpose NOT IN ('reset', 'verify') THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;

  IF p_purpose = 'verify' THEN
    IF p_user_id IS NULL OR NOT public.email_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
      RETURN QUERY SELECT 'unauthorized'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
    END IF;
    SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'unauthorized'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
    END IF;
    IF u.email_verified_at IS NOT NULL THEN
      RETURN QUERY SELECT 'already_verified'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
    END IF;
    v_email := LOWER(TRIM(u.email));   -- always the account's own address, never one from the request
    v_found := TRUE;
  ELSE
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR LENGTH(v_email) > 254 THEN
      RETURN QUERY SELECT 'invalid'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
    END IF;
    SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1;
    v_found := FOUND;
  END IF;

  -- Per-email limit, counted before this request and recorded whether or not the account exists.
  SELECT count(*) INTO v_recent FROM public.email_code_requests r
   WHERE r.email = v_email AND r.created_at > NOW() - INTERVAL '1 hour';
  INSERT INTO public.email_code_requests (email, purpose) VALUES (v_email, p_purpose);
  DELETE FROM public.email_code_requests r WHERE r.created_at < NOW() - INTERVAL '1 day';

  SELECT count(*) INTO v_global FROM public.email_codes c WHERE c.created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= 3 OR v_global >= 200 THEN
    RETURN QUERY SELECT CASE WHEN p_purpose = 'verify' THEN 'rate_limited' ELSE 'skip' END, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOT v_found THEN
    RETURN QUERY SELECT 'skip'::TEXT, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;

  -- A new code retires any earlier one for the same purpose.
  UPDATE public.email_codes c SET used_at = NOW()
   WHERE c.user_id = u.id AND c.purpose = p_purpose AND c.used_at IS NULL;

  v_code := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::TEXT, 6, '0');
  v_salt := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.email_codes (user_id, email, purpose, code_hash, expires_at)
  VALUES (u.id, v_email, p_purpose,
          v_salt || '$' || encode(digest(v_salt || ':' || v_code, 'sha256'), 'hex'),
          NOW() + INTERVAL '15 minutes');
  DELETE FROM public.email_codes c WHERE c.created_at < NOW() - INTERVAL '1 day';

  RETURN QUERY SELECT 'send'::TEXT, v_code, v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.request_email_code(TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_email_code(TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

-- confirm_password_reset (anon) ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_password_reset(p_email TEXT, p_code TEXT, p_new_password TEXT)
RETURNS TABLE (ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email   TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_generic CONSTANT TEXT := 'That code is not valid or has expired. Request a new code.';
  c         public.email_codes%ROWTYPE;
  u         public.users_profile%ROWTYPE;
BEGIN
  -- Password rules are the same as register_user (009); checked first so a typo does not burn an attempt.
  IF p_new_password IS NULL OR LENGTH(p_new_password) < 6 THEN
    RETURN QUERY SELECT FALSE, 'Password must be at least 6 characters.'; RETURN;
  END IF;
  IF COALESCE(p_code, '') !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT FALSE, v_generic; RETURN;
  END IF;

  SELECT * INTO c FROM public.email_codes ec
   WHERE ec.email = v_email AND ec.purpose = 'reset' AND ec.used_at IS NULL
   ORDER BY ec.created_at DESC LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR c.expires_at <= NOW() OR c.attempts >= 5 THEN
    RETURN QUERY SELECT FALSE, v_generic; RETURN;
  END IF;

  IF NOT public.email_code_matches(c.code_hash, p_code) THEN
    UPDATE public.email_codes ec SET attempts = ec.attempts + 1 WHERE ec.id = c.id;
    RETURN QUERY SELECT FALSE, v_generic; RETURN;
  END IF;

  UPDATE public.email_codes ec SET used_at = NOW(), attempts = ec.attempts + 1 WHERE ec.id = c.id;

  SELECT * INTO u FROM public.users_profile up WHERE up.id = c.user_id;
  IF NOT FOUND OR LOWER(TRIM(u.email)) <> v_email THEN
    RETURN QUERY SELECT FALSE, v_generic; RETURN;
  END IF;

  -- Same storage as set_user_password (008): bcrypt of the client pre-hash.
  UPDATE public.users_profile up
     SET password_hash = crypt(public.login_prehash(u.email, p_new_password), gen_salt('bf', 10)),
         email_verified_at = COALESCE(up.email_verified_at, NOW()),
         updated_at = NOW()
   WHERE up.id = u.id;

  UPDATE public.user_sessions s SET is_active = FALSE WHERE s.user_id = u.id AND s.is_active;
  UPDATE public.login_tickets lt SET used_at = NOW() WHERE lt.user_id = u.id AND lt.used_at IS NULL;
  UPDATE public.email_codes ec SET used_at = NOW() WHERE ec.user_id = u.id AND ec.used_at IS NULL;
  DELETE FROM public.login_attempts la WHERE la.email = v_email AND la.succeeded = FALSE;

  RETURN QUERY SELECT TRUE, 'ok'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_password_reset(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_password_reset(TEXT, TEXT, TEXT) TO anon, authenticated;

-- confirm_email_verification (anon, session-checked) -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_email_verification(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_code TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, verified_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_generic CONSTANT TEXT := 'That code is not valid or has expired. Request a new code.';
  c         public.email_codes%ROWTYPE;
  u         public.users_profile%ROWTYPE;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  IF NOT public.email_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF u.email_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'already_verified'::TEXT, u.email_verified_at; RETURN;
  END IF;
  IF COALESCE(p_code, '') !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT FALSE, v_generic, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  SELECT * INTO c FROM public.email_codes ec
   WHERE ec.user_id = u.id AND ec.purpose = 'verify' AND ec.used_at IS NULL
   ORDER BY ec.created_at DESC LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR c.expires_at <= v_now OR c.attempts >= 5 OR c.email <> LOWER(TRIM(u.email)) THEN
    RETURN QUERY SELECT FALSE, v_generic, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  IF NOT public.email_code_matches(c.code_hash, p_code) THEN
    UPDATE public.email_codes ec SET attempts = ec.attempts + 1 WHERE ec.id = c.id;
    RETURN QUERY SELECT FALSE, v_generic, NULL::TIMESTAMPTZ; RETURN;
  END IF;

  UPDATE public.email_codes ec SET used_at = v_now, attempts = ec.attempts + 1 WHERE ec.id = c.id;
  UPDATE public.users_profile up SET email_verified_at = v_now, updated_at = v_now WHERE up.id = u.id;
  RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_email_verification(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_email_verification(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- email_verification_status (anon, session-checked): drives the reminder banner -----------------------------------
CREATE OR REPLACE FUNCTION public.email_verification_status(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (ok BOOLEAN, email TEXT, verified_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.email_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, up.email, up.email_verified_at FROM public.users_profile up WHERE up.id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.email_verification_status(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_verification_status(UUID, TEXT, TEXT) TO anon, authenticated;
