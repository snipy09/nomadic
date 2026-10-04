-- Rehearsal for 024 on a local copy (after the shim, baseline and 012-024). Rolls back.
-- Each case prints: case | tier | days left (rounded to 0.1) | status.
BEGIN;
INSERT INTO public.users_profile (id, email, subscription_tier, status, expires_at, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'max@t.in',   'max',  'active',    NOW() + INTERVAL '20 days', 'x'),
  ('00000000-0000-0000-0000-000000000002', 'pro@t.in',   'pro',  'active',    NOW() + INTERVAL '20 days', 'x'),
  ('00000000-0000-0000-0000-000000000003', 'free@t.in',  'trial', 'active',    NULL,                       'x'),
  ('00000000-0000-0000-0000-000000000004', 'oldmax@t.in','max',  'active',    NOW() - INTERVAL '5 days',  'x'),
  ('00000000-0000-0000-0000-000000000005', 'susp@t.in',  'pro',  'suspended', NOW() + INTERVAL '10 days', 'x'),
  ('00000000-0000-0000-0000-000000000006', 'life@t.in',  'lifetime', 'active', NULL,                       'x'),
  ('00000000-0000-0000-0000-000000000008', 'trial@t.in', 'trial','active',    NOW() + INTERVAL '3 days',  'x'),
  ('00000000-0000-0000-0000-000000000007', 'max2@t.in',  'max',  'active',    NOW() + INTERVAL '10 days', 'x');
SELECT 'max pays pro', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1), r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'max@t.in', 'pro', '249.00', 'pay_1') r;
SELECT 'pro pays max', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1), r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'pro@t.in', 'turbo', '599.00', 'pay_2') r;
SELECT 'free pays pro', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1), r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'free@t.in', 'pro', '249.00', 'pay_3') r;
SELECT 'expired max pays pro', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1), r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'oldmax@t.in', 'pro', '249.00', 'pay_4') r;
SELECT 'suspended pays pro', r.new_tier, (SELECT status FROM public.users_profile WHERE email = 'susp@t.in')
  FROM public.handle_razorpay_payment_success(NULL, 'susp@t.in', 'pro', '249.00', 'pay_5') r;
SELECT 'no-end max pays pro', r.new_tier, r.expires_at IS NULL, r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'life@t.in', 'pro', '249.00', 'pay_6') r;
SELECT 'max renews max', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1), r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'max2@t.in', 'turbo', '599.00', 'pay_7') r;
SELECT 'duplicate', r.ok, r.reason
  FROM public.handle_razorpay_payment_success(NULL, 'max2@t.in', 'turbo', '599.00', 'pay_7') r;
SELECT 'client plan ignored', r.new_tier
  FROM public.handle_razorpay_payment_success(NULL, 'free@t.in', 'turbo', '249.00', 'pay_8') r;
SELECT 'trial pays max', r.new_tier, round(extract(epoch FROM r.expires_at - NOW())/86400, 1)
  FROM public.handle_razorpay_payment_success(NULL, 'trial@t.in', 'turbo', '599.00', 'pay_9') r;
ROLLBACK;
