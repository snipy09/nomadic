-- 021: server-side Google sign-in (SECURITY_CHECKLIST S9, DECISIONS #24).
--
-- The google-sign-in Edge Function verifies the Google ID token (signature, iss, aud, exp, email_verified) and then
-- calls google_sign_in with the verified claims using the service-role key. This function trusts its arguments, so it
-- is granted to service_role ONLY: anon/authenticated must never be able to call it (they could sign in as anyone).
--
-- It finds the account by the linked Google subject (`google_sub`), else by the verified email (linking google_sub on
-- first use), else creates a trial account with the same defaults as register_user (009). Suspended accounts are
-- refused; an expired plan still signs in (016). The result has exactly the row shape of authenticate_user, including a
-- fresh single-use login_ticket for register_device_session (008). Idempotent.

ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_profile_google_sub_key
  ON public.users_profile (google_sub) WHERE google_sub IS NOT NULL;

CREATE OR REPLACE FUNCTION public.google_sign_in(p_email TEXT, p_google_sub TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS TABLE (
  ok           BOOLEAN,
  reason       TEXT,
  id           UUID,
  email        TEXT,
  full_name    TEXT,
  tier         TEXT,
  role         TEXT,
  status       TEXT,
  license_key  TEXT,
  expires_at   TIMESTAMPTZ,
  apps_count   INT,
  login_ticket TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  u        public.users_profile%ROWTYPE;
  v_email  TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_sub    TEXT := TRIM(COALESCE(p_google_sub, ''));
  v_name   TEXT := NULLIF(TRIM(COALESCE(p_full_name, '')), '');
  v_ticket TEXT;
  v_found  BOOLEAN;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR LENGTH(v_email) > 254 OR v_sub = '' OR LENGTH(v_sub) > 255 THEN
    RETURN QUERY SELECT FALSE, 'Google sign-in could not be verified.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  -- 1. An account already linked to this Google subject (stable even if the Google email changes).
  SELECT * INTO u FROM public.users_profile up WHERE up.google_sub = v_sub LIMIT 1 FOR UPDATE;
  v_found := FOUND;

  -- 2. Otherwise the account with the verified email; link it on first use.
  IF NOT v_found THEN
    SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1 FOR UPDATE;
    v_found := FOUND;
    IF v_found THEN
      IF u.google_sub IS NOT NULL AND u.google_sub <> v_sub THEN
        INSERT INTO public.login_attempts (email, succeeded) VALUES (v_email, FALSE);
        RETURN QUERY SELECT FALSE, 'This email is linked to a different Google account.',
          NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
        RETURN;
      END IF;
      UPDATE public.users_profile up SET google_sub = v_sub, updated_at = NOW() WHERE up.id = u.id;
      u.google_sub := v_sub;
    END IF;
  END IF;

  -- 3. Otherwise create the account: same defaults as register_user (14-day trial, user role, no password).
  IF NOT v_found THEN
    BEGIN
      INSERT INTO public.users_profile
        (email, full_name, subscription_tier, role, status, license_key, expires_at, password_hash, last_login, google_sub)
      VALUES
        (v_email, COALESCE(v_name, SPLIT_PART(v_email, '@', 1)), 'trial', 'user', 'active',
         'NOMADIC-' || UPPER(encode(gen_random_bytes(6), 'hex')), NOW() + INTERVAL '14 days', NULL, NOW(), v_sub)
      RETURNING * INTO u;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent sign-in created or linked it first.
      SELECT * INTO u FROM public.users_profile up
       WHERE up.google_sub = v_sub OR (LOWER(up.email) = v_email AND up.google_sub IS NULL) LIMIT 1;
      IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Sign-in failed. Please try again.',
          NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
        RETURN;
      END IF;
      UPDATE public.users_profile up SET google_sub = v_sub WHERE up.id = u.id AND up.google_sub IS NULL;
    END;
  END IF;

  IF u.status = 'suspended' THEN
    INSERT INTO public.login_attempts (email, succeeded) VALUES (v_email, FALSE);
    RETURN QUERY SELECT FALSE, 'This account is suspended. Contact your administrator.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  -- An expired trial or paid plan still signs in: entitlements (011) fall back to the Free plan (016).
  INSERT INTO public.login_attempts (email, succeeded) VALUES (v_email, TRUE);
  UPDATE public.users_profile up SET last_login = NOW() WHERE up.id = u.id;
  v_ticket := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.login_tickets (ticket_hash, user_id, expires_at)
  VALUES (encode(digest(v_ticket, 'sha256'), 'hex'), u.id, NOW() + INTERVAL '10 minutes');
  -- Expired tickets are purged by authenticate_user on each password sign-in.

  RETURN QUERY SELECT TRUE, 'ok', u.id, u.email, u.full_name, u.subscription_tier, u.role, u.status,
    u.license_key, u.expires_at, u.apps_count, v_ticket;
END;
$$;

-- Not on the anon allow-list: service_role (the google-sign-in Edge Function) only.
REVOKE ALL ON FUNCTION public.google_sign_in(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_sign_in(TEXT, TEXT, TEXT) TO service_role;
