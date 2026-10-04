-- Rehearsal for 027 and 028 on a local copy (after 001-028). Rolls back.
BEGIN;
INSERT INTO public.users_profile (id, email, subscription_tier, status, password_hash) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a@t.in', 'trial', 'active', 'x'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@t.in', 'pro', 'active', 'x');
INSERT INTO public.user_sessions (user_id, session_token, device_fingerprint, is_active, current_ip) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', TRUE, '127.0.0.1'),
  ('00000000-0000-0000-0000-0000000000b2', 'tok-b', 'fp-b', TRUE, '127.0.0.1');
-- 027: state documents
SELECT 'save roadmap', ok, error FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap', '{"id":"r1"}', NOW() - INTERVAL '2 hours');
SELECT 'older write is stale', ok, error FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap', '{"id":"old"}', NOW() - INTERVAL '3 hours');
SELECT 'newer write wins', ok FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap', '{"id":"r2"}', NOW() - INTERVAL '1 hour');
SELECT 'bad kind', ok, error FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'secrets', '{}', NOW());
SELECT 'wrong token', ok, error FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'bad', 'fp-a', 'notes', '{}', NOW());
SELECT 'pull', kind, value->>'id' FROM public.learning_pull_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a');
SELECT 'other user sees nothing', count(*) FROM public.learning_pull_state('00000000-0000-0000-0000-0000000000a1', 'tok-b', 'fp-b');
SELECT 'v2 events accepted', accepted, rejected FROM public.learning_record_events('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a',
  (SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'type', 'task_done', 'item_id', 't' || g, 'created_at', NOW())) FROM generate_series(1, 15) g));
SELECT 'free cap still 10 quiz attempts', accepted, rejected FROM public.learning_record_events('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a',
  (SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'type', 'quiz_passed', 'item_id', 'q' || g, 'created_at', NOW())) FROM generate_series(1, 12) g));
SELECT 'bogus type rejected', accepted, rejected FROM public.learning_record_events('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a',
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'hacked', 'created_at', NOW())));
SELECT 'export has learn_state', jsonb_array_length(data->'learn_state') FROM public.account_export_data('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a');
-- 028: AI roadmap quotas
SELECT 'limits free', * FROM public.ai_limits('free');
SELECT 'plan 1', ok, error, daily_limit, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_plan');
SELECT 'plan 2', ok, error, daily_limit, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_plan');
SELECT 'plan 3 refused', ok, error, daily_limit, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_plan');
SELECT 'refund', public.refund_ai_quota('00000000-0000-0000-0000-0000000000a1', 'roadmap_plan');
SELECT 'adjust separate metric', ok, daily_limit, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_adjust');
SELECT 'pro limit', ok, daily_limit FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000b2', 'tok-b', 'fp-b', 'roadmap_plan');
SELECT 'free feedback still refused', ok, error FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'rubric_feedback');
SELECT 'form answers still work', ok, daily_limit FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'form_answers');
SET ROLE anon;
SELECT 'anon can save state', ok FROM public.learning_save_state('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'notes', '[]', NOW());
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN PERFORM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_plan'); RAISE NOTICE 'BAD: anon called consume_ai_quota';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: anon cannot call consume_ai_quota'; END $$;
DO $$ BEGIN PERFORM 1 FROM public.user_learn_state; RAISE NOTICE 'BAD: anon read user_learn_state';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: anon cannot read user_learn_state'; END $$;
RESET ROLE;
DELETE FROM public.users_profile WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT 'state deleted with the account', count(*) FROM public.user_learn_state WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;
