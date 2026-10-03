-- ----------------------------------------------------------------------------
-- MIGRATION 008: Security hardening (RLS / RPC review of 001-005)
-- See docs/SECURITY_CHECKLIST.md for each finding. Idempotent.
--
--  S1  Default-deny RPCs. Supabase grants anon/authenticated EXECUTE on every
--      new public function, so "REVOKE ... FROM PUBLIC" did not protect
--      set_user_password (anyone could reset any password) or
--      handle_razorpay_payment_success (anyone could upgrade their plan).
--      Now: revoke EXECUTE from anon/authenticated on ALL public functions,
--      stop future auto-grants, then re-grant an explicit allow-list.
--  S2  authenticate_user: fixed "column reference email is ambiguous",
--      generic error for unknown email / wrong password (no enumeration),
--      lockout after 10 failures per email in 15 minutes, bcrypt storage with
--      transparent upgrade from the legacy unsalted sha256, and it now issues a
--      one-time login ticket.
--  S3  register_device_session could create a session for ANY user id without
--      a password. It now requires a valid login ticket, or (compat window for
--      current desktop builds) a successful login for that user in the last
--      10 minutes. Set app_security.require_login_ticket = true once desktop
--      sends p_login_ticket.
--  S4  hr_contacts (recruiter names/emails) no longer readable with the anon key.
-- ----------------------------------------------------------------------------

-- S1 ---------------------------------------------------------------------------
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Settings table (operator-controlled switches).
CREATE TABLE IF NOT EXISTS public.app_security (
  id                   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  require_login_ticket BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO public.app_security (id) VALUES (TRUE) ON CONFLICT DO NOTHING;
ALTER TABLE public.app_security ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_security FROM anon, authenticated;

-- S2 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  succeeded  BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts (email, created_at DESC);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.login_tickets (
  ticket_hash TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
ALTER TABLE public.login_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_tickets FROM anon, authenticated;

-- The credential the desktop sends is sha256("email:password") (hashLogin in
-- apps/desktop/src/main/services/auth.ts). Plaintext is also accepted and
-- reduced to the same pre-hash. Storage is bcrypt(pre-hash).
CREATE OR REPLACE FUNCTION public.login_prehash(p_email TEXT, p_secret TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT CASE WHEN p_secret ~ '^[0-9a-f]{64}$' THEN p_secret
              ELSE encode(digest(LOWER(TRIM(p_email)) || ':' || p_secret, 'sha256'), 'hex') END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_password(p_email TEXT, p_password TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  UPDATE public.users_profile
     SET password_hash = crypt(public.login_prehash(p_email, p_password), gen_salt('bf', 10)),
         updated_at = NOW()
   WHERE LOWER(email) = LOWER(TRIM(p_email));
$$;

DROP FUNCTION IF EXISTS public.authenticate_user(TEXT, TEXT);
CREATE FUNCTION public.authenticate_user(p_email TEXT, p_password TEXT)
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
  v_email  TEXT := LOWER(TRIM(p_email));
  v_pre    TEXT;
  v_valid  BOOLEAN := FALSE;
  v_fails  INT;
  v_ticket TEXT;
BEGIN
  SELECT count(*) INTO v_fails FROM public.login_attempts la
  WHERE la.email = v_email AND la.succeeded = FALSE AND la.created_at > NOW() - INTERVAL '15 minutes';
  IF v_fails >= 10 THEN
    RETURN QUERY SELECT FALSE, 'Too many failed attempts. Try again in 15 minutes.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users_profile up WHERE LOWER(up.email) = v_email LIMIT 1;

  IF FOUND AND u.password_hash IS NOT NULL THEN
    v_pre := public.login_prehash(u.email, p_password);
    IF u.password_hash LIKE '$2%' THEN
      v_valid := crypt(v_pre, u.password_hash) = u.password_hash;
    ELSE
      -- Legacy unsalted sha256(email:password): verify, then upgrade to bcrypt so a
      -- leaked table no longer contains usable credentials.
      v_valid := u.password_hash = v_pre;
      IF v_valid THEN
        UPDATE public.users_profile SET password_hash = crypt(v_pre, gen_salt('bf', 10)) WHERE public.users_profile.id = u.id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.login_attempts (email, succeeded) VALUES (v_email, v_valid);

  IF NOT v_valid THEN
    RETURN QUERY SELECT FALSE, 'Incorrect email or password.',
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INT, NULL::TEXT;
    RETURN;
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
  v_ticket := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.login_tickets (ticket_hash, user_id, expires_at)
  VALUES (encode(digest(v_ticket, 'sha256'), 'hex'), u.id, NOW() + INTERVAL '10 minutes');
  DELETE FROM public.login_tickets lt WHERE lt.expires_at < NOW() - INTERVAL '1 day';

  RETURN QUERY SELECT TRUE, 'ok', u.id, u.email, u.full_name, u.subscription_tier, u.role, u.status,
    u.license_key, u.expires_at, u.apps_count, v_ticket;
END;
$$;

-- S3 ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_device_session(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.register_device_session(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
CREATE FUNCTION public.register_device_session(
  p_user_id UUID,
  p_session_token TEXT,
  p_device_fingerprint TEXT,
  p_device_name TEXT,
  p_client_ip TEXT,
  p_force_takeover BOOLEAN DEFAULT FALSE,
  p_login_ticket TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, conflict BOOLEAN, active_device TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_active_rec RECORD;
  v_authorized BOOLEAN := FALSE;
  v_strict BOOLEAN;
BEGIN
  SELECT require_login_ticket INTO v_strict FROM public.app_security WHERE id;

  IF p_login_ticket IS NOT NULL THEN
    UPDATE public.login_tickets lt SET used_at = NOW()
    WHERE lt.ticket_hash = encode(digest(p_login_ticket, 'sha256'), 'hex')
      AND lt.user_id = p_user_id AND lt.used_at IS NULL AND lt.expires_at > NOW();
    v_authorized := FOUND;
  ELSIF NOT COALESCE(v_strict, FALSE) THEN
    -- Compat: current desktop builds call this right after authenticate_user.
    v_authorized := EXISTS (SELECT 1 FROM public.users_profile up
                            WHERE up.id = p_user_id AND up.last_login > NOW() - INTERVAL '10 minutes')
                    OR EXISTS (SELECT 1 FROM public.user_sessions s
                               WHERE s.session_token = p_session_token AND s.user_id = p_user_id AND s.is_active);
  END IF;

  IF NOT v_authorized THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, 'Sign in again to register this device.';
    RETURN;
  END IF;

  SELECT * INTO v_active_rec FROM public.user_sessions s
  WHERE s.user_id = p_user_id AND s.is_active = TRUE AND s.device_fingerprint <> p_device_fingerprint
    AND s.last_heartbeat > (NOW() - INTERVAL '2 minutes')
  ORDER BY s.last_heartbeat DESC LIMIT 1;

  IF FOUND THEN
    IF NOT p_force_takeover THEN
      RETURN QUERY SELECT FALSE, TRUE, COALESCE(v_active_rec.device_name, 'Another Laptop'),
        'Account is currently active on another device (' || COALESCE(v_active_rec.device_name, 'Another Laptop') || '). Only 1 laptop is allowed per account.';
      RETURN;
    END IF;
    UPDATE public.user_sessions s SET is_active = FALSE
    WHERE s.user_id = p_user_id AND s.device_fingerprint <> p_device_fingerprint;
  END IF;

  -- A session token can never be moved to another user.
  IF EXISTS (SELECT 1 FROM public.user_sessions s WHERE s.session_token = p_session_token AND s.user_id <> p_user_id) THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, 'Invalid session token.';
    RETURN;
  END IF;

  INSERT INTO public.user_sessions (user_id, current_ip, device_fingerprint, device_name, session_token, last_heartbeat, is_active)
  VALUES (p_user_id, p_client_ip, p_device_fingerprint, p_device_name, p_session_token, NOW(), TRUE)
  ON CONFLICT (session_token) DO UPDATE SET
    last_heartbeat = NOW(), current_ip = EXCLUDED.current_ip, device_fingerprint = EXCLUDED.device_fingerprint,
    device_name = EXCLUDED.device_name, is_active = TRUE;

  RETURN QUERY SELECT TRUE, FALSE, NULL::TEXT, 'Session registered successfully';
END;
$$;

-- S4 ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon can read hr_contacts" ON public.hr_contacts;
REVOKE ALL ON public.hr_contacts FROM anon, authenticated;

-- Allow-list: the only functions the anon key may call ------------------------
DO $$
DECLARE
  f RECORD;
  allowed TEXT[] := ARRAY[
    'authenticate_user', 'register_device_session', 'verify_and_update_session',
    'sync_pull_user_data', 'sync_push_user_profile', 'sync_push_application', 'sync_push_saved_job',
    'sync_remove_saved_job', 'sync_push_resume', 'sync_delete_resume',
    'learning_start_track', 'learning_archive_track', 'learning_record_events', 'learning_pull_events'
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (allowed)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END $$;

-- S5 ---------------------------------------------------------------------------
-- Payment fulfilment trusted the client-supplied plan (checkout notes): any
-- amount with plan 'lifetime' gave a non-expiring plan, 'turbo' gave Max. A
-- replayed webhook also re-extended the subscription. Now the plan is derived
-- from the captured amount (prices from packages/config: Pro ₹249, Max ₹599)
-- and a payment_id is fulfilled at most once.
CREATE OR REPLACE FUNCTION public.handle_razorpay_payment_success(
  p_user_id UUID,
  p_email TEXT,
  p_plan TEXT,
  p_amount TEXT,
  p_payment_id TEXT,
  p_order_id TEXT DEFAULT NULL,
  p_raw_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (ok BOOLEAN, user_id UUID, new_tier TEXT, expires_at TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID := p_user_id;
  v_amount NUMERIC := NULLIF(regexp_replace(COALESCE(p_amount, ''), '[^0-9.]', '', 'g'), '')::NUMERIC;
  v_plan TEXT;
  v_tier TEXT;
  v_expires TIMESTAMPTZ := NOW() + INTERVAL '30 days';
BEGIN
  IF v_amount IS NULL OR v_amount < 249 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, 'Amount does not match any plan';
    RETURN;
  END IF;
  v_plan := CASE WHEN v_amount >= 599 THEN 'turbo' ELSE 'pro' END;
  v_tier := CASE WHEN v_plan = 'turbo' THEN 'max' ELSE 'pro' END;

  IF v_user_id IS NULL THEN
    SELECT up.id INTO v_user_id FROM public.users_profile up WHERE LOWER(up.email) = LOWER(TRIM(p_email)) LIMIT 1;
  END IF;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, 'No matching user account found for ' || p_email;
    RETURN;
  END IF;

  INSERT INTO public.razorpay_payments (user_id, email, plan, amount, payment_id, order_id, status, raw_payload)
  VALUES (v_user_id, LOWER(TRIM(p_email)), v_plan, p_amount, p_payment_id, p_order_id, 'captured', p_raw_payload)
  ON CONFLICT (payment_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, v_user_id, NULL::TEXT, NULL::TIMESTAMPTZ, 'Payment already processed';
    RETURN;
  END IF;

  -- Renewals extend from the current expiry when it is still in the future.
  SELECT GREATEST(COALESCE(up.expires_at, NOW()), NOW()) + INTERVAL '30 days' INTO v_expires
  FROM public.users_profile up WHERE up.id = v_user_id;

  UPDATE public.users_profile
  SET subscription_tier = v_tier, status = 'active', expires_at = v_expires, updated_at = NOW()
  WHERE public.users_profile.id = v_user_id;

  INSERT INTO public.billing_records (user_email, amount, plan, status, payment_method)
  VALUES (LOWER(TRIM(p_email)), '₹' || p_amount,
          CASE WHEN v_tier = 'max' THEN 'Max (Monthly)' ELSE 'Pro (Monthly)' END, 'paid', 'Razorpay');

  RETURN QUERY SELECT TRUE, v_user_id, v_tier, v_expires, 'Subscription upgraded successfully!';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_razorpay_payment_success(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_razorpay_payment_success(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
