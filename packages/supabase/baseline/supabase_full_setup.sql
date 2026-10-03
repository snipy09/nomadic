-- Nomadic: complete setup for a NEW Supabase project (migrations 001-011, 014, 015, 016).
-- Paste everything into Supabase -> SQL Editor -> New query -> Run. One transaction: all or nothing.
-- Nomadic fresh-database baseline: final schema of migrations 001-010, generated from a verified rehearsal.
-- Run once on a NEW, empty Supabase project (SQL editor). Existing projects use scripts/migrate.sh instead.
BEGIN;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.authenticate_user(p_email text, p_password text) RETURNS TABLE(ok boolean, reason text, id uuid, email text, full_name text, tier text, role text, status text, license_key text, expires_at timestamp with time zone, apps_count integer, login_ticket text)
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
$_$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.handle_razorpay_payment_success(p_user_id uuid, p_email text, p_plan text, p_amount text, p_payment_id text, p_order_id text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(ok boolean, user_id uuid, new_tier text, expires_at timestamp with time zone, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
CREATE FUNCTION public.jobmaxxer_hash_login(p_email text, p_password text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  SELECT encode(digest(LOWER(TRIM(p_email)) || ':' || p_password, 'sha256'), 'hex');
$$;
CREATE FUNCTION public.jobs_sync_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Legacy writers send only is_active; the pipeline sends both.
    IF NEW.is_active IS FALSE AND NEW.status = 'active' THEN
      NEW.status := 'expired';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NULL; -- status changed: it wins, is_active follows below
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'expired' END;
  END IF;
  NEW.is_active := (NEW.status = 'active');
  IF NEW.status = 'expired' THEN
    NEW.expired_at := COALESCE(NEW.expired_at, NOW());
  ELSE
    NEW.expired_at := NULL;
    NEW.expire_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.learning_archive_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN FALSE; END IF;
  UPDATE public.user_tracks SET status = 'archived', archived_at = NOW()
  WHERE user_id = p_user_id AND track_id = p_track_id;
  RETURN FOUND;
END;
$$;
CREATE FUNCTION public.learning_events_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'learning_events is append-only';
END;
$$;
CREATE TABLE public.learning_events (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    skill_id text,
    item_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    duration_s integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_events_duration_s_check CHECK (((duration_s >= 0) AND (duration_s <= 86400))),
    CONSTRAINT learning_events_type_check CHECK ((type = ANY (ARRAY['lesson_viewed'::text, 'quiz_passed'::text, 'quiz_failed'::text, 'problem_solved'::text, 'review_done'::text, 'skill_marked_known'::text])))
);
CREATE FUNCTION public.learning_pull_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_since timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone) RETURNS SETOF public.learning_events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.learning_events
  WHERE user_id = p_user_id AND received_at > p_since ORDER BY created_at LIMIT 5000;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.learning_record_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_events jsonb) RETURNS TABLE(accepted integer, rejected integer, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  e JSONB;
  v_tier TEXT;
  v_used INT;
  v_ok INT := 0;
  v_bad INT := 0;
  v_type TEXT;
  v_rows INT;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT 0, 0, 'unauthorized'; RETURN;
  END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 500 THEN
    RETURN QUERY SELECT 0, 0, 'bad_request'; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learning_events:' || p_user_id::text));
  v_tier := public.learning_tier(p_user_id);
  SELECT count(*) INTO v_used FROM public.learning_events
  WHERE user_id = p_user_id AND item_id IS NOT NULL
    AND type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done')
    AND received_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  FOR e IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_type := e->>'type';
    IF v_type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done') AND (e->>'item_id') IS NOT NULL
       AND v_tier = 'free' AND v_used >= 10
       AND NOT EXISTS (SELECT 1 FROM public.learning_events WHERE id = (e->>'id')::uuid) THEN
      v_bad := v_bad + 1;
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.learning_events (id, user_id, type, skill_id, item_id, payload, duration_s, created_at)
      VALUES ((e->>'id')::uuid, p_user_id, v_type, e->>'skill_id', e->>'item_id',
              COALESCE(e->'payload', '{}'::jsonb), COALESCE((e->>'duration_s')::int, 0),
              LEAST((e->>'created_at')::timestamptz, NOW() + INTERVAL '5 minutes'))
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_ok := v_ok + 1;
      IF v_rows > 0 AND v_type IN ('quiz_passed', 'quiz_failed', 'problem_solved', 'review_done') AND (e->>'item_id') IS NOT NULL THEN
        v_used := v_used + 1;
      END IF;
    EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation OR invalid_datetime_format THEN
      v_bad := v_bad + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT v_ok, v_bad, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.learning_session_ok(p_user_id uuid, p_session_token text, p_device_fingerprint text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = p_user_id AND session_token = p_session_token
      AND device_fingerprint = p_device_fingerprint AND is_active = TRUE
  );
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.learning_start_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text, p_horizon_months smallint DEFAULT 3, p_daily_hours smallint DEFAULT 2) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_active INT;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learning_track:' || p_user_id::text));
  SELECT count(*) INTO v_active FROM public.user_tracks
  WHERE user_id = p_user_id AND status = 'active' AND track_id <> p_track_id;
  IF public.learning_tier(p_user_id) = 'free' AND v_active >= 1 THEN
    RETURN QUERY SELECT FALSE, 'free_tier_track_limit'; RETURN;
  END IF;
  INSERT INTO public.user_tracks (user_id, track_id, status, horizon_months, daily_hours)
  VALUES (p_user_id, p_track_id, 'active', p_horizon_months, p_daily_hours)
  ON CONFLICT (user_id, track_id) DO UPDATE
    SET status = 'active', horizon_months = EXCLUDED.horizon_months, daily_hours = EXCLUDED.daily_hours, archived_at = NULL;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.learning_tier(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'free'
    WHEN u.subscription_tier IN ('max', 'enterprise', 'lifetime') THEN 'max'
    WHEN u.subscription_tier = 'pro' THEN 'pro'
    ELSE 'free' END
  FROM public.users_profile u WHERE u.id = p_user_id;
$$;
CREATE FUNCTION public.login_prehash(p_email text, p_secret text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $_$
  SELECT CASE WHEN p_secret ~ '^[0-9a-f]{64}$' THEN p_secret
              ELSE encode(digest(LOWER(TRIM(p_email)) || ':' || p_secret, 'sha256'), 'hex') END;
$_$;
CREATE FUNCTION public.maintain_jobs_lifecycle() RETURNS TABLE(inactivated_count integer, purged_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inactivated INT;
  v_purged INT;
BEGIN
  -- Not seen by any source for 14 days => expired.
  UPDATE public.jobs
  SET status = 'expired', expire_reason = COALESCE(expire_reason, 'stale_14d')
  WHERE status = 'active'
    AND COALESCE(last_seen, created_at) < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_inactivated = ROW_COUNT;
  -- Expired for 30 days => deleted.
  DELETE FROM public.jobs
  WHERE status = 'expired'
    AND COALESCE(expired_at, last_seen, created_at) < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN QUERY SELECT v_inactivated, v_purged;
END;
$$;
CREATE FUNCTION public.match_jobs_for_user(p_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    inserted_count INT;
BEGIN
    INSERT INTO public.user_job_matches (user_id, job_id)
    SELECT p_user_id, j.id
    FROM public.jobs j
    JOIN public.user_preferences up ON up.user_id = p_user_id
    WHERE j.is_active = TRUE
      AND (array_length(up.target_titles, 1) IS NULL OR j.title ILIKE ANY(SELECT '%' || t || '%' FROM unnest(up.target_titles) t))
      AND (up.is_remote = FALSE OR j.location ILIKE '%remote%')
      AND NOT (array_length(up.excluded_keywords, 1) IS NOT NULL AND j.description ILIKE ANY(SELECT '%' || k || '%' FROM unnest(up.excluded_keywords) k))
    ON CONFLICT (user_id, job_id) DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.register_device_session(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_device_name text, p_client_ip text, p_force_takeover boolean DEFAULT false, p_login_ticket text DEFAULT NULL::text) RETURNS TABLE(ok boolean, conflict boolean, active_device text, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.register_user(p_email text, p_password text, p_full_name text DEFAULT NULL::text) RETURNS TABLE(ok boolean, reason text, id uuid, email text, full_name text, tier text, role text, status text, license_key text, expires_at timestamp with time zone, apps_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
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
$_$;
CREATE FUNCTION public.set_user_password(p_email text, p_password text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  UPDATE public.users_profile
     SET password_hash = crypt(public.login_prehash(p_email, p_password), gen_salt('bf', 10)),
         updated_at = NOW()
   WHERE LOWER(email) = LOWER(TRIM(p_email));
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.sync_delete_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    DELETE FROM public.user_applications
    WHERE user_id = p_user_id
      AND apply_url = p_apply_url;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.sync_delete_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    DELETE FROM public.user_resumes
    WHERE user_id = p_user_id
      AND name = p_name;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.sync_pull_user_data(p_user_id uuid, p_session_token text, p_device_fingerprint text) RETURNS TABLE(ok boolean, error text, profile jsonb, applications jsonb, saved_jobs jsonb, resumes jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        SELECT company, title, apply_url, status, mode, applied_at, notes, status_history, updated_at
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
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.sync_push_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_company text, p_title text, p_apply_url text, p_status text, p_mode text, p_notes text DEFAULT NULL::text, p_status_history jsonb DEFAULT NULL::jsonb, p_applied_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    IF p_notes IS NOT NULL AND length(p_notes) > 10000 THEN
        RETURN QUERY SELECT FALSE, 'Notes are too long (10000 characters max).';
        RETURN;
    END IF;
    IF p_status_history IS NOT NULL AND (
        jsonb_typeof(p_status_history) <> 'array' OR jsonb_array_length(p_status_history) > 200
    ) THEN
        RETURN QUERY SELECT FALSE, 'Invalid status history.';
        RETURN;
    END IF;
    INSERT INTO public.user_applications (
        user_id, company, title, apply_url, status, mode, applied_at, notes, status_history, updated_at
    )
    VALUES (
        p_user_id, p_company, p_title, p_apply_url,
        COALESCE(p_status, 'applied'), COALESCE(p_mode, 'autonomous'),
        COALESCE(p_applied_at, NOW()), p_notes, COALESCE(p_status_history, '[]'::jsonb), NOW()
    )
    ON CONFLICT (user_id, apply_url) DO UPDATE SET
        company = EXCLUDED.company,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        mode = EXCLUDED.mode,
        notes = COALESCE(p_notes, public.user_applications.notes),
        status_history = COALESCE(p_status_history, public.user_applications.status_history),
        updated_at = NOW();
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.sync_push_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text, p_target_role text, p_file_path text, p_resume_text text, p_is_default boolean) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    IF p_is_default THEN
        UPDATE public.user_resumes SET is_default = FALSE WHERE user_id = p_user_id;
    END IF;
    INSERT INTO public.user_resumes (
        user_id, name, target_role, file_path, resume_text, is_default, created_at
    )
    VALUES (
        p_user_id, p_name, p_target_role, p_file_path, p_resume_text, COALESCE(p_is_default, FALSE), NOW()
    )
    ON CONFLICT (user_id, name) DO UPDATE SET
        target_role = EXCLUDED.target_role,
        file_path = EXCLUDED.file_path,
        resume_text = EXCLUDED.resume_text,
        is_default = EXCLUDED.is_default;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.sync_push_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_title text, p_company text, p_apply_url text, p_location text, p_salary text, p_source text, p_score integer, p_description text) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    INSERT INTO public.user_saved_jobs (
        user_id, title, company, apply_url, location, salary, source, score, description, saved_at
    )
    VALUES (
        p_user_id, p_title, p_company, p_apply_url, p_location, p_salary, p_source, COALESCE(p_score, 100), p_description, NOW()
    )
    ON CONFLICT (user_id, apply_url) DO UPDATE SET
        title = EXCLUDED.title,
        company = EXCLUDED.company,
        location = EXCLUDED.location,
        salary = EXCLUDED.salary,
        source = EXCLUDED.source,
        score = EXCLUDED.score,
        description = EXCLUDED.description,
        saved_at = NOW();
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.sync_push_user_profile(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_profile jsonb) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    INSERT INTO public.user_cloud_profiles (
        user_id, first_name, last_name, phone, linkedin, github,
        sponsorship, desired_salary, notice_period, groq_api_key,
        smtp_password, resume_text, custom_answers_json,
        onboarding_completed, desired_title, tech_stack, updated_at
    )
    VALUES (
        p_user_id,
        p_profile->>'first_name',
        p_profile->>'last_name',
        p_profile->>'phone',
        p_profile->>'linkedin',
        p_profile->>'github',
        COALESCE(p_profile->>'sponsorship', 'No'),
        p_profile->>'desired_salary',
        COALESCE(p_profile->>'notice_period', '2 weeks'),
        p_profile->>'groq_api_key',
        p_profile->>'smtp_password',
        p_profile->>'resume_text',
        COALESCE(p_profile->'custom_answers_json', '{}'::jsonb),
        COALESCE((p_profile->>'onboarding_completed')::BOOLEAN, FALSE),
        p_profile->>'desired_title',
        p_profile->>'tech_stack',
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        linkedin = EXCLUDED.linkedin,
        github = EXCLUDED.github,
        sponsorship = EXCLUDED.sponsorship,
        desired_salary = EXCLUDED.desired_salary,
        notice_period = EXCLUDED.notice_period,
        groq_api_key = EXCLUDED.groq_api_key,
        smtp_password = EXCLUDED.smtp_password,
        resume_text = EXCLUDED.resume_text,
        custom_answers_json = EXCLUDED.custom_answers_json,
        onboarding_completed = EXCLUDED.onboarding_completed,
        desired_title = EXCLUDED.desired_title,
        tech_stack = EXCLUDED.tech_stack,
        updated_at = NOW();
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
CREATE FUNCTION public.sync_remove_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;
    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;
    DELETE FROM public.user_saved_jobs
    WHERE user_id = p_user_id
      AND apply_url = p_apply_url;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.verify_and_update_session(p_user_id uuid, p_session_token text, p_client_ip text, p_device_fingerprint text) RETURNS TABLE(is_valid boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_session RECORD;
    v_conflict_device TEXT;
BEGIN
    -- Check if session exists and is active
    SELECT * INTO v_session
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
    LIMIT 1;
    IF NOT FOUND OR v_session.is_active = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Session terminated or invalidated by another device login.';
        RETURN;
    END IF;
    IF v_session.device_fingerprint <> p_device_fingerprint THEN
        RETURN QUERY SELECT FALSE, 'Device fingerprint mismatch. Single-device lock active.';
        RETURN;
    END IF;
    -- Check if another device has recently registered and taken over as active
    SELECT device_name INTO v_conflict_device
    FROM public.user_sessions
    WHERE user_id = p_user_id
      AND is_active = TRUE
      AND device_fingerprint <> p_device_fingerprint
      AND last_heartbeat > (NOW() - INTERVAL '2 minutes')
    LIMIT 1;
    IF FOUND THEN
        UPDATE public.user_sessions
        SET is_active = FALSE
        WHERE session_token = p_session_token;
        RETURN QUERY SELECT FALSE, 'This account is now in use on another laptop (' || COALESCE(v_conflict_device, 'Another device') || '). Terminating session.';
        RETURN;
    END IF;
    -- Update heartbeat
    UPDATE public.user_sessions
    SET last_heartbeat = NOW(),
        current_ip = p_client_ip,
        is_active = TRUE
    WHERE session_token = p_session_token;
    RETURN QUERY SELECT TRUE, 'Session validated';
END;
$$;
CREATE TABLE public.app_security (
    id boolean DEFAULT true NOT NULL,
    require_login_ticket boolean DEFAULT false NOT NULL,
    CONSTRAINT app_security_id_check CHECK (id)
);
CREATE TABLE public.billing_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_email text NOT NULL,
    amount text NOT NULL,
    plan text NOT NULL,
    status text DEFAULT 'paid'::text NOT NULL,
    payment_method text DEFAULT 'Manual'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_records_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'pending'::text, 'refunded'::text])))
);
CREATE TABLE public.hr_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    department text DEFAULT 'Engineering'::text,
    verification_status text DEFAULT 'valid'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hr_contacts_verification_status_check CHECK ((verification_status = ANY (ARRAY['valid'::text, 'invalid'::text, 'pending'::text, 'risky'::text, 'catch-all'::text])))
);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_hash text NOT NULL,
    company text NOT NULL,
    title text NOT NULL,
    location text DEFAULT 'Remote'::text,
    description text,
    apply_url text NOT NULL,
    source text NOT NULL,
    salary_range text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    inactivated_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
    source_key text,
    source_id text,
    status text DEFAULT 'active'::text NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone,
    expire_reason text,
    canonical_url text,
    dedupe_key text,
    remote boolean DEFAULT false NOT NULL,
    workplace_type text,
    employment_type text,
    seniority text,
    role_family text,
    salary_min numeric,
    salary_max numeric,
    salary_currency text,
    salary_period text,
    posted_at timestamp with time zone,
    quality_score integer,
    link_status text,
    link_checked_at timestamp with time zone,
    CONSTRAINT jobs_salary_range_chk CHECK (((salary_min IS NULL) OR (salary_max IS NULL) OR (salary_min <= salary_max))),
    CONSTRAINT jobs_source_identity_chk CHECK (((source_key IS NULL) = (source_id IS NULL))),
    CONSTRAINT jobs_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text])))
);
CREATE VIEW public.jobs_feed WITH (security_invoker='true') AS
 SELECT id,
    title,
    company,
    location,
    remote,
    workplace_type,
    employment_type,
    seniority,
    role_family,
    salary_min,
    salary_max,
    salary_currency,
    salary_period,
    salary_range,
    posted_at,
    first_seen,
    last_seen,
    apply_url,
    source,
    source_key,
    quality_score,
    description,
    created_at
   FROM public.jobs
  WHERE (status = 'active'::text);
CREATE TABLE public.learning_resources (
    id text NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    provider text NOT NULL,
    type text NOT NULL,
    duration_minutes integer,
    skill_ids text[] NOT NULL,
    level smallint NOT NULL,
    quality smallint NOT NULL,
    is_free boolean DEFAULT true NOT NULL,
    status text DEFAULT 'unverified'::text NOT NULL,
    last_checked timestamp with time zone,
    http_status integer,
    fail_count integer DEFAULT 0 NOT NULL,
    source text NOT NULL,
    CONSTRAINT learning_resources_level_check CHECK (((level >= 1) AND (level <= 5))),
    CONSTRAINT learning_resources_quality_check CHECK (((quality >= 1) AND (quality <= 5))),
    CONSTRAINT learning_resources_skill_ids_check CHECK ((cardinality(skill_ids) > 0)),
    CONSTRAINT learning_resources_status_check CHECK ((status = ANY (ARRAY['unverified'::text, 'active'::text, 'broken'::text, 'retired'::text]))),
    CONSTRAINT learning_resources_url_check CHECK ((url ~~ 'https://%'::text))
);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE TABLE public.lessons (
    id text NOT NULL,
    skill_id text NOT NULL,
    title text NOT NULL,
    summary_md text NOT NULL,
    key_points text[] DEFAULT '{}'::text[] NOT NULL,
    resource_ids text[] DEFAULT '{}'::text[] NOT NULL,
    estimated_minutes integer NOT NULL,
    is_core boolean DEFAULT true NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    ai_drafted boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT lessons_estimated_minutes_check CHECK ((estimated_minutes > 0)),
    CONSTRAINT lessons_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT lessons_summary_md_check CHECK ((summary_md !~* 'https?://'::text))
);
CREATE TABLE public.login_attempts (
    id bigint NOT NULL,
    email text NOT NULL,
    succeeded boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.login_attempts_id_seq OWNED BY public.login_attempts.id;
CREATE TABLE public.login_tickets (
    ticket_hash text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);
CREATE TABLE public.practice_items (
    id text NOT NULL,
    skill_id text NOT NULL,
    lesson_id text,
    kind text NOT NULL,
    difficulty text DEFAULT 'easy'::text NOT NULL,
    company_tags text[] DEFAULT '{}'::text[] NOT NULL,
    body jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    ai_drafted boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT practice_items_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
    CONSTRAINT practice_items_kind_check CHECK ((kind = ANY (ARRAY['mcq'::text, 'fill_in'::text, 'ordering'::text, 'code'::text]))),
    CONSTRAINT practice_items_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text])))
);
CREATE TABLE public.practice_solutions (
    item_id text NOT NULL,
    solution_code text NOT NULL,
    notes text DEFAULT ''::text NOT NULL
);
CREATE TABLE public.razorpay_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    plan text NOT NULL,
    amount text NOT NULL,
    payment_id text NOT NULL,
    order_id text,
    status text DEFAULT 'captured'::text NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT razorpay_payments_plan_check CHECK ((plan = ANY (ARRAY['pro'::text, 'turbo'::text, 'lifetime'::text]))),
    CONSTRAINT razorpay_payments_status_check CHECK ((status = ANY (ARRAY['captured'::text, 'failed'::text, 'refunded'::text])))
);
CREATE TABLE public.role_families (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    legacy_roadmap_ids text[] DEFAULT '{}'::text[] NOT NULL,
    example_titles text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE public.role_skills (
    role_id text NOT NULL,
    skill_id text NOT NULL,
    weight numeric NOT NULL,
    CONSTRAINT role_skills_weight_check CHECK (((weight > (0)::numeric) AND (weight <= (1)::numeric)))
);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE TABLE public.scrape_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    source text NOT NULL,
    tier smallint NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    fetched integer DEFAULT 0 NOT NULL,
    valid integer DEFAULT 0 NOT NULL,
    invalid integer DEFAULT 0 NOT NULL,
    duplicates integer DEFAULT 0 NOT NULL,
    link_failed integer DEFAULT 0 NOT NULL,
    upserted integer DEFAULT 0 NOT NULL,
    expired integer DEFAULT 0 NOT NULL,
    error text,
    alert text,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scrape_runs_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text]))),
    CONSTRAINT scrape_runs_tier_check CHECK (((tier >= 1) AND (tier <= 3)))
);
CREATE TABLE public.signup_attempts (
    id bigint NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.signup_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.signup_attempts_id_seq OWNED BY public.signup_attempts.id;
CREATE TABLE public.skill_prerequisites (
    skill_id text NOT NULL,
    prerequisite_id text NOT NULL,
    strength text DEFAULT 'hard'::text NOT NULL,
    CONSTRAINT skill_prerequisites_check CHECK ((skill_id <> prerequisite_id)),
    CONSTRAINT skill_prerequisites_strength_check CHECK ((strength = ANY (ARRAY['hard'::text, 'soft'::text])))
);
CREATE TABLE public.skills (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    level smallint NOT NULL,
    estimated_hours numeric NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    patterns text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skills_estimated_hours_check CHECK ((estimated_hours > (0)::numeric)),
    CONSTRAINT skills_level_check CHECK (((level >= 1) AND (level <= 5)))
);
CREATE TABLE public.user_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company text NOT NULL,
    title text NOT NULL,
    apply_url text NOT NULL,
    status text DEFAULT 'applied'::text,
    mode text DEFAULT 'autonomous'::text,
    applied_at timestamp with time zone DEFAULT now(),
    notes text,
    status_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_cloud_profiles (
    user_id uuid NOT NULL,
    first_name text,
    last_name text,
    phone text,
    linkedin text,
    github text,
    sponsorship text DEFAULT 'No'::text,
    desired_salary text,
    notice_period text DEFAULT '2 weeks'::text,
    groq_api_key text,
    smtp_password text,
    resume_text text,
    custom_answers_json jsonb DEFAULT '{}'::jsonb,
    onboarding_completed boolean DEFAULT false,
    desired_title text,
    tech_stack text,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_job_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    job_id uuid NOT NULL,
    match_score integer DEFAULT 100,
    status text DEFAULT 'new'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_job_matches_status_check CHECK ((status = ANY (ARRAY['new'::text, 'applied'::text, 'saved'::text, 'ignored'::text])))
);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    target_titles text[] DEFAULT '{}'::text[],
    locations text[] DEFAULT '{}'::text[],
    is_remote boolean DEFAULT false,
    min_salary integer DEFAULT 0,
    excluded_keywords text[] DEFAULT '{}'::text[],
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_resumes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    target_role text,
    file_path text,
    resume_text text,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_saved_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    company text NOT NULL,
    apply_url text NOT NULL,
    location text,
    salary text,
    source text,
    score integer DEFAULT 100,
    description text,
    saved_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    current_ip text NOT NULL,
    device_fingerprint text NOT NULL,
    session_token text NOT NULL,
    last_heartbeat timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    device_name text DEFAULT 'Desktop Laptop'::text
);
CREATE TABLE public.user_tracks (
    user_id uuid NOT NULL,
    track_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    horizon_months smallint DEFAULT 3 NOT NULL,
    daily_hours smallint DEFAULT 2 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT user_tracks_daily_hours_check CHECK ((daily_hours = ANY (ARRAY[1, 2, 4]))),
    CONSTRAINT user_tracks_horizon_months_check CHECK ((horizon_months = ANY (ARRAY[1, 3, 6]))),
    CONSTRAINT user_tracks_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);
CREATE TABLE public.users_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    subscription_tier text DEFAULT 'pro'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    password_hash text,
    role text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    license_key text,
    expires_at timestamp with time zone,
    apps_count integer DEFAULT 0 NOT NULL,
    last_login timestamp with time zone,
    CONSTRAINT users_profile_role_chk CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text]))),
    CONSTRAINT users_profile_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT users_profile_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['trial'::text, 'pro'::text, 'max'::text, 'enterprise'::text, 'lifetime'::text])))
);
ALTER TABLE ONLY public.login_attempts ALTER COLUMN id SET DEFAULT nextval('public.login_attempts_id_seq'::regclass);
ALTER TABLE ONLY public.signup_attempts ALTER COLUMN id SET DEFAULT nextval('public.signup_attempts_id_seq'::regclass);
ALTER TABLE ONLY public.app_security
    ADD CONSTRAINT app_security_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_records
    ADD CONSTRAINT billing_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hr_contacts
    ADD CONSTRAINT hr_contacts_email_key UNIQUE (email);
ALTER TABLE ONLY public.hr_contacts
    ADD CONSTRAINT hr_contacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_job_hash_key UNIQUE (job_hash);
ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
ALTER TABLE ONLY public.learning_events
    ADD CONSTRAINT learning_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.learning_resources
    ADD CONSTRAINT learning_resources_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.learning_resources
    ADD CONSTRAINT learning_resources_url_key UNIQUE (url);
ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.login_tickets
    ADD CONSTRAINT login_tickets_pkey PRIMARY KEY (ticket_hash);
ALTER TABLE ONLY public.practice_items
    ADD CONSTRAINT practice_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.practice_solutions
    ADD CONSTRAINT practice_solutions_pkey PRIMARY KEY (item_id);
ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_payment_id_key UNIQUE (payment_id);
ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_families
    ADD CONSTRAINT role_families_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_skills
    ADD CONSTRAINT role_skills_pkey PRIMARY KEY (role_id, skill_id);
ALTER TABLE ONLY public.scrape_runs
    ADD CONSTRAINT scrape_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.signup_attempts
    ADD CONSTRAINT signup_attempts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.skill_prerequisites
    ADD CONSTRAINT skill_prerequisites_pkey PRIMARY KEY (skill_id, prerequisite_id);
ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_applications
    ADD CONSTRAINT uq_user_application_apply_url UNIQUE (user_id, apply_url);
ALTER TABLE ONLY public.user_resumes
    ADD CONSTRAINT uq_user_resumes_name UNIQUE (user_id, name);
ALTER TABLE ONLY public.user_saved_jobs
    ADD CONSTRAINT uq_user_saved_jobs_url UNIQUE (user_id, apply_url);
ALTER TABLE ONLY public.user_applications
    ADD CONSTRAINT user_applications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_cloud_profiles
    ADD CONSTRAINT user_cloud_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.user_job_matches
    ADD CONSTRAINT user_job_matches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_job_matches
    ADD CONSTRAINT user_job_matches_user_id_job_id_key UNIQUE (user_id, job_id);
ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.user_resumes
    ADD CONSTRAINT user_resumes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_saved_jobs
    ADD CONSTRAINT user_saved_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_key UNIQUE (session_token);
ALTER TABLE ONLY public.user_tracks
    ADD CONSTRAINT user_tracks_pkey PRIMARY KEY (user_id, track_id);
ALTER TABLE ONLY public.users_profile
    ADD CONSTRAINT users_profile_email_key UNIQUE (email);
ALTER TABLE ONLY public.users_profile
    ADD CONSTRAINT users_profile_pkey PRIMARY KEY (id);
CREATE INDEX idx_billing_created_at ON public.billing_records USING btree (created_at DESC);
CREATE INDEX idx_billing_user_email ON public.billing_records USING btree (lower(user_email));
CREATE INDEX idx_hr_contacts_company ON public.hr_contacts USING btree (company);
CREATE INDEX idx_hr_contacts_email ON public.hr_contacts USING btree (email);
CREATE INDEX idx_hr_contacts_role ON public.hr_contacts USING btree (role);
CREATE INDEX idx_jobs_active ON public.jobs USING btree (is_active) WHERE (is_active = true);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE INDEX idx_jobs_active_recent ON public.jobs USING btree (COALESCE(posted_at, created_at) DESC) WHERE (status = 'active'::text);
CREATE INDEX idx_jobs_canonical_url ON public.jobs USING btree (canonical_url);
CREATE INDEX idx_jobs_created_at ON public.jobs USING btree (created_at DESC);
CREATE INDEX idx_jobs_feed ON public.jobs USING btree (status, employment_type, posted_at DESC NULLS LAST, created_at DESC);
CREATE INDEX idx_jobs_hash ON public.jobs USING btree (job_hash);
CREATE INDEX idx_jobs_role_family ON public.jobs USING btree (role_family) WHERE (status = 'active'::text);
CREATE INDEX idx_jobs_source_last_seen ON public.jobs USING btree (source_key, last_seen) WHERE (status = 'active'::text);
CREATE INDEX idx_learning_events_user_time ON public.learning_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_learning_resources_skills ON public.learning_resources USING gin (skill_ids);
CREATE INDEX idx_lessons_skill ON public.lessons USING btree (skill_id);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts USING btree (email, created_at DESC);
CREATE INDEX idx_practice_items_skill ON public.practice_items USING btree (skill_id);
CREATE INDEX idx_razorpay_payments_email ON public.razorpay_payments USING btree (lower(email));
CREATE INDEX idx_razorpay_payments_payment_id ON public.razorpay_payments USING btree (payment_id);
CREATE INDEX idx_scrape_runs_run ON public.scrape_runs USING btree (run_id);
CREATE INDEX idx_scrape_runs_source_started ON public.scrape_runs USING btree (source, started_at DESC);
CREATE INDEX idx_scrape_runs_started ON public.scrape_runs USING btree (started_at DESC);
CREATE INDEX idx_signup_attempts_email_time ON public.signup_attempts USING btree (email, created_at DESC);
CREATE INDEX idx_user_applications_user ON public.user_applications USING btree (user_id, applied_at DESC);
CREATE INDEX idx_user_resumes_user ON public.user_resumes USING btree (user_id);
CREATE INDEX idx_user_saved_jobs_user ON public.user_saved_jobs USING btree (user_id, saved_at DESC);
CREATE INDEX idx_user_sessions_lookup ON public.user_sessions USING btree (user_id, is_active);
CREATE INDEX idx_users_profile_email_lower ON public.users_profile USING btree (lower(email));
CREATE UNIQUE INDEX uq_jobs_source_identity ON public.jobs USING btree (source_key, source_id);
CREATE TRIGGER trg_jobs_sync_status BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.jobs_sync_status();
CREATE TRIGGER trg_learning_events_immutable BEFORE UPDATE ON public.learning_events FOR EACH ROW EXECUTE FUNCTION public.learning_events_immutable();
ALTER TABLE ONLY public.learning_events
    ADD CONSTRAINT learning_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.login_tickets
    ADD CONSTRAINT login_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.practice_items
    ADD CONSTRAINT practice_items_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.practice_items
    ADD CONSTRAINT practice_items_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.practice_solutions
    ADD CONSTRAINT practice_solutions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.practice_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
ALTER TABLE ONLY public.role_skills
    ADD CONSTRAINT role_skills_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role_families(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_skills
    ADD CONSTRAINT role_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.skill_prerequisites
    ADD CONSTRAINT skill_prerequisites_prerequisite_id_fkey FOREIGN KEY (prerequisite_id) REFERENCES public.skills(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.skill_prerequisites
    ADD CONSTRAINT skill_prerequisites_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_applications
    ADD CONSTRAINT user_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_cloud_profiles
    ADD CONSTRAINT user_cloud_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_job_matches
    ADD CONSTRAINT user_job_matches_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_job_matches
    ADD CONSTRAINT user_job_matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_resumes
    ADD CONSTRAINT user_resumes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_saved_jobs
    ADD CONSTRAINT user_saved_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_tracks
    ADD CONSTRAINT user_tracks_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.role_families(id);
ALTER TABLE ONLY public.user_tracks
    ADD CONSTRAINT user_tracks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;
CREATE POLICY "anon can read active jobs" ON public.jobs FOR SELECT TO anon, authenticated USING ((is_active = true));
ALTER TABLE public.app_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active resources" ON public.learning_resources FOR SELECT TO anon, authenticated USING ((status = 'active'::text));
CREATE POLICY "read prerequisites" ON public.skill_prerequisites FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read published lessons" ON public.lessons FOR SELECT TO anon, authenticated USING ((status = 'published'::text));
CREATE POLICY "read published practice" ON public.practice_items FOR SELECT TO anon, authenticated USING ((status = 'published'::text));
CREATE POLICY "read role skills" ON public.role_skills FOR SELECT TO anon, authenticated USING (true);
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE POLICY "read roles" ON public.role_families FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read skills" ON public.skills FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.role_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cloud_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON FUNCTION public.authenticate_user(p_email text, p_password text) TO anon;
GRANT ALL ON FUNCTION public.authenticate_user(p_email text, p_password text) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_razorpay_payment_success(p_user_id uuid, p_email text, p_plan text, p_amount text, p_payment_id text, p_order_id text, p_raw_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_razorpay_payment_success(p_user_id uuid, p_email text, p_plan text, p_amount text, p_payment_id text, p_order_id text, p_raw_payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.jobmaxxer_hash_login(p_email text, p_password text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jobs_sync_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_archive_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_archive_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text) TO service_role;
GRANT ALL ON FUNCTION public.learning_archive_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text) TO anon;
GRANT ALL ON FUNCTION public.learning_archive_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.learning_events_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_pull_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_pull_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_since timestamp with time zone) TO service_role;
GRANT ALL ON FUNCTION public.learning_pull_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.learning_pull_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_since timestamp with time zone) TO authenticated;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
REVOKE ALL ON FUNCTION public.learning_record_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_events jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_record_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_events jsonb) TO service_role;
GRANT ALL ON FUNCTION public.learning_record_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_events jsonb) TO anon;
GRANT ALL ON FUNCTION public.learning_record_events(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_events jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.learning_session_ok(p_user_id uuid, p_session_token text, p_device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_session_ok(p_user_id uuid, p_session_token text, p_device_fingerprint text) TO service_role;
REVOKE ALL ON FUNCTION public.learning_start_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text, p_horizon_months smallint, p_daily_hours smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_start_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text, p_horizon_months smallint, p_daily_hours smallint) TO service_role;
GRANT ALL ON FUNCTION public.learning_start_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text, p_horizon_months smallint, p_daily_hours smallint) TO anon;
GRANT ALL ON FUNCTION public.learning_start_track(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_track_id text, p_horizon_months smallint, p_daily_hours smallint) TO authenticated;
REVOKE ALL ON FUNCTION public.learning_tier(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_tier(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.maintain_jobs_lifecycle() FROM PUBLIC;
GRANT ALL ON FUNCTION public.maintain_jobs_lifecycle() TO service_role;
REVOKE ALL ON FUNCTION public.match_jobs_for_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_device_session(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_device_name text, p_client_ip text, p_force_takeover boolean, p_login_ticket text) TO anon;
GRANT ALL ON FUNCTION public.register_device_session(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_device_name text, p_client_ip text, p_force_takeover boolean, p_login_ticket text) TO authenticated;
REVOKE ALL ON FUNCTION public.register_user(p_email text, p_password text, p_full_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_user(p_email text, p_password text, p_full_name text) TO anon;
GRANT ALL ON FUNCTION public.register_user(p_email text, p_password text, p_full_name text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_user_password(p_email text, p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_user_password(p_email text, p_password text) TO service_role;
REVOKE ALL ON FUNCTION public.sync_delete_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_delete_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) TO anon;
GRANT ALL ON FUNCTION public.sync_delete_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) TO authenticated;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
REVOKE ALL ON FUNCTION public.sync_delete_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_delete_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text) TO anon;
GRANT ALL ON FUNCTION public.sync_delete_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_pull_user_data(p_user_id uuid, p_session_token text, p_device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_pull_user_data(p_user_id uuid, p_session_token text, p_device_fingerprint text) TO anon;
GRANT ALL ON FUNCTION public.sync_pull_user_data(p_user_id uuid, p_session_token text, p_device_fingerprint text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_push_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_company text, p_title text, p_apply_url text, p_status text, p_mode text, p_notes text, p_status_history jsonb, p_applied_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_push_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_company text, p_title text, p_apply_url text, p_status text, p_mode text, p_notes text, p_status_history jsonb, p_applied_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.sync_push_application(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_company text, p_title text, p_apply_url text, p_status text, p_mode text, p_notes text, p_status_history jsonb, p_applied_at timestamp with time zone) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_push_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text, p_target_role text, p_file_path text, p_resume_text text, p_is_default boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_push_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text, p_target_role text, p_file_path text, p_resume_text text, p_is_default boolean) TO anon;
GRANT ALL ON FUNCTION public.sync_push_resume(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_name text, p_target_role text, p_file_path text, p_resume_text text, p_is_default boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_push_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_title text, p_company text, p_apply_url text, p_location text, p_salary text, p_source text, p_score integer, p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_push_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_title text, p_company text, p_apply_url text, p_location text, p_salary text, p_source text, p_score integer, p_description text) TO anon;
GRANT ALL ON FUNCTION public.sync_push_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_title text, p_company text, p_apply_url text, p_location text, p_salary text, p_source text, p_score integer, p_description text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_push_user_profile(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_profile jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_push_user_profile(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_profile jsonb) TO anon;
GRANT ALL ON FUNCTION public.sync_push_user_profile(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_profile jsonb) TO authenticated;
SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', false);
REVOKE ALL ON FUNCTION public.sync_remove_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_remove_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) TO anon;
GRANT ALL ON FUNCTION public.sync_remove_saved_job(p_user_id uuid, p_session_token text, p_device_fingerprint text, p_apply_url text) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_and_update_session(p_user_id uuid, p_session_token text, p_client_ip text, p_device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_and_update_session(p_user_id uuid, p_session_token text, p_client_ip text, p_device_fingerprint text) TO anon;
GRANT ALL ON FUNCTION public.verify_and_update_session(p_user_id uuid, p_session_token text, p_client_ip text, p_device_fingerprint text) TO authenticated;
GRANT SELECT ON TABLE public.jobs_feed TO anon;
GRANT SELECT ON TABLE public.jobs_feed TO authenticated;
INSERT INTO public.app_security (id) VALUES (TRUE) ON CONFLICT DO NOTHING;
SELECT pg_catalog.set_config('search_path', 'public, extensions', false);
SET check_function_bodies = true;
-- ===== 011_entitlements.sql =====
-- 011: entitlements service (F9).
--
-- One place on the server that answers "what may this user do today":
--   * plan_limits(plan)          limits per plan, rendered from packages/config
--   * billing_effective_plan(id) 'free' | 'pro' | 'max' after expiry/aliases
--   * get_entitlements(...)      session-checked: plan, expiry and today's usage
--   * consume_apply_quota(...)   session-checked: atomically checks and counts
--                                reviewed applications against today's limit
--
-- Limits are enforced HERE, never on the client (DECISIONS #15). The desktop
-- app calls consume_apply_quota right before each submission and refuses to
-- submit when it is refused or unreachable.
--
-- "Today" is the Asia/Kolkata calendar day (Indian users, DECISIONS #10); the
-- counter resets at local midnight.
-- Idempotent.
-- 1. Usage counters --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  metric     TEXT NOT NULL CHECK (metric IN ('apply')),
  used       INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date, metric)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_counters FROM PUBLIC, anon, authenticated;
-- 2. Plan limits (single source: packages/config/src/plans.ts) -------------------
-- The VALUES rows between the markers are checked line-for-line against
-- planLimitsSqlRows() by packages/supabase/src/__tests__/entitlements-parity.test.ts.
-- Change limits in packages/config, then paste the rows the test prints.
-- NULL = unlimited.
CREATE OR REPLACE FUNCTION public.plan_limits(p_plan TEXT)
RETURNS TABLE (
  applies_per_day  INT,
  feed_jobs        INT,
  learn_tracks     INT,
  practice_per_day INT,
  autonomous_apply BOOLEAN,
  resumes          INT
)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT t.applies_per_day, t.feed_jobs, t.learn_tracks, t.practice_per_day, t.autonomous_apply, t.resumes
  FROM (VALUES
    -- BEGIN plan_limits (generated from packages/config)
    ('free', 3, 10, 1, 10, FALSE, 1),
    ('pro', 10, NULL, NULL, NULL, FALSE, 5),
    ('max', NULL, NULL, NULL, NULL, TRUE, NULL)
    -- END plan_limits
  ) AS t(plan, applies_per_day, feed_jobs, learn_tracks, practice_per_day, autonomous_apply, resumes)
  WHERE t.plan = p_plan;
$$;
-- 3. Effective plan --------------------------------------------------------------
-- Mirrors normalizeTier() in packages/config. Expired subscriptions and
-- trials are Free; suspended accounts keep their plan name but every gated
-- RPC refuses them.
CREATE OR REPLACE FUNCTION public.billing_effective_plan(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE
    WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'free'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) IN ('max', 'seeker_max', 'lifetime', 'enterprise', 'turbo') THEN 'max'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) IN ('pro', 'lite', 'learner_pro', 'seeker_pro', 'learner', 'seeker') THEN 'pro'
    ELSE 'free' END
  FROM public.users_profile u WHERE u.id = p_user_id;
$$;
CREATE OR REPLACE FUNCTION public.billing_session_ok(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.user_id = p_user_id AND s.session_token = p_session_token
      AND s.device_fingerprint = p_device_fingerprint AND s.is_active = TRUE
  );
$$;
CREATE OR REPLACE FUNCTION public.billing_today()
RETURNS DATE LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
$$;
-- 4. get_entitlements ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entitlements(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (
  ok                  BOOLEAN,
  error               TEXT,
  plan                TEXT,
  stored_tier         TEXT,
  account_status      TEXT,
  expires_at          TIMESTAMPTZ,
  applies_per_day     INT,
  applies_used        INT,
  applies_remaining   INT,
  feed_jobs           INT,
  learn_tracks        INT,
  learn_tracks_active INT,
  practice_per_day    INT,
  autonomous_apply    BOOLEAN,
  resumes             INT,
  resets_at           TIMESTAMPTZ,
  server_time         TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  u      public.users_profile%ROWTYPE;
  v_plan TEXT;
  l      RECORD;
  v_used INT;
  v_tracks INT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
      NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::BOOLEAN, NULL::INT,
      NULL::TIMESTAMPTZ, NOW();
    RETURN;
  END IF;
  SELECT * INTO u FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT * INTO l FROM public.plan_limits(v_plan);
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = public.billing_today() AND c.metric = 'apply';
  SELECT count(*)::INT INTO v_tracks FROM public.user_tracks t
  WHERE t.user_id = p_user_id AND t.status = 'active';
  RETURN QUERY SELECT
    TRUE, NULL::TEXT, v_plan, u.subscription_tier,
    CASE WHEN u.status = 'suspended' THEN 'suspended'
         WHEN u.expires_at IS NOT NULL AND u.expires_at < NOW() THEN 'expired'
         ELSE 'active' END,
    u.expires_at,
    l.applies_per_day, v_used,
    CASE WHEN u.status = 'suspended' THEN 0
         WHEN l.applies_per_day IS NULL THEN NULL
         ELSE GREATEST(l.applies_per_day - v_used, 0) END,
    l.feed_jobs, l.learn_tracks, v_tracks, l.practice_per_day, l.autonomous_apply, l.resumes,
    ((public.billing_today() + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'),
    NOW();
END;
$$;
-- 5. consume_apply_quota ---------------------------------------------------------
-- Counts p_count applications against today's limit, all or nothing.
-- Returns ok = FALSE with error 'apply_limit_reached' (nothing counted) when
-- the request does not fit; serialised per user with an advisory lock.
CREATE OR REPLACE FUNCTION public.consume_apply_quota(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_count INT DEFAULT 1
)
RETURNS TABLE (
  ok                BOOLEAN,
  error             TEXT,
  plan              TEXT,
  applies_per_day   INT,
  applies_used      INT,
  applies_remaining INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_plan   TEXT;
  v_limit  INT;
  v_used   INT;
  v_status TEXT;
  v_today  DATE := public.billing_today();
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, NULL::INT, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 50 THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, NULL::INT, NULL::INT, NULL::INT; RETURN;
  END IF;
  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT l.applies_per_day INTO v_limit FROM public.plan_limits(v_plan) l;
  PERFORM pg_advisory_xact_lock(hashtext('apply_quota:' || p_user_id::text));
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = v_today AND c.metric = 'apply';
  IF v_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, 'account_suspended', v_plan, v_limit, v_used, 0; RETURN;
  END IF;
  IF v_limit IS NOT NULL AND v_used + p_count > v_limit THEN
    RETURN QUERY SELECT FALSE, 'apply_limit_reached', v_plan, v_limit, v_used, GREATEST(v_limit - v_used, 0);
    RETURN;
  END IF;
  INSERT INTO public.usage_counters (user_id, usage_date, metric, used, updated_at)
  VALUES (p_user_id, v_today, 'apply', p_count, NOW())
  ON CONFLICT (user_id, usage_date, metric)
  DO UPDATE SET used = public.usage_counters.used + EXCLUDED.used, updated_at = NOW();
  v_used := v_used + p_count;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_plan, v_limit, v_used,
    CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(v_limit - v_used, 0) END;
END;
$$;
-- 6. Grants (allow-list rule, SECURITY_CHECKLIST) --------------------------------
-- Helpers stay private; only the two session-checked RPCs are callable by the app.
REVOKE ALL ON FUNCTION public.plan_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_effective_plan(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_session_ok(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_effective_plan(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.get_entitlements(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_apply_quota(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entitlements(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_apply_quota(UUID, TEXT, TEXT, INT) TO anon, authenticated, service_role;
-- Only today's rows are read by the RPCs; the date index keeps a future purge cheap.
CREATE INDEX IF NOT EXISTS idx_usage_counters_date ON public.usage_counters (usage_date);
-- ===== 014_admin_tools.sql =====
-- ----------------------------------------------------------------------------
-- MIGRATION 014: Admin and content tools (F12)
--
-- The desktop admin panel used the service-role key (or, without it, the anon
-- key) to read and write users_profile directly. That key must never be on a
-- customer machine, and hiding the Admin tab is not protection. From here on
-- every admin read and write goes through the SECURITY DEFINER RPCs below.
-- Each one:
--   * verifies the caller's device session (session_token + user_id +
--     device_fingerprint + is_active, same model as 003 / 008 / 010), AND
--   * verifies users_profile.role = 'admin' and status = 'active' for that user
--     (the role is read from the database, never taken from the client), and
--   * writes one row to the append-only admin_audit_log in the same
--     transaction for every change.
-- Content edits snapshot the previous row into the append-only
-- content_versions table and bump the row's version (optimistic concurrency:
-- the caller must send the version it edited).
-- Resources cannot be created from the app (curated URLs come from the seed in
-- packages/learning); admins may only change a resource's status, and 'active'
-- requires a passing link check.
-- Idempotent.
-- ----------------------------------------------------------------------------
-- 1. Append-only audit log ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  -- No foreign key: an audit row must outlive the accounts it mentions.
  actor_id     UUID,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('user', 'lesson', 'resource', 'admin')),
  target_id    TEXT,
  target_label TEXT,
  reason       TEXT,
  before       JSONB,
  after        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log (target_type, target_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.admin_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_append_only();
DROP TRIGGER IF EXISTS trg_admin_audit_log_no_truncate ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_truncate BEFORE TRUNCATE ON public.admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_append_only();
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM PUBLIC, anon, authenticated;
-- 2. Content versions ------------------------------------------------------------
-- snapshot = the full row as it was at `version`, written just before the edit
-- that produced version + 1.
CREATE TABLE IF NOT EXISTS public.content_versions (
  id           BIGSERIAL PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('lesson', 'resource')),
  content_id   TEXT NOT NULL,
  version      INT NOT NULL,
  snapshot     JSONB NOT NULL,
  edited_by    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id, version)
);
DROP TRIGGER IF EXISTS trg_content_versions_immutable ON public.content_versions;
CREATE TRIGGER trg_content_versions_immutable BEFORE UPDATE OR DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.admin_append_only();
DROP TRIGGER IF EXISTS trg_content_versions_no_truncate ON public.content_versions;
CREATE TRIGGER trg_content_versions_no_truncate BEFORE TRUNCATE ON public.content_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_append_only();
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.content_versions_id_seq FROM PUBLIC, anon, authenticated;
-- Resources get a version like lessons; both get an edit timestamp.
ALTER TABLE public.learning_resources ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.learning_resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- 3. Caller check -----------------------------------------------------------------
-- 'ok' | 'unauthorized' (no valid session) | 'forbidden' (valid session, not an
-- active admin). A refused non-admin is audited at most once per 10 minutes.
CREATE OR REPLACE FUNCTION public.admin_check_caller(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL OR p_session_token IS NULL OR p_device_fingerprint IS NULL THEN
    RETURN 'unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.user_id = p_user_id AND s.session_token = p_session_token
      AND s.device_fingerprint = p_device_fingerprint AND s.is_active = TRUE
  ) THEN
    RETURN 'unauthorized';
  END IF;
  SELECT u.role, u.status, u.email INTO v_role, v_status, v_email
  FROM public.users_profile u WHERE u.id = p_user_id;
  IF v_role IS DISTINCT FROM 'admin' OR v_status IS DISTINCT FROM 'active' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_audit_log a
      WHERE a.actor_id = p_user_id AND a.action = 'admin.denied' AND a.created_at > NOW() - INTERVAL '10 minutes'
    ) THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id)
      VALUES (p_user_id, v_email, 'admin.denied', 'admin', p_user_id::text);
    END IF;
    RETURN 'forbidden';
  END IF;
  RETURN 'ok';
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_audit(
  p_actor UUID, p_action TEXT, p_target_type TEXT, p_target_id TEXT, p_target_label TEXT,
  p_reason TEXT, p_before JSONB, p_after JSONB
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, reason, before, after)
  VALUES (p_actor, (SELECT email FROM public.users_profile WHERE id = p_actor), p_action, p_target_type,
          p_target_id, p_target_label, p_reason, p_before, p_after)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
-- Normalised reason: trimmed, 3-500 characters, or NULL when invalid.
CREATE OR REPLACE FUNCTION public.admin_reason(p_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(btrim(COALESCE(p_reason, ''))) BETWEEN 3 AND 500 THEN btrim(p_reason) ELSE NULL END;
$$;
-- LIKE pattern for a user-supplied search string (wildcards escaped).
CREATE OR REPLACE FUNCTION public.admin_like(p_query TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT '%' || replace(replace(replace(btrim(left(COALESCE(p_query, ''), 200)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
-- 4. Users ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_query TEXT DEFAULT NULL, p_tier TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_like TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_total INT;
  v_users JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  v_like := CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL ELSE public.admin_like(p_query) END;
  WITH filtered AS (
    SELECT u.* FROM public.users_profile u
    WHERE (v_like IS NULL OR u.email ILIKE v_like OR COALESCE(u.full_name, '') ILIKE v_like OR u.id::text = btrim(p_query))
      AND (p_tier IS NULL OR u.subscription_tier = p_tier)
      AND (p_status IS NULL OR u.status = p_status)
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at DESC NULLS LAST, r.email)
      FROM (
        SELECT f.id, f.email, f.full_name, f.subscription_tier, f.role, f.status, f.expires_at,
               f.created_at, f.last_login, f.apps_count,
               (SELECT count(*) FROM public.user_sessions s WHERE s.user_id = f.id AND s.is_active = TRUE) AS active_sessions
        FROM filtered f
        ORDER BY f.created_at DESC NULLS LAST, f.email
        LIMIT v_limit OFFSET v_offset
      ) r
    ), '[]'::jsonb)
  INTO v_total, v_users;
  RETURN jsonb_build_object('ok', TRUE, 'total', v_total, 'users', v_users);
END;
$$;
-- Change a user's plan and expiry. p_expires_at NULL = no expiry (lifetime is
-- always non-expiring). An admin cannot change their own account.
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_target_id UUID, p_tier TEXT, p_expires_at TIMESTAMPTZ, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  v_expires TIMESTAMPTZ := CASE WHEN p_tier = 'lifetime' THEN NULL ELSE p_expires_at END;
  u public.users_profile%ROWTYPE;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_target_id = p_user_id THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_change_self'); END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('trial', 'pro', 'max', 'lifetime') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_plan');
  END IF;
  IF v_expires IS NOT NULL AND v_expires <= NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_expiry');
  END IF;
  SELECT * INTO u FROM public.users_profile WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF u.subscription_tier IS NOT DISTINCT FROM p_tier AND u.expires_at IS NOT DISTINCT FROM v_expires THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change');
  END IF;
  UPDATE public.users_profile SET subscription_tier = p_tier, expires_at = v_expires, updated_at = NOW()
  WHERE id = p_target_id;
  v_audit := public.admin_audit(p_user_id, 'user.plan_changed', 'user', p_target_id::text, u.email, v_reason,
    jsonb_build_object('tier', u.subscription_tier, 'expires_at', u.expires_at),
    jsonb_build_object('tier', p_tier, 'expires_at', v_expires));
  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'tier', p_tier, 'expires_at', v_expires);
END;
$$;
-- Suspend or reactivate. Suspending also ends the user's active device sessions.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_target_id UUID, p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  u public.users_profile%ROWTYPE;
  v_ended INT := 0;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_target_id = p_user_id THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_change_self'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;
  SELECT * INTO u FROM public.users_profile WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF u.status = p_status THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;
  UPDATE public.users_profile SET status = p_status, updated_at = NOW() WHERE id = p_target_id;
  IF p_status = 'suspended' THEN
    UPDATE public.user_sessions SET is_active = FALSE WHERE user_id = p_target_id AND is_active = TRUE;
    GET DIAGNOSTICS v_ended = ROW_COUNT;
  END IF;
  v_audit := public.admin_audit(p_user_id,
    CASE WHEN p_status = 'suspended' THEN 'user.suspended' ELSE 'user.reactivated' END,
    'user', p_target_id::text, u.email, v_reason,
    jsonb_build_object('status', u.status),
    jsonb_build_object('status', p_status, 'sessions_ended', v_ended));
  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'status', p_status, 'sessions_ended', v_ended);
END;
$$;
-- 5. Audit log viewer -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_audit(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_limit INT DEFAULT 50, p_before_id BIGINT DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL, p_target_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_entries JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.id DESC), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT a.id, a.actor_id, a.actor_email, a.action, a.target_type, a.target_id, a.target_label,
           a.reason, a.before, a.after, a.created_at
    FROM public.admin_audit_log a
    WHERE (p_before_id IS NULL OR a.id < p_before_id)
      AND (p_target_type IS NULL OR a.target_type = p_target_type)
      AND (p_target_id IS NULL OR a.target_id = p_target_id)
    ORDER BY a.id DESC
    LIMIT v_limit
  ) r;
  RETURN jsonb_build_object('ok', TRUE, 'entries', v_entries,
    'has_more', jsonb_array_length(v_entries) = v_limit);
END;
$$;
-- 6. Scraper health -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scrape_health(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_days INT DEFAULT 7
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 30));
  v_runs JSONB;
  v_sources JSONB;
  v_jobs JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.started_at DESC), '[]'::jsonb) INTO v_runs
  FROM (
    SELECT id, run_id, source, tier, status, started_at, finished_at, duration_ms, fetched, valid, invalid,
           duplicates, link_failed, upserted, expired, error, alert, published
    FROM public.scrape_runs WHERE started_at >= v_since
    ORDER BY started_at DESC LIMIT 200
  ) r;
  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.failures DESC, s.source), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT sr.source,
           count(*)::int AS runs,
           count(*) FILTER (WHERE sr.status = 'error')::int AS failures,
           max(sr.started_at) AS last_run_at,
           (array_agg(sr.status ORDER BY sr.started_at DESC))[1] AS last_status,
           max(sr.started_at) FILTER (WHERE sr.status = 'ok') AS last_ok_at,
           (array_agg(sr.error ORDER BY sr.started_at DESC) FILTER (WHERE sr.error IS NOT NULL))[1] AS last_error,
           COALESCE(sum(sr.fetched), 0)::int AS fetched,
           COALESCE(sum(sr.upserted), 0)::int AS upserted,
           COALESCE(sum(sr.link_failed), 0)::int AS link_failed,
           COALESCE(round(avg(sr.duration_ms)), 0)::int AS avg_duration_ms
    FROM public.scrape_runs sr WHERE sr.started_at >= v_since
    GROUP BY sr.source
  ) s;
  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO v_jobs
  FROM (
    SELECT COALESCE(j.source_key, j.source, 'unknown') AS k, count(*)::int AS n
    FROM public.jobs j WHERE j.status = 'active'
    GROUP BY 1
  ) c;
  RETURN jsonb_build_object('ok', TRUE, 'since', v_since, 'runs', v_runs, 'sources', v_sources,
    'active_jobs_by_source', v_jobs);
END;
$$;
-- 7. Content -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_content(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_kind TEXT, p_status TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL, p_limit INT DEFAULT 200
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_like TEXT := CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL ELSE public.admin_like(p_query) END;
  v_items JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF p_kind = 'skills' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.category, r.name), '[]'::jsonb) INTO v_items
    FROM (
      SELECT s.id, s.name, s.category, s.level, s.estimated_hours, s.updated_at,
             (SELECT count(*) FROM public.lessons l WHERE l.skill_id = s.id)::int AS lesson_count,
             (SELECT count(*) FROM public.learning_resources lr WHERE s.id = ANY (lr.skill_ids))::int AS resource_count,
             (SELECT count(*) FROM public.practice_items p WHERE p.skill_id = s.id)::int AS practice_count
      FROM public.skills s
      WHERE v_like IS NULL OR s.name ILIKE v_like OR s.id ILIKE v_like
      ORDER BY s.category, s.name LIMIT v_limit
    ) r;
  ELSIF p_kind = 'lessons' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.skill_id, r.title), '[]'::jsonb) INTO v_items
    FROM (
      SELECT l.id, l.skill_id, l.title, l.status, l.version, l.ai_drafted, l.is_core, l.estimated_minutes,
             l.summary_md, l.key_points, l.resource_ids, l.updated_at
      FROM public.lessons l
      WHERE (p_status IS NULL OR l.status = p_status)
        AND (v_like IS NULL OR l.title ILIKE v_like OR l.id ILIKE v_like OR l.skill_id ILIKE v_like)
      ORDER BY l.skill_id, l.title LIMIT v_limit
    ) r;
  ELSIF p_kind = 'resources' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.title), '[]'::jsonb) INTO v_items
    FROM (
      SELECT lr.id, lr.title, lr.url, lr.provider, lr.type, lr.status, lr.version, lr.skill_ids, lr.last_checked,
             lr.http_status, lr.fail_count, lr.source, lr.updated_at
      FROM public.learning_resources lr
      WHERE (p_status IS NULL OR lr.status = p_status)
        AND (v_like IS NULL OR lr.title ILIKE v_like OR lr.id ILIKE v_like OR lr.provider ILIKE v_like)
      ORDER BY lr.title LIMIT v_limit
    ) r;
  ELSIF p_kind = 'practice' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.skill_id, r.id), '[]'::jsonb) INTO v_items
    FROM (
      SELECT p.id, p.skill_id, p.lesson_id, p.kind, p.difficulty, p.status, p.version, p.ai_drafted,
             left(COALESCE(p.body->>'prompt', ''), 500) AS prompt
      FROM public.practice_items p
      WHERE (p_status IS NULL OR p.status = p_status)
        AND (v_like IS NULL OR p.id ILIKE v_like OR p.skill_id ILIKE v_like OR COALESCE(p.body->>'prompt', '') ILIKE v_like)
      ORDER BY p.skill_id, p.id LIMIT v_limit
    ) r;
  ELSE
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_kind');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'kind', p_kind, 'items', v_items);
END;
$$;
-- Status workflow: draft -> review -> published; published -> review (pull back)
-- or archived; review -> draft; archived -> draft. Publishing needs review first.
CREATE OR REPLACE FUNCTION public.admin_content_transition_ok(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_from = p_to OR (p_from, p_to) IN (
    ('draft', 'review'), ('draft', 'archived'),
    ('review', 'draft'), ('review', 'published'),
    ('published', 'review'), ('published', 'archived'),
    ('archived', 'draft')
  );
$$;
CREATE OR REPLACE FUNCTION public.admin_update_lesson(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_lesson_id TEXT, p_expected_version INT,
  p_title TEXT, p_summary_md TEXT, p_key_points TEXT[], p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_summary TEXT := btrim(COALESCE(p_summary_md, ''));
  v_points TEXT[];
  l public.lessons%ROWTYPE;
  v_changed TEXT[] := '{}';
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF length(v_title) NOT BETWEEN 1 AND 200 OR length(v_summary) NOT BETWEEN 1 AND 20000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_content');
  END IF;
  SELECT COALESCE(array_agg(btrim(k)) FILTER (WHERE btrim(k) <> ''), '{}') INTO v_points
  FROM unnest(COALESCE(p_key_points, '{}'::TEXT[])) k;
  IF cardinality(v_points) > 20 OR EXISTS (SELECT 1 FROM unnest(v_points) k WHERE length(k) > 300) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_content');
  END IF;
  -- Links only ever come from curated resources.
  IF v_title ~* 'https?://' OR v_summary ~* 'https?://'
     OR EXISTS (SELECT 1 FROM unnest(v_points) k WHERE k ~* 'https?://') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'urls_not_allowed');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;
  SELECT * INTO l FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF l.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'version_conflict', 'current_version', l.version);
  END IF;
  IF NOT public.admin_content_transition_ok(l.status, p_status) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_transition');
  END IF;
  IF l.title IS DISTINCT FROM v_title THEN v_changed := array_append(v_changed, 'title'); END IF;
  IF l.summary_md IS DISTINCT FROM v_summary THEN v_changed := array_append(v_changed, 'summary_md'); END IF;
  IF l.key_points IS DISTINCT FROM v_points THEN v_changed := array_append(v_changed, 'key_points'); END IF;
  IF l.status IS DISTINCT FROM p_status THEN v_changed := array_append(v_changed, 'status'); END IF;
  IF cardinality(v_changed) = 0 THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;
  INSERT INTO public.content_versions (content_type, content_id, version, snapshot, edited_by)
  VALUES ('lesson', l.id, l.version, to_jsonb(l), p_user_id);
  UPDATE public.lessons
  SET title = v_title, summary_md = v_summary, key_points = v_points, status = p_status,
      version = l.version + 1, updated_at = NOW()
  WHERE id = l.id;
  v_audit := public.admin_audit(p_user_id,
    CASE WHEN v_changed = ARRAY['status'] THEN 'lesson.status_changed' ELSE 'lesson.edited' END,
    'lesson', l.id, l.title, v_reason,
    jsonb_build_object('version', l.version, 'status', l.status, 'title', l.title),
    jsonb_build_object('version', l.version + 1, 'status', p_status, 'title', v_title, 'changed', to_jsonb(v_changed)));
  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'version', l.version + 1, 'status', p_status);
END;
$$;
-- Resources: status only (no creation, no URL edits). 'active' requires the last
-- link check to have passed (2xx/3xx), so a broken link can't be force-shown.
CREATE OR REPLACE FUNCTION public.admin_set_resource_status(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_resource_id TEXT, p_expected_version INT, p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  r public.learning_resources%ROWTYPE;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('unverified', 'active', 'broken', 'retired') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;
  SELECT * INTO r FROM public.learning_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF r.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'version_conflict', 'current_version', r.version);
  END IF;
  IF r.status = p_status THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;
  IF p_status = 'active' AND (r.last_checked IS NULL OR r.http_status IS NULL OR r.http_status NOT BETWEEN 200 AND 399) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'link_check_required');
  END IF;
  INSERT INTO public.content_versions (content_type, content_id, version, snapshot, edited_by)
  VALUES ('resource', r.id, r.version, to_jsonb(r), p_user_id);
  UPDATE public.learning_resources SET status = p_status, version = r.version + 1, updated_at = NOW()
  WHERE id = r.id;
  v_audit := public.admin_audit(p_user_id, 'resource.status_changed', 'resource', r.id, r.title, v_reason,
    jsonb_build_object('version', r.version, 'status', r.status),
    jsonb_build_object('version', r.version + 1, 'status', p_status));
  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'version', r.version + 1, 'status', p_status);
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_content_history(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_content_type TEXT, p_content_id TEXT, p_limit INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_versions JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF p_content_type IS NULL OR p_content_type NOT IN ('lesson', 'resource') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_kind');
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(v)::jsonb ORDER BY v.version DESC), '[]'::jsonb) INTO v_versions
  FROM (
    SELECT cv.version, cv.snapshot, cv.edited_by, u.email AS edited_by_email, cv.created_at
    FROM public.content_versions cv
    LEFT JOIN public.users_profile u ON u.id = cv.edited_by
    WHERE cv.content_type = p_content_type AND cv.content_id = p_content_id
    ORDER BY cv.version DESC LIMIT v_limit
  ) v;
  RETURN jsonb_build_object('ok', TRUE, 'versions', v_versions);
END;
$$;
-- 8. Grants ----------------------------------------------------------------------------
-- Helpers: never callable from a client.
REVOKE ALL ON FUNCTION public.admin_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_check_caller(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reason(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_like(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_content_transition_ok(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- Session-checked admin RPCs (added to the SECURITY_CHECKLIST allow-list).
REVOKE ALL ON FUNCTION public.admin_list_users(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_plan(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit(UUID, TEXT, TEXT, INT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_scrape_health(UUID, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_content(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_lesson(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_resource_status(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_content_history(UUID, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(UUID, TEXT, TEXT, INT, BIGINT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scrape_health(UUID, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_content(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lesson(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_resource_status(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_content_history(UUID, TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
-- ===== 016_signin_after_expiry.sql =====
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
-- ===== 015_vault_secret_accessor.sql =====
-- 015: read server-side secrets (e.g. the Resend API key) from Supabase Vault.
-- The secret itself is created out of band and never committed:
--   select vault.create_secret('<key>', 'resend_api_key', 'Resend API key used by the send-email Edge Function');
-- Only service_role (Edge Functions) may read it; anon/authenticated cannot.
SET check_function_bodies = false; -- vault exists on Supabase; plain PostgreSQL rehearsals lack it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
CREATE OR REPLACE FUNCTION private.get_vault_secret(p_name TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.get_vault_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_vault_secret(TEXT) TO service_role;
INSERT INTO public.schema_migrations (filename, checksum) VALUES
 ('001_initial_schema.sql','baseline'),('002_secure_rls.sql','baseline'),('003_cloud_sync_and_device_lock.sql','baseline'),('005_razorpay_payments.sql','baseline'),('006_scraper_pipeline.sql','baseline'),('007_learning.sql','baseline'),('008_security_hardening.sql','baseline'),('009_register_user.sql','baseline'),('010_application_tracker.sql','baseline'),
 ('011_entitlements.sql','326f6a30cf5badd0b05ac9329fec33c38cc0932eda1973a7c4831dc4ca9dd069'),
 ('014_admin_tools.sql','3ef280dc18b9d0a75d98767e10c1bf5c67d09fbcf77763e4c9d134ed479773e6'),
 ('015_vault_secret_accessor.sql','47c7b0a93d9a42e31b78742f1cb4ae2125dd00550ca335bdf392aed82f72ffdb'),
 ('016_signin_after_expiry.sql','5b856d5895de7bacd1d415c18d25a5ec3d7cb686d106eb26d220d1d196b6c4a9')
ON CONFLICT DO NOTHING;
COMMIT;
