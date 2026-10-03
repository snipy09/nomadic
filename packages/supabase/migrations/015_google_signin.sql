-- 015: server-side Google sign-in (SECURITY_CHECKLIST S9).
--
-- The google-signin Edge Function exchanges the desktop's PKCE authorization code
-- with Google (client secret held as a Supabase secret), verifies the returned ID
-- token (signature, issuer, audience, expiry, nonce, email_verified) and only then
-- calls google_signin() with the service-role key. The function finds or creates
-- the users_profile row by the verified email and returns the same row as
-- authenticate_user, including a one-time login_ticket, so the desktop registers
-- the device exactly like password sign-in.
--
-- google_signin is NOT callable with the anon key: the caller must have verified
-- the Google token, so it is granted to service_role only. Its "session check"
-- is the verified ID token in the Edge Function.

ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_profile_google_sub
  ON public.users_profile (google_sub) WHERE google_sub IS NOT NULL;

CREATE OR REPLACE FUNCTION public.google_signin(p_email TEXT, p_google_sub TEXT, p_full_name TEXT DEFAULT NULL)
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
  v_name   TEXT := NULLIF(LEFT(TRIM(COALESCE(p_full_name, '')), 200), '');
  v_ticket TEXT;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR LENGTH(v_email) > 254 OR v_sub !~ '^[0-9A-Za-z_-]{1,255}$' THEN
    RETURN QUERY SELECT FALSE, 'Google did not return a usable account.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  -- The Google account id is authoritative once linked; the email is used to link the first time.
  SELECT * INTO u FROM public.users_profile up WHERE up.google_sub = v_sub LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF u.google_sub IS NOT NULL AND u.google_sub <> v_sub THEN
        RETURN QUERY SELECT FALSE, 'This email is linked to a different Google account.',
          NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
        RETURN;
      END IF;
      UPDATE public.users_profile SET google_sub = v_sub, updated_at = NOW()
       WHERE public.users_profile.id = u.id RETURNING * INTO u;
    ELSE
      -- New account: same server policy as register_user (009). Tier, role and expiry
      -- never come from the caller; there is no password, so password sign-in fails
      -- until the user sets one.
      BEGIN
        INSERT INTO public.users_profile
          (email, full_name, subscription_tier, role, status, license_key, expires_at, google_sub)
        VALUES
          (v_email, COALESCE(v_name, SPLIT_PART(v_email, '@', 1)), 'trial', 'user', 'active',
           'NOMADIC-' || UPPER(encode(gen_random_bytes(6), 'hex')), NOW() + INTERVAL '14 days', v_sub)
        RETURNING * INTO u;
      EXCEPTION WHEN unique_violation THEN
        RETURN QUERY SELECT FALSE, 'Sign-in collided with another request. Try again.',
          NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
        RETURN;
      END;
    END IF;
  END IF;

  IF u.status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, 'This account is suspended. Contact your administrator.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  IF u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE,
      CASE WHEN u.subscription_tier = 'trial'
           THEN 'Your free trial has expired. Contact your administrator to upgrade.'
           ELSE 'Your subscription has expired. Contact your administrator to renew.' END,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.users_profile SET last_login = NOW() WHERE public.users_profile.id = u.id;
  INSERT INTO public.login_attempts (email, succeeded) VALUES (LOWER(u.email), TRUE);

  -- Same ticket scheme as authenticate_user (008): 32 random bytes, stored as sha256, 10 minutes, single use.
  v_ticket := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.login_tickets (ticket_hash, user_id, expires_at)
  VALUES (encode(digest(v_ticket, 'sha256'), 'hex'), u.id, NOW() + INTERVAL '10 minutes');
  DELETE FROM public.login_tickets lt WHERE lt.expires_at < NOW() - INTERVAL '1 day';

  RETURN QUERY SELECT TRUE, 'ok', u.id, u.email, u.full_name, u.subscription_tier, u.role, u.status,
    u.license_key, u.expires_at, u.apps_count, v_ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.google_signin(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_signin(TEXT, TEXT, TEXT) TO service_role;
