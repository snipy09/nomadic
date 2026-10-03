-- Rehearsal for 019_email_codes.sql on plain PostgreSQL (local-supabase-shim.sql + baseline + 012/017/018/019).
-- Run with:  psql -v ON_ERROR_STOP=1 -X -q -d <rehearsal db> -f packages/supabase/scripts/rehearse-019.sql
-- Never run it against a real project: it creates and deletes test accounts.
\set QUIET on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION pg_temp.check(p_ok BOOLEAN, p_name TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE(p_ok, FALSE) THEN RAISE EXCEPTION 'FAIL: %', p_name; END IF;
  RETURN 'PASS ' || p_name;
END $$;

-- Fixtures (as the owner) ----------------------------------------------------------------------------------------
DELETE FROM public.users_profile WHERE email IN ('asha.reset@example.com', 'ravi.verify@example.com');
DELETE FROM public.email_code_requests WHERE email LIKE '%@example.com';
SELECT ok FROM public.register_user('asha.reset@example.com', 'oldpass1', 'Asha') \gset
SELECT ok FROM public.register_user('ravi.verify@example.com', 'ravipass1', 'Ravi') \gset
SELECT id AS asha_id FROM public.users_profile WHERE email = 'asha.reset@example.com' \gset
SELECT id AS ravi_id FROM public.users_profile WHERE email = 'ravi.verify@example.com' \gset
INSERT INTO public.user_sessions (user_id, current_ip, device_fingerprint, session_token, is_active)
VALUES (:'asha_id', '1.1.1.1', 'fp-asha', 'tok-asha', TRUE),
       (:'ravi_id', '1.1.1.1', 'fp-ravi', 'tok-ravi', TRUE);
SELECT login_ticket AS asha_ticket FROM public.authenticate_user('asha.reset@example.com', 'oldpass1') \gset
DELETE FROM public.login_attempts WHERE email LIKE '%@example.com';
-- A few failed sign-ins that the reset should clear.
SELECT count(*) FROM public.authenticate_user('asha.reset@example.com', 'wrong-1');
SELECT count(*) FROM public.authenticate_user('asha.reset@example.com', 'wrong-2');

-- Grants -------------------------------------------------------------------------------------------------------
SELECT pg_temp.check(NOT has_function_privilege('anon', 'public.request_email_code(text,text,uuid,text,text)', 'EXECUTE'), 'anon cannot execute request_email_code');
SELECT pg_temp.check(NOT has_function_privilege('authenticated', 'public.request_email_code(text,text,uuid,text,text)', 'EXECUTE'), 'authenticated cannot execute request_email_code');
SELECT pg_temp.check(has_function_privilege('service_role', 'public.request_email_code(text,text,uuid,text,text)', 'EXECUTE'), 'service_role can execute request_email_code');
SELECT pg_temp.check(has_function_privilege('anon', 'public.confirm_password_reset(text,text,text)', 'EXECUTE'), 'anon can execute confirm_password_reset');
SELECT pg_temp.check(has_function_privilege('anon', 'public.confirm_email_verification(uuid,text,text,text)', 'EXECUTE'), 'anon can execute confirm_email_verification');
SELECT pg_temp.check(has_function_privilege('anon', 'public.email_verification_status(uuid,text,text)', 'EXECUTE'), 'anon can execute email_verification_status');
SELECT pg_temp.check(NOT has_function_privilege('anon', 'public.email_session_ok(uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.email_code_matches(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.email_code_ct_equal(text,text)', 'EXECUTE'), 'helpers not executable by anon');
SELECT pg_temp.check(NOT has_table_privilege('anon', 'public.email_codes', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.email_code_requests', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.email_codes', 'SELECT'), 'code tables not readable by anon/authenticated');

SET ROLE anon;
SELECT pg_temp.check(EXISTS (SELECT 1), 'running as anon');
DO $$ BEGIN
  PERFORM public.request_email_code('asha.reset@example.com', 'reset');
  RAISE EXCEPTION 'FAIL: anon called request_email_code';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT 'PASS anon request_email_code -> permission denied';
DO $$ BEGIN
  PERFORM count(*) FROM public.email_codes;
  RAISE EXCEPTION 'FAIL: anon read email_codes';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT 'PASS anon select email_codes -> permission denied';
RESET ROLE;

-- Unknown email is indistinguishable at the RPC boundary the Edge Function maps to one response ----------------
SET ROLE service_role;
SELECT status AS unknown_status, code IS NULL AS unknown_no_code FROM public.request_email_code('nobody.here@example.com', 'reset') \gset
SELECT status AS bad_status FROM public.request_email_code('not-an-email', 'reset') \gset
SELECT status AS r1_status, code AS r1_code FROM public.request_email_code('Asha.Reset@Example.com ', 'reset') \gset
RESET ROLE;
SELECT pg_temp.check(:'unknown_status' = 'skip' AND :'unknown_no_code', 'unknown email -> skip, no code');
SELECT pg_temp.check(:'bad_status' = 'invalid', 'malformed email -> invalid');
SELECT pg_temp.check(:'r1_status' = 'send' AND :'r1_code' ~ '^[0-9]{6}$', 'known email -> send with a 6-digit code');
SELECT pg_temp.check((SELECT bool_and(code_hash ~ '^[0-9a-f]{32}\$[0-9a-f]{64}$') FROM public.email_codes WHERE user_id = :'asha_id'), 'code stored only as salt$sha256');
SELECT pg_temp.check((SELECT count(*) FROM public.email_code_requests WHERE email = 'nobody.here@example.com') = 1, 'unknown email request recorded for the rate limit');

-- Wrong code x5 locks the code; even the right code then fails ---------------------------------------------------
SET ROLE anon;
SELECT reason AS short_pw FROM public.confirm_password_reset('asha.reset@example.com', :'r1_code', '123') \gset
SELECT reason AS wrong1 FROM public.confirm_password_reset('asha.reset@example.com', CASE WHEN :'r1_code' = '000000' THEN '000001' ELSE '000000' END, 'newpass123') \gset
SELECT reason AS unknown_reason, ok AS unknown_ok FROM public.confirm_password_reset('nobody.here@example.com', '123456', 'newpass123') \gset
RESET ROLE;
SELECT pg_temp.check(:'short_pw' = 'Password must be at least 6 characters.', 'short password refused before the code is checked');
SELECT pg_temp.check((SELECT attempts FROM public.email_codes WHERE user_id = :'asha_id' AND used_at IS NULL) = 1, 'short password did not burn an attempt; wrong code did');
SELECT pg_temp.check(:'unknown_reason' = :'wrong1' AND NOT :'unknown_ok', 'unknown email and wrong code give the same message');
SET ROLE anon;
SELECT count(*) FROM public.confirm_password_reset('asha.reset@example.com', CASE WHEN :'r1_code' = '000000' THEN '000001' ELSE '000000' END, 'newpass123');
SELECT count(*) FROM public.confirm_password_reset('asha.reset@example.com', CASE WHEN :'r1_code' = '000000' THEN '000001' ELSE '000000' END, 'newpass123');
SELECT count(*) FROM public.confirm_password_reset('asha.reset@example.com', CASE WHEN :'r1_code' = '000000' THEN '000001' ELSE '000000' END, 'newpass123');
SELECT count(*) FROM public.confirm_password_reset('asha.reset@example.com', CASE WHEN :'r1_code' = '000000' THEN '000001' ELSE '000000' END, 'newpass123');
SELECT ok AS locked_ok, reason AS locked_reason FROM public.confirm_password_reset('asha.reset@example.com', :'r1_code', 'newpass123') \gset
RESET ROLE;
SELECT pg_temp.check(NOT :'locked_ok' AND :'locked_reason' = :'wrong1', 'after 5 wrong codes the right code is refused (generic message)');
SELECT pg_temp.check((SELECT ok FROM public.authenticate_user('asha.reset@example.com', 'oldpass1')), 'password unchanged after the lock');
DELETE FROM public.login_attempts WHERE email = 'asha.reset@example.com' AND succeeded;

-- Expired code fails ---------------------------------------------------------------------------------------------
SET ROLE service_role;
SELECT status AS r2_status, code AS r2_code FROM public.request_email_code('asha.reset@example.com', 'reset') \gset
RESET ROLE;
SELECT pg_temp.check(:'r2_status' = 'send', 'second request sends');
UPDATE public.email_codes SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = :'asha_id' AND used_at IS NULL;
SET ROLE anon;
SELECT ok AS expired_ok, reason AS expired_reason FROM public.confirm_password_reset('asha.reset@example.com', :'r2_code', 'newpass123') \gset
RESET ROLE;
SELECT pg_temp.check(NOT :'expired_ok' AND :'expired_reason' = :'wrong1', 'expired code refused (generic message)');

-- Rate limit: third request in the hour sends; the fourth is skipped (looks identical to the caller) ---------------
SET ROLE service_role;
SELECT status AS r3_status, code AS r3_code FROM public.request_email_code('asha.reset@example.com', 'reset') \gset
SELECT status AS r4_status, code IS NULL AS r4_no_code FROM public.request_email_code('asha.reset@example.com', 'reset') \gset
SELECT status AS u2 FROM public.request_email_code('nobody.here@example.com', 'reset') \gset
RESET ROLE;
SELECT pg_temp.check(:'r3_status' = 'send', 'third request in the hour sends');
SELECT pg_temp.check(:'r4_status' = 'skip' AND :'r4_no_code', 'fourth request in the hour -> skip (same as unknown email)');
SELECT pg_temp.check((SELECT count(*) FROM public.email_codes WHERE user_id = :'asha_id' AND used_at IS NULL) = 1, 'only the newest code is outstanding');

-- Successful reset ---------------------------------------------------------------------------------------------
SELECT pg_temp.check((SELECT count(*) FROM public.user_sessions WHERE user_id = :'asha_id' AND is_active) = 1, 'asha has an active session before the reset');
SELECT pg_temp.check((SELECT count(*) FROM public.login_attempts WHERE email = 'asha.reset@example.com' AND NOT succeeded) > 0, 'failed sign-ins recorded before the reset');
SET ROLE anon;
SELECT ok AS reset_ok FROM public.confirm_password_reset('ASHA.reset@example.com', :'r3_code', 'brandnew99') \gset
SELECT is_valid AS hb_valid FROM public.verify_and_update_session(:'asha_id', 'tok-asha', '1.1.1.1', 'fp-asha') \gset
SELECT ok AS reg_ok FROM public.register_device_session(:'asha_id', 'tok-new', 'fp-x', 'X', '1.1.1.1', FALSE, :'asha_ticket') \gset
SELECT ok AS reuse_ok, reason AS reuse_reason FROM public.confirm_password_reset('asha.reset@example.com', :'r3_code', 'another99') \gset
SELECT ok AS old_ok FROM public.authenticate_user('asha.reset@example.com', 'oldpass1') \gset
SELECT ok AS new_ok FROM public.authenticate_user('asha.reset@example.com', 'brandnew99') \gset
RESET ROLE;
SELECT pg_temp.check(:'reset_ok', 'reset with the right code succeeds');
SELECT pg_temp.check((SELECT count(*) FROM public.user_sessions WHERE user_id = :'asha_id' AND is_active) = 0, 'all sessions revoked after reset');
SELECT pg_temp.check(NOT :'hb_valid', 'heartbeat on the old session is refused');
SELECT pg_temp.check(NOT :'reg_ok', 'login ticket issued before the reset no longer registers a device');
SELECT pg_temp.check(NOT :'reuse_ok' AND :'reuse_reason' = :'wrong1', 'used code refused (generic message)');
SELECT pg_temp.check(NOT :'old_ok', 'old password no longer works');
SELECT pg_temp.check(:'new_ok', 'new password works');
SELECT pg_temp.check((SELECT password_hash LIKE '$2%' FROM public.users_profile WHERE id = :'asha_id'), 'stored as bcrypt');
SELECT pg_temp.check((SELECT email_verified_at IS NOT NULL FROM public.users_profile WHERE id = :'asha_id'), 'reset marks the email verified');
-- Same pre-hash path as the desktop: sha256(email:password) is accepted too.
SELECT pg_temp.check((SELECT ok FROM public.authenticate_user('asha.reset@example.com',
  encode(extensions.digest('asha.reset@example.com:brandnew99', 'sha256'), 'hex'))), 'client pre-hash of the new password works');

-- Email verification ---------------------------------------------------------------------------------------------
SET ROLE anon;
SELECT ok AS st_bad FROM public.email_verification_status(:'ravi_id', 'tok-wrong', 'fp-ravi') \gset
SELECT ok AS st_ok, verified_at IS NULL AS st_unverified FROM public.email_verification_status(:'ravi_id', 'tok-ravi', 'fp-ravi') \gset
RESET ROLE;
SELECT pg_temp.check(NOT :'st_bad', 'status refuses a bad session');
SELECT pg_temp.check(:'st_ok' AND :'st_unverified', 'status reports unverified');
SET ROLE service_role;
SELECT status AS v_unauth FROM public.request_email_code(NULL, 'verify', :'ravi_id', 'tok-wrong', 'fp-ravi') \gset
SELECT status AS v_wrongdev FROM public.request_email_code(NULL, 'verify', :'ravi_id', 'tok-ravi', 'fp-other') \gset
SELECT status AS v1_status, code AS v1_code, email AS v1_email FROM public.request_email_code('attacker@example.com', 'verify', :'ravi_id', 'tok-ravi', 'fp-ravi') \gset
RESET ROLE;
SELECT pg_temp.check(:'v_unauth' = 'unauthorized' AND :'v_wrongdev' = 'unauthorized', 'verify request needs a valid session on the same device');
SELECT pg_temp.check(:'v1_status' = 'send' AND :'v1_email' = 'ravi.verify@example.com', 'verify code goes to the account email, not the requested one');
SET ROLE anon;
SELECT ok AS cv_bad_session FROM public.confirm_email_verification(:'ravi_id', 'tok-wrong', 'fp-ravi', :'v1_code') \gset
SELECT ok AS cv_wrong FROM public.confirm_email_verification(:'ravi_id', 'tok-ravi', 'fp-ravi', CASE WHEN :'v1_code' = '000000' THEN '000001' ELSE '000000' END) \gset
SELECT ok AS cv_reset_code FROM public.confirm_password_reset('ravi.verify@example.com', :'v1_code', 'hijack123') \gset
SELECT ok AS cv_ok, reason AS cv_reason FROM public.confirm_email_verification(:'ravi_id', 'tok-ravi', 'fp-ravi', :'v1_code') \gset
SELECT ok AS st2_ok, verified_at IS NOT NULL AS st2_verified FROM public.email_verification_status(:'ravi_id', 'tok-ravi', 'fp-ravi') \gset
SELECT reason AS cv_again FROM public.confirm_email_verification(:'ravi_id', 'tok-ravi', 'fp-ravi', '123456') \gset
RESET ROLE;
SELECT pg_temp.check(NOT :'cv_bad_session', 'confirm verification refuses a bad session');
SELECT pg_temp.check(NOT :'cv_wrong', 'confirm verification refuses a wrong code');
SELECT pg_temp.check(NOT :'cv_reset_code', 'a verify code cannot reset the password');
SELECT pg_temp.check(:'cv_ok' AND :'cv_reason' = 'ok', 'confirm verification succeeds');
SELECT pg_temp.check(:'st2_ok' AND :'st2_verified', 'status reports verified');
SELECT pg_temp.check(:'cv_again' = 'already_verified', 'second confirm is a no-op');
SET ROLE service_role;
SELECT status AS v_again FROM public.request_email_code(NULL, 'verify', :'ravi_id', 'tok-ravi', 'fp-ravi') \gset
RESET ROLE;
SELECT pg_temp.check(:'v_again' = 'already_verified', 'no code is sent to a verified account');

-- Clean up ------------------------------------------------------------------------------------------------------
DELETE FROM public.users_profile WHERE email IN ('asha.reset@example.com', 'ravi.verify@example.com');
DELETE FROM public.email_code_requests WHERE email LIKE '%@example.com';
DELETE FROM public.login_attempts WHERE email LIKE '%@example.com';
DELETE FROM public.signup_attempts WHERE email LIKE '%@example.com';
SELECT 'ALL 019 CHECKS PASSED';
