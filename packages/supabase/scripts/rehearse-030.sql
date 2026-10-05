-- Rehearsal for 030 on a local copy (after 001-030). Rolls back.
BEGIN;
INSERT INTO public.users_profile (id, email, subscription_tier, status, password_hash) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a@t.in', 'trial', 'active', 'x'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@t.in', 'pro', 'active', 'x');
INSERT INTO public.user_sessions (user_id, session_token, device_fingerprint, is_active, current_ip) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', TRUE, '127.0.0.1'),
  ('00000000-0000-0000-0000-0000000000b2', 'tok-b', 'fp-b', TRUE, '127.0.0.1');
SELECT 'limits', p, (SELECT ai_project_help_per_day FROM public.ai_project_help_limits(p)) FROM unnest(ARRAY['free', 'pro', 'max']) p;
SELECT 'free help 1', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'free help 2', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'free help 3', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'free help 4', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'free help 5', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'free help 6', ok, error, daily_limit, used, remaining, resets_at > NOW() AS resets_later FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'refund', public.refund_ai_quota('00000000-0000-0000-0000-0000000000a1', 'project_help');
SELECT 'after refund', ok, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'project_help');
SELECT 'separate from roadmap', ok, used FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'roadmap_plan');
SELECT 'pro limit', ok, daily_limit FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000b2', 'tok-b', 'fp-b', 'project_help');
SELECT 'outreach still works', ok, daily_limit FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000b2', 'tok-b', 'fp-b', 'outreach_email');
SELECT 'bad session', ok, error FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'nope', 'fp-a', 'project_help');
SELECT 'unknown kind', ok, error FROM public.consume_ai_quota('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', 'chat');
SELECT 'anon cannot call', has_function_privilege('anon', 'public.consume_ai_quota(uuid, text, text, text)', 'EXECUTE'),
  has_function_privilege('anon', 'public.ai_project_help_limits(text)', 'EXECUTE');
ROLLBACK;
