-- 016: sign-in no longer refuses accounts whose trial or paid plan has expired.
-- Before, sign-up created a 14-day trial and authenticate_user refused it afterwards, locking Free users out
-- on day 15. Expiry now only affects entitlements (get_entitlements in 011 reports Free + 'expired').
-- Suspended accounts are still refused. CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.authenticate_user(p_email text, p_password text) RETURNS TABLE(ok boolean, reason text, id uuid, email text, full_name text, tier text, role text, status text, license_key text, expires_at timestamp with time zone, apps_count integer, login_ticket text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
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

  -- An expired trial or paid plan still signs in: entitlements (011) fall back to the Free plan.

  UPDATE public.users_profile SET last_login = NOW() WHERE public.users_profile.id = u.id;
  v_ticket := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.login_tickets (ticket_hash, user_id, expires_at)
  VALUES (encode(digest(v_ticket, 'sha256'), 'hex'), u.id, NOW() + INTERVAL '10 minutes');
  DELETE FROM public.login_tickets lt WHERE lt.expires_at < NOW() - INTERVAL '1 day';

  RETURN QUERY SELECT TRUE, 'ok', u.id, u.email, u.full_name, u.subscription_tier, u.role, u.status,
    u.license_key, u.expires_at, u.apps_count, v_ticket;
END;
$_$;
