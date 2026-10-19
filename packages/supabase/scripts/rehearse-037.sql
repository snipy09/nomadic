-- Rehearsal for 037 on a local copy (after 001-037). Rolls back. Uses a made-up code, never a real one.
BEGIN;
UPDATE public.upi_settings SET vpa = 'shop@okbank', payee_name = 'Nomadic', enabled = TRUE;
INSERT INTO public.billing_coupons (code_hash, price_inr, plans, max_redemptions)
VALUES (encode(extensions.digest(upper('testcode'), 'sha256'), 'hex'), 1, ARRAY['pro', 'max'], 2);
INSERT INTO public.users_profile (id, email, full_name, role, status, subscription_tier)
VALUES ('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'Admin', 'admin', 'active', 'max'),
       ('00000000-0000-0000-0000-000000000001', 'one@example.com', 'One', 'user', 'active', 'trial'),
       ('00000000-0000-0000-0000-000000000002', 'two@example.com', 'Two', 'user', 'active', 'trial'),
       ('00000000-0000-0000-0000-000000000003', 'three@example.com', 'Three', 'user', 'active', 'trial');
INSERT INTO public.user_sessions (user_id, current_ip, session_token, device_fingerprint, is_active)
VALUES ('00000000-0000-0000-0000-00000000000a', '127.0.0.1', 'toka', 'fpa', TRUE),
       ('00000000-0000-0000-0000-000000000001', '127.0.0.1', 'tok1', 'fp1', TRUE),
       ('00000000-0000-0000-0000-000000000002', '127.0.0.1', 'tok2', 'fp2', TRUE),
       ('00000000-0000-0000-0000-000000000003', '127.0.0.1', 'tok3', 'fp3', TRUE);
SET LOCAL ROLE anon;
SELECT 'wrong code', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'pro', 'nope')->>'error';
SELECT 'old 4-arg call still works', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'pro')->>'amount_inr';
SELECT public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'pro', ' test code ') AS r \gset
SELECT 'coupon pro (lower case, spaces)', (:'r'::jsonb) - 'vpa' - 'order_id' - 'reference' - 'created_at';
SELECT 'reopen keeps the order', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'pro', 'TESTCODE')->>'order_id' = (:'r'::jsonb)->>'order_id';
SELECT 'submit', public.billing_upi_submit_utr('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1',
  ((:'r'::jsonb)->>'order_id')::uuid, '111111111111')->>'status';
SELECT 'same user again', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'max', 'TESTCODE')->>'error';
SELECT 'admin sees coupon', o->>'amount_inr', o->>'coupon_applied', o->>'list_price_inr'
FROM jsonb_array_elements(public.admin_list_upi_orders('00000000-0000-0000-0000-00000000000a', 'toka', 'fpa', 'submitted')->'orders') o;
SELECT 'approve', public.admin_review_upi_order('00000000-0000-0000-0000-00000000000a', 'toka', 'fpa',
  ((:'r'::jsonb)->>'order_id')::uuid, 'approve', 'UTR matched') - 'audit_id' - 'expires_at';
SELECT 'paid user cannot use coupon', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'max', 'TESTCODE')->>'error';
SELECT 'renewal is full price', public.billing_upi_create_order('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1', 'pro')->>'amount_inr';
SELECT 'history', amount_inr, plan FROM public.billing_list_payments('00000000-0000-0000-0000-000000000001', 'tok1', 'fp1');
SELECT public.billing_upi_create_order('00000000-0000-0000-0000-000000000002', 'tok2', 'fp2', 'max', 'testcode') AS r2 \gset
SELECT 'user two max', (:'r2'::jsonb)->>'amount_inr', (:'r2'::jsonb)->>'list_price_inr';
SELECT 'user two submit', public.billing_upi_submit_utr('00000000-0000-0000-0000-000000000002', 'tok2', 'fp2',
  ((:'r2'::jsonb)->>'order_id')::uuid, '222222222222')->>'status';
SELECT 'cap of 2 reached', public.billing_upi_create_order('00000000-0000-0000-0000-000000000003', 'tok3', 'fp3', 'pro', 'testcode')->>'error';
SAVEPOINT s1;
SELECT 'anon cannot read coupons';
SELECT count(*) FROM public.billing_coupons;
ROLLBACK TO SAVEPOINT s1;
RESET ROLE;
SELECT 'profile', email, subscription_tier, expires_at > NOW() + INTERVAL '29 days' AND expires_at < NOW() + INTERVAL '31 days' AS thirty_days
FROM public.users_profile WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT 'billing record', amount, plan, payment_method FROM public.billing_records WHERE user_email = 'one@example.com';
ROLLBACK;
