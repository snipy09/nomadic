-- Rehearsal for 025 on a local copy (after 001-025). Rolls back.
BEGIN;
INSERT INTO public.users_profile (id, email, subscription_tier, status, password_hash) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a@t.in', 'pro', 'active', 'x'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@t.in', 'pro', 'active', 'x');
INSERT INTO public.user_sessions (user_id, session_token, device_fingerprint, is_active, current_ip)
  VALUES ('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a', TRUE, '127.0.0.1');
INSERT INTO public.razorpay_payments (user_id, email, plan, amount, payment_id, status, created_at, raw_payload) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a@t.in', 'pro',   '249.00', 'pay_a1', 'captured', NOW() - INTERVAL '40 days', '{"secret":1}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@t.in', 'turbo', '599.00', 'pay_a2', 'captured', NOW(), '{}'),
  (NULL,                                   'A@t.in', 'pro',   '249.00', 'pay_a0', 'captured', NOW() - INTERVAL '90 days', '{}'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@t.in', 'pro',   '249.00', 'pay_b1', 'captured', NOW(), '{}');
SELECT 'own', string_agg(payment_id || ':' || plan || ':' || amount_inr, ',' ORDER BY paid_at DESC)
  FROM public.billing_list_payments('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a');
SELECT 'wrong token', ok, error FROM public.billing_list_payments('00000000-0000-0000-0000-0000000000a1', 'bad', 'fp-a');
SELECT 'other user with a stolen id', ok FROM public.billing_list_payments('00000000-0000-0000-0000-0000000000b2', 'tok-a', 'fp-a');
SET ROLE anon;
SELECT 'anon can call', count(*) FROM public.billing_list_payments('00000000-0000-0000-0000-0000000000a1', 'tok-a', 'fp-a');
RESET ROLE;
ROLLBACK;
