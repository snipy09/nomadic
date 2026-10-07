-- 032: One desktop and one phone per account (Android app, docs/MOBILE_APP.md).
--
-- Until now an account had one active device: signing in on a phone would end the desktop session.
-- Devices now come in two classes, decided by the fingerprint the app sends: the Android app sends
-- 'mobile-<id>', everything else is 'desktop'. The single-device rule applies within a class, so an
-- account can be active on one computer and one phone at the same time; a second computer (or a second
-- phone) still conflicts and can take over only with force_takeover, as before.
--
-- register_device_session      same signature and checks as 008; conflicts and takeovers are per class.
-- verify_and_update_session    same signature and checks as 003; another device ends this session only when
--                              it is of the same class.
-- device_class(text)           internal helper (no client grant). Idempotent.
CREATE OR REPLACE FUNCTION public.device_class(p_device_fingerprint TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_device_fingerprint LIKE 'mobile-%' THEN 'mobile' ELSE 'desktop' END;
$$;
REVOKE ALL ON FUNCTION public.device_class(TEXT) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.register_device_session(
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
  v_class TEXT := public.device_class(p_device_fingerprint);
BEGIN
  SELECT require_login_ticket INTO v_strict FROM public.app_security WHERE id;
  IF p_login_ticket IS NOT NULL THEN
    UPDATE public.login_tickets lt SET used_at = NOW()
    WHERE lt.ticket_hash = encode(digest(p_login_ticket, 'sha256'), 'hex')
      AND lt.user_id = p_user_id AND lt.used_at IS NULL AND lt.expires_at > NOW();
    v_authorized := FOUND;
  ELSIF NOT COALESCE(v_strict, FALSE) THEN
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
    AND public.device_class(s.device_fingerprint) = v_class
    AND s.last_heartbeat > (NOW() - INTERVAL '2 minutes')
  ORDER BY s.last_heartbeat DESC LIMIT 1;
  IF FOUND THEN
    IF NOT p_force_takeover THEN
      RETURN QUERY SELECT FALSE, TRUE, COALESCE(v_active_rec.device_name, CASE WHEN v_class = 'mobile' THEN 'Another phone' ELSE 'Another Laptop' END),
        'Account is currently active on another device (' || COALESCE(v_active_rec.device_name, CASE WHEN v_class = 'mobile' THEN 'Another phone' ELSE 'Another Laptop' END) || '). '
        || CASE WHEN v_class = 'mobile' THEN 'Only 1 phone is allowed per account.' ELSE 'Only 1 laptop is allowed per account.' END;
      RETURN;
    END IF;
    UPDATE public.user_sessions s SET is_active = FALSE
    WHERE s.user_id = p_user_id AND s.device_fingerprint <> p_device_fingerprint
      AND public.device_class(s.device_fingerprint) = v_class;
  END IF;
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
REVOKE ALL ON FUNCTION public.register_device_session(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_session(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.verify_and_update_session(
  p_user_id UUID,
  p_session_token TEXT,
  p_client_ip TEXT,
  p_device_fingerprint TEXT
)
RETURNS TABLE (is_valid BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session RECORD;
  v_conflict_device TEXT;
BEGIN
  SELECT * INTO v_session FROM public.user_sessions
  WHERE session_token = p_session_token AND user_id = p_user_id LIMIT 1;
  IF NOT FOUND OR v_session.is_active = FALSE THEN
    RETURN QUERY SELECT FALSE, 'Session terminated or invalidated by another device login.';
    RETURN;
  END IF;
  IF v_session.device_fingerprint <> p_device_fingerprint THEN
    RETURN QUERY SELECT FALSE, 'Device fingerprint mismatch. Single-device lock active.';
    RETURN;
  END IF;
  SELECT device_name INTO v_conflict_device FROM public.user_sessions
  WHERE user_id = p_user_id AND is_active = TRUE AND device_fingerprint <> p_device_fingerprint
    AND public.device_class(device_fingerprint) = public.device_class(p_device_fingerprint)
    AND last_heartbeat > (NOW() - INTERVAL '2 minutes')
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.user_sessions SET is_active = FALSE WHERE session_token = p_session_token;
    RETURN QUERY SELECT FALSE, 'This account is now in use on another '
      || CASE WHEN public.device_class(p_device_fingerprint) = 'mobile' THEN 'phone' ELSE 'laptop' END
      || ' (' || COALESCE(v_conflict_device, 'Another device') || '). Terminating session.';
    RETURN;
  END IF;
  UPDATE public.user_sessions SET last_heartbeat = NOW(), current_ip = p_client_ip, is_active = TRUE
  WHERE session_token = p_session_token;
  RETURN QUERY SELECT TRUE, 'Session validated';
END;
$$;
REVOKE ALL ON FUNCTION public.verify_and_update_session(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_and_update_session(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
