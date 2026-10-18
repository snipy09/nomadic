-- 035: UPI direct payments, reviewed by an admin.
--
-- No payment gateway: the user pays the plan price to the operator's own UPI ID from any UPI app
-- (intent link or QR in the upgrade dialog), with the order reference in the note, then enters the
-- 12-digit UTR (UPI transaction reference) shown by their app. An admin checks the UTR against the bank
-- statement and approves or rejects it. Approval runs the same plan logic as a Razorpay payment (024),
-- so the payment shows in Settings → Payments (025) and plan changes keep the value already paid for.
--
-- upi_settings             one row, set by the operator in the SQL editor (never in the app or repo):
--                            UPDATE public.upi_settings SET vpa = '<merchant UPI ID>', payee_name = 'Nomadic', enabled = TRUE;
-- upi_orders               one row per payment attempt; RLS on, no client policies.
-- billing_upi_create_order anon, session-checked: open (or reuse) an order for Pro or Max; returns the UPI ID,
--                          payee, exact amount and reference. 'not_configured' while no UPI ID is enabled.
-- billing_upi_submit_utr   anon, session-checked: attach the UTR to the caller's own open order.
-- billing_upi_list_orders  anon, session-checked: the caller's recent orders and their status.
-- admin_list_upi_orders    admin (014 check): orders by status, newest first.
-- admin_review_upi_order   admin: approve (activates the plan) or reject, with a reason; audit-logged.
-- Prices are kept equal to packages/config/src/plans.ts by entitlements-parity.test.ts.

CREATE TABLE IF NOT EXISTS public.upi_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  vpa        TEXT CHECK (vpa IS NULL OR vpa ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  payee_name TEXT NOT NULL DEFAULT 'Nomadic' CHECK (length(payee_name) BETWEEN 1 AND 100),
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.upi_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.upi_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upi_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.upi_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL CHECK (plan IN ('pro', 'max')),
  amount_inr  NUMERIC NOT NULL CHECK (amount_inr > 0),
  reference   TEXT NOT NULL UNIQUE,
  utr         TEXT UNIQUE CHECK (utr IS NULL OR utr ~ '^[0-9]{12}$'),
  status      TEXT NOT NULL DEFAULT 'awaiting_payment'
              CHECK (status IN ('awaiting_payment', 'submitted', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_upi_orders_user ON public.upi_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upi_orders_status ON public.upi_orders (status, created_at DESC);
ALTER TABLE public.upi_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upi_orders FROM anon, authenticated;

-- Client RPCs --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_upi_create_order(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_plan TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c_upi_price_pro CONSTANT NUMERIC := 249;
  c_upi_price_max CONSTANT NUMERIC := 599;
  s public.upi_settings%ROWTYPE;
  o public.upi_orders%ROWTYPE;
  v_amount NUMERIC;
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
  v_amount := CASE WHEN p_plan = 'max' THEN c_upi_price_max ELSE c_upi_price_pro END;

  -- Reuse an unpaid order for the same plan from the last 24 hours, so reopening the dialog keeps the reference.
  SELECT * INTO o FROM public.upi_orders
  WHERE user_id = p_user_id AND plan = p_plan AND status = 'awaiting_payment'
    AND amount_inr = v_amount AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.upi_orders WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '24 hours') >= 10 THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'rate_limited');
    END IF;
    LOOP
      v_ref := 'NM' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.upi_orders WHERE reference = v_ref);
    END LOOP;
    INSERT INTO public.upi_orders (user_id, plan, amount_inr, reference)
    VALUES (p_user_id, p_plan, v_amount, v_ref)
    RETURNING * INTO o;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'order_id', o.id, 'plan', o.plan, 'amount_inr', o.amount_inr,
    'reference', o.reference, 'vpa', s.vpa, 'payee_name', s.payee_name, 'created_at', o.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_upi_submit_utr(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_order_id UUID, p_utr TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_utr TEXT := regexp_replace(COALESCE(p_utr, ''), '\s', '', 'g');
  o public.upi_orders%ROWTYPE;
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
             'review_note', CASE WHEN r.status = 'rejected' THEN r.review_note END) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM public.upi_orders WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 20) r
  ), '[]'::jsonb));
END;
$$;

-- Admin RPCs ---------------------------------------------------------------------
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
             'reviewed_at', r.reviewed_at, 'review_note', r.review_note)
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
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  o public.upi_orders%ROWTYPE;
  u public.users_profile%ROWTYPE;
  pay RECORD;
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
  SELECT * INTO u FROM public.users_profile WHERE id = o.user_id;

  IF p_decision = 'approve' THEN
    SELECT * INTO pay FROM public.handle_razorpay_payment_success(
      o.user_id, u.email, o.plan, o.amount_inr::text, 'upi_' || o.utr, o.reference,
      jsonb_build_object('method', 'upi', 'upi_order_id', o.id, 'reviewed_by', p_user_id));
    IF NOT pay.ok THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_failed', 'detail', pay.reason);
    END IF;
    UPDATE public.billing_records SET payment_method = 'UPI'
    WHERE LOWER(user_email) = LOWER(TRIM(u.email)) AND created_at = NOW() AND payment_method = 'Razorpay';
  END IF;

  UPDATE public.upi_orders
  SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      reviewed_at = NOW(), reviewed_by = p_user_id, review_note = v_reason
  WHERE id = o.id;

  v_audit := public.admin_audit(p_user_id,
    CASE WHEN p_decision = 'approve' THEN 'payment.upi_approved' ELSE 'payment.upi_rejected' END,
    'user', o.user_id::text, u.email, v_reason,
    jsonb_build_object('order', o.reference, 'utr', o.utr, 'plan', o.plan, 'amount_inr', o.amount_inr,
                       'tier', u.subscription_tier, 'expires_at', u.expires_at),
    CASE WHEN p_decision = 'approve'
         THEN jsonb_build_object('tier', pay.new_tier, 'expires_at', pay.expires_at, 'result', pay.reason)
         ELSE jsonb_build_object('status', 'rejected') END);

  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit,
    'status', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    'tier', CASE WHEN p_decision = 'approve' THEN pay.new_tier END,
    'expires_at', CASE WHEN p_decision = 'approve' THEN pay.expires_at END);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_upi_create_order(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_upi_submit_utr(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_upi_list_orders(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_upi_orders(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_upi_order(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_upi_create_order(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upi_submit_utr(UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upi_list_orders(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_upi_orders(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_upi_order(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
