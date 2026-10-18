-- 037: first-month coupons. Paste file of migrations/037_billing_coupons.sql (comments and blank lines removed).
CREATE TABLE IF NOT EXISTS public.billing_coupons (
  code_hash       TEXT PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  price_inr       NUMERIC NOT NULL CHECK (price_inr >= 1),
  plans           TEXT[] NOT NULL DEFAULT ARRAY['pro', 'max'] CHECK (plans <@ ARRAY['pro', 'max'] AND cardinality(plans) > 0),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  valid_until     TIMESTAMPTZ,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.billing_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_coupons FROM anon, authenticated;
ALTER TABLE public.upi_orders ADD COLUMN IF NOT EXISTS coupon_hash TEXT REFERENCES public.billing_coupons(code_hash);
ALTER TABLE public.upi_orders ADD COLUMN IF NOT EXISTS list_price_inr NUMERIC;
CREATE INDEX IF NOT EXISTS idx_upi_orders_coupon ON public.upi_orders (coupon_hash, status) WHERE coupon_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.billing_coupon_problem(p_user_id UUID, p_coupon_hash TEXT, p_plan TEXT, p_order_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c public.billing_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.billing_coupons WHERE code_hash = p_coupon_hash;
  IF NOT FOUND OR NOT c.enabled OR (c.valid_until IS NOT NULL AND c.valid_until < NOW()) OR NOT (p_plan = ANY (c.plans)) THEN
    RETURN 'invalid_coupon';
  END IF;
  IF c.max_redemptions IS NOT NULL AND (
       SELECT count(*) FROM public.upi_orders
       WHERE coupon_hash = c.code_hash AND status IN ('submitted', 'approved')
         AND (p_order_id IS NULL OR id <> p_order_id)) >= c.max_redemptions THEN
    RETURN 'invalid_coupon';
  END IF;
  IF EXISTS (SELECT 1 FROM public.upi_orders
             WHERE user_id = p_user_id AND coupon_hash IS NOT NULL AND status IN ('submitted', 'approved')
               AND (p_order_id IS NULL OR id <> p_order_id)) THEN
    RETURN 'coupon_used';
  END IF;
  IF public.billing_effective_plan(p_user_id) <> 'free'
     OR EXISTS (SELECT 1 FROM public.razorpay_payments WHERE user_id = p_user_id AND status = 'captured') THEN
    RETURN 'coupon_not_eligible';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_coupon_problem(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.billing_upi_create_order(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.billing_upi_create_order(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_plan TEXT, p_coupon TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c_upi_price_pro CONSTANT NUMERIC := 249;
  c_upi_price_max CONSTANT NUMERIC := 599;
  s public.upi_settings%ROWTYPE;
  o public.upi_orders%ROWTYPE;
  v_list NUMERIC;
  v_amount NUMERIC;
  v_coupon TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon, ''), '\s', '', 'g')), '');
  v_hash TEXT;
  v_problem TEXT;
  v_ref TEXT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'unauthorized');
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('pro', 'max') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_plan');
  END IF;
  SELECT * INTO s FROM public.upi_settings WHERE id;
  IF NOT FOUND OR NOT s.enabled OR s.vpa IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_configured');
  END IF;
  v_list := CASE WHEN p_plan = 'max' THEN c_upi_price_max ELSE c_upi_price_pro END;
  v_amount := v_list;
  IF v_coupon IS NOT NULL THEN
    IF length(v_coupon) > 40 THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_coupon'); END IF;
    v_hash := encode(digest(v_coupon, 'sha256'), 'hex');
    v_problem := public.billing_coupon_problem(p_user_id, v_hash, p_plan);
    IF v_problem IS NOT NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_problem); END IF;
    SELECT LEAST(price_inr, v_list) INTO v_amount FROM public.billing_coupons WHERE code_hash = v_hash;
  END IF;
  -- Reuse an unpaid order for the same plan, price and coupon from the last 24 hours, so reopening the dialog keeps the reference.
  SELECT * INTO o FROM public.upi_orders
  WHERE user_id = p_user_id AND plan = p_plan AND status = 'awaiting_payment'
    AND amount_inr = v_amount AND coupon_hash IS NOT DISTINCT FROM v_hash
    AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.upi_orders WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 10 THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'rate_limited');
    END IF;
    LOOP
      v_ref := 'NM' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.upi_orders WHERE reference = v_ref);
    END LOOP;
    INSERT INTO public.upi_orders (user_id, plan, amount_inr, reference, coupon_hash, list_price_inr)
    VALUES (p_user_id, p_plan, v_amount, v_ref, v_hash, CASE WHEN v_hash IS NOT NULL THEN v_list END)
    RETURNING * INTO o;
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'order_id', o.id, 'plan', o.plan, 'amount_inr', o.amount_inr,
    'reference', o.reference, 'vpa', s.vpa, 'payee_name', s.payee_name, 'created_at', o.created_at,
    'coupon_applied', o.coupon_hash IS NOT NULL, 'list_price_inr', o.list_price_inr);
END;
$$;
CREATE OR REPLACE FUNCTION public.billing_upi_submit_utr(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_order_id UUID, p_utr TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_utr TEXT := regexp_replace(COALESCE(p_utr, ''), '\s', '', 'g');
  o public.upi_orders%ROWTYPE;
  v_problem TEXT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'unauthorized');
  END IF;
  IF v_utr !~ '^[0-9]{12}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_utr');
  END IF;
  SELECT * INTO o FROM public.upi_orders WHERE id = p_order_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF o.status <> 'awaiting_payment' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_submitted');
  END IF;
  IF EXISTS (SELECT 1 FROM public.upi_orders WHERE utr = v_utr) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'utr_used');
  END IF;
  IF o.coupon_hash IS NOT NULL THEN
    v_problem := public.billing_coupon_problem(p_user_id, o.coupon_hash, o.plan, o.id);
    IF v_problem IS NOT NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_problem); END IF;
  END IF;
  UPDATE public.upi_orders SET utr = v_utr, status = 'submitted', submitted_at = NOW() WHERE id = o.id;
  RETURN jsonb_build_object('ok', TRUE, 'order_id', o.id, 'status', 'submitted');
END;
$$;
CREATE OR REPLACE FUNCTION public.billing_upi_list_orders(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'unauthorized');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'orders', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('order_id', r.id, 'plan', r.plan, 'amount_inr', r.amount_inr,
             'reference', r.reference, 'utr', r.utr, 'status', r.status, 'created_at', r.created_at,
             'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
             'review_note', CASE WHEN r.status = 'rejected' THEN r.review_note END,
             'coupon_applied', r.coupon_hash IS NOT NULL, 'list_price_inr', r.list_price_inr) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM public.upi_orders WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 20) r
  ), '[]'::jsonb));
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_list_upi_orders(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_status TEXT DEFAULT 'submitted'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('awaiting_payment', 'submitted', 'approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'orders', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('order_id', r.id, 'user_id', r.user_id, 'email', r.email,
             'full_name', r.full_name, 'plan', r.plan, 'amount_inr', r.amount_inr, 'reference', r.reference,
             'utr', r.utr, 'status', r.status, 'created_at', r.created_at, 'submitted_at', r.submitted_at,
             'reviewed_at', r.reviewed_at, 'review_note', r.review_note,
             'coupon_applied', r.coupon_hash IS NOT NULL, 'list_price_inr', r.list_price_inr)
           ORDER BY COALESCE(r.submitted_at, r.created_at) DESC)
    FROM (
      SELECT o.*, u.email, u.full_name FROM public.upi_orders o
      JOIN public.users_profile u ON u.id = o.user_id
      WHERE p_status IS NULL OR o.status = p_status
      ORDER BY COALESCE(o.submitted_at, o.created_at) DESC
      LIMIT 200
    ) r
  ), '[]'::jsonb));
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_review_upi_order(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_order_id UUID, p_decision TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c_period CONSTANT INTERVAL := INTERVAL '30 days';
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  o public.upi_orders%ROWTYPE;
  u public.users_profile%ROWTYPE;
  pay RECORD;
  v_problem TEXT;
  v_tier TEXT;
  v_expires TIMESTAMPTZ;
  v_result TEXT;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_decision');
  END IF;
  SELECT * INTO o FROM public.upi_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF o.user_id = p_user_id THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_change_self'); END IF;
  IF o.status <> 'submitted' THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_submitted'); END IF;
  SELECT * INTO u FROM public.users_profile WHERE id = o.user_id FOR UPDATE;
  IF p_decision = 'approve' AND o.coupon_hash IS NOT NULL THEN
    -- First-month coupon: still eligible (no other coupon used, cap not reached, never paid, on Free)?
    v_problem := public.billing_coupon_problem(o.user_id, o.coupon_hash, o.plan, o.id);
    IF v_problem IS NOT NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_failed', 'detail', v_problem);
    END IF;
    INSERT INTO public.razorpay_payments (user_id, email, plan, amount, payment_id, order_id, status, raw_payload)
    VALUES (o.user_id, LOWER(TRIM(u.email)), CASE WHEN o.plan = 'max' THEN 'turbo' ELSE 'pro' END,
            o.amount_inr::text, 'upi_' || o.utr, o.reference, 'captured',
            jsonb_build_object('method', 'upi', 'upi_order_id', o.id, 'reviewed_by', p_user_id, 'coupon', TRUE,
                               'list_price_inr', o.list_price_inr));
    v_tier := o.plan;
    v_expires := NOW() + c_period;
    UPDATE public.users_profile SET subscription_tier = v_tier, expires_at = v_expires, updated_at = NOW()
    WHERE id = o.user_id;
    INSERT INTO public.billing_records (user_email, amount, plan, status, payment_method)
    VALUES (LOWER(TRIM(u.email)), '₹' || o.amount_inr::text,
            CASE WHEN o.plan = 'max' THEN 'Max (First month offer)' ELSE 'Pro (First month offer)' END, 'paid', 'UPI');
    v_result := 'First-month coupon applied';
  ELSIF p_decision = 'approve' THEN
    SELECT * INTO pay FROM public.handle_razorpay_payment_success(
      o.user_id, u.email, o.plan, o.amount_inr::text, 'upi_' || o.utr, o.reference,
      jsonb_build_object('method', 'upi', 'upi_order_id', o.id, 'reviewed_by', p_user_id));
    IF NOT pay.ok THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_failed', 'detail', pay.reason);
    END IF;
    UPDATE public.billing_records SET payment_method = 'UPI'
    WHERE LOWER(user_email) = LOWER(TRIM(u.email)) AND created_at = NOW() AND payment_method = 'Razorpay';
    v_tier := pay.new_tier;
    v_expires := pay.expires_at;
    v_result := pay.reason;
  END IF;
  UPDATE public.upi_orders
  SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      reviewed_at = NOW(), reviewed_by = p_user_id, review_note = v_reason
  WHERE id = o.id;
  v_audit := public.admin_audit(p_user_id,
    CASE WHEN p_decision = 'approve' THEN 'payment.upi_approved' ELSE 'payment.upi_rejected' END,
    'user', o.user_id::text, u.email, v_reason,
    jsonb_build_object('order', o.reference, 'utr', o.utr, 'plan', o.plan, 'amount_inr', o.amount_inr,
                       'coupon', o.coupon_hash IS NOT NULL, 'tier', u.subscription_tier, 'expires_at', u.expires_at),
    CASE WHEN p_decision = 'approve'
         THEN jsonb_build_object('tier', v_tier, 'expires_at', v_expires, 'result', v_result)
         ELSE jsonb_build_object('status', 'rejected') END);
  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit,
    'status', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    'tier', CASE WHEN p_decision = 'approve' THEN v_tier END,
    'expires_at', CASE WHEN p_decision = 'approve' THEN v_expires END);
END;
$$;
REVOKE ALL ON FUNCTION public.billing_upi_create_order(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_upi_submit_utr(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_upi_list_orders(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_upi_orders(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_upi_order(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_upi_create_order(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upi_submit_utr(UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upi_list_orders(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_upi_orders(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_upi_order(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
