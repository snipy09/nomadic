-- 009: server-side account creation (desktop sign-up).
-- Anyone (anon) may call register_user; it creates a 14-day trial account with a
-- bcrypt-stored credential (same scheme as 008) and a random license key. It never
-- accepts a tier, role or expiry from the caller.

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_email_time ON public.signup_attempts (email, created_at DESC);
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_user(p_email TEXT, p_password TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS TABLE (
  ok          BOOLEAN,
  reason      TEXT,
  id          UUID,
  email       TEXT,
  full_name   TEXT,
  tier        TEXT,
  role        TEXT,
  status      TEXT,
  license_key TEXT,
  expires_at  TIMESTAMPTZ,
  apps_count  INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT := LOWER(TRIM(p_email));
  v_name  TEXT := NULLIF(TRIM(COALESCE(p_full_name, '')), '');
  v_key   TEXT;
  u       public.users_profile%ROWTYPE;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR LENGTH(v_email) > 254 THEN
    RETURN QUERY SELECT FALSE, 'Please enter a valid email address.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END IF;
  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RETURN QUERY SELECT FALSE, 'Password must be at least 6 characters.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.signup_attempts sa
       WHERE sa.email = v_email AND sa.created_at > NOW() - INTERVAL '15 minutes') >= 5 THEN
    RETURN QUERY SELECT FALSE, 'Too many sign-up attempts. Try again in 15 minutes.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END IF;
  INSERT INTO public.signup_attempts (email) VALUES (v_email);
  DELETE FROM public.signup_attempts sa WHERE sa.created_at < NOW() - INTERVAL '1 day';

  IF EXISTS (SELECT 1 FROM public.users_profile up WHERE LOWER(up.email) = v_email) THEN
    RETURN QUERY SELECT FALSE, 'An account with this email already exists. Sign in instead.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END IF;

  v_key := 'NOMADIC-' || UPPER(encode(gen_random_bytes(6), 'hex'));

  BEGIN
    INSERT INTO public.users_profile
      (email, full_name, subscription_tier, role, status, license_key, expires_at, password_hash, last_login)
    VALUES
      (v_email, COALESCE(v_name, SPLIT_PART(v_email, '@', 1)), 'trial', 'user', 'active', v_key,
       NOW() + INTERVAL '14 days',
       crypt(public.login_prehash(v_email, p_password), gen_salt('bf', 10)),
       NOW())
    RETURNING * INTO u;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT FALSE, 'An account with this email already exists. Sign in instead.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, 'ok', u.id, u.email, u.full_name, u.subscription_tier, u.role, u.status,
    u.license_key, u.expires_at, u.apps_count;
END;
$$;

REVOKE ALL ON FUNCTION public.register_user(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT) TO anon, authenticated;
