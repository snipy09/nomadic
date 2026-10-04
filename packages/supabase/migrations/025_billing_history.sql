-- 025: payment history for the signed-in user (Settings → Account → Payments).
--
-- billing_list_payments   anon, session-checked (billing_session_ok). Returns the caller's captured Razorpay
--                         payments, newest first: Razorpay payment id, plan, amount in rupees, time. Never
--                         returns the raw gateway payload, order ids of other users or anything else.
--                         Matched by user id, or by email for payments made before the account was linked.

CREATE OR REPLACE FUNCTION public.billing_list_payments(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, payment_id TEXT, plan TEXT, amount_inr NUMERIC, status TEXT, paid_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  SELECT LOWER(up.email) INTO v_email FROM public.users_profile up WHERE up.id = p_user_id;

  RETURN QUERY
  SELECT TRUE, NULL::TEXT, rp.payment_id,
         CASE WHEN rp.plan = 'turbo' THEN 'max' ELSE rp.plan END,
         NULLIF(regexp_replace(COALESCE(rp.amount, ''), '[^0-9.]', '', 'g'), '')::NUMERIC,
         rp.status, rp.created_at
  FROM public.razorpay_payments rp
  WHERE rp.user_id = p_user_id OR (rp.user_id IS NULL AND v_email IS NOT NULL AND LOWER(rp.email) = v_email)
  ORDER BY rp.created_at DESC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_list_payments(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_list_payments(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
