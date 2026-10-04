-- 023: plan changes on payment keep the value already paid for.
--
-- Before: handle_razorpay_payment_success set subscription_tier from the latest payment and extended the
-- current expiry by 30 days. A Max user who paid the Pro amount was downgraded to Pro (and kept the Max
-- days as Pro days); a Pro user who paid the Max amount got the remaining Pro days as Max days; and any
-- payment set status = 'active', which lifted an admin suspension.
--
-- Now (prices in rupees, kept equal to packages/config/src/plans.ts by config.test.ts):
--   same plan                   -> expiry + 30 days (from now if already expired)
--   active Max pays Pro amount  -> stays Max; expiry + 30 days * 249/599 (Pro value as Max time)
--   active Pro pays Max amount  -> Max; remaining Pro time converted at 249/599, then + 30 days
--   trial/free, or expired      -> the paid plan from now for 30 days
--   paid plan without expiry    -> unchanged (granted without end); the payment is still recorded
--   status is never changed (a suspension stays until an admin lifts it)

CREATE OR REPLACE FUNCTION public.handle_razorpay_payment_success(
  p_user_id UUID,
  p_email TEXT,
  p_plan TEXT,
  p_amount TEXT,
  p_payment_id TEXT,
  p_order_id TEXT DEFAULT NULL,
  p_raw_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (ok BOOLEAN, user_id UUID, new_tier TEXT, expires_at TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  c_price_pro CONSTANT NUMERIC := 249;
  c_price_max CONSTANT NUMERIC := 599;
  c_period    CONSTANT INTERVAL := INTERVAL '30 days';
  v_user_id   UUID := p_user_id;
  v_amount    NUMERIC := NULLIF(regexp_replace(COALESCE(p_amount, ''), '[^0-9.]', '', 'g'), '')::NUMERIC;
  v_paid      TEXT;
  v_cur_tier  TEXT;
  v_cur_exp   TIMESTAMPTZ;
  v_remaining INTERVAL;
  v_tier      TEXT;
  v_expires   TIMESTAMPTZ;
  v_reason    TEXT := 'Subscription upgraded successfully!';
BEGIN
  IF v_amount IS NULL OR v_amount < c_price_pro THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, 'Amount does not match any plan';
    RETURN;
  END IF;
  v_paid := CASE WHEN v_amount >= c_price_max THEN 'max' ELSE 'pro' END;

  IF v_user_id IS NULL THEN
    SELECT up.id INTO v_user_id FROM public.users_profile up WHERE LOWER(up.email) = LOWER(TRIM(p_email)) LIMIT 1;
  END IF;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, 'No matching user account found for ' || p_email;
    RETURN;
  END IF;

  INSERT INTO public.razorpay_payments (user_id, email, plan, amount, payment_id, order_id, status, raw_payload)
  VALUES (v_user_id, LOWER(TRIM(p_email)), CASE WHEN v_paid = 'max' THEN 'turbo' ELSE 'pro' END,
          p_amount, p_payment_id, p_order_id, 'captured', p_raw_payload)
  ON CONFLICT (payment_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, v_user_id, NULL::TEXT, NULL::TIMESTAMPTZ, 'Payment already processed';
    RETURN;
  END IF;

  -- Lock the row so two payments for one user are applied one after the other.
  -- Current plan by the same tier mapping as billing_effective_plan (011), ignoring expiry.
  SELECT CASE
           WHEN LOWER(COALESCE(up.subscription_tier, '')) IN ('max', 'seeker_max', 'lifetime', 'enterprise', 'turbo') THEN 'max'
           WHEN LOWER(COALESCE(up.subscription_tier, '')) IN ('pro', 'lite', 'learner_pro', 'seeker_pro', 'learner', 'seeker') THEN 'pro'
           ELSE 'free' END,
         up.expires_at
    INTO v_cur_tier, v_cur_exp
  FROM public.users_profile up WHERE up.id = v_user_id FOR UPDATE;

  IF v_cur_tier IN ('pro', 'max') AND v_cur_exp IS NULL THEN
    -- Paid plan granted without an end date (e.g. lifetime): nothing to extend, tier name kept.
    SELECT up.subscription_tier INTO v_tier FROM public.users_profile up WHERE up.id = v_user_id;
    v_expires := NULL;
    v_reason := 'Payment recorded; the current plan has no end date';
  ELSE
    v_remaining := CASE WHEN v_cur_tier IN ('pro', 'max') AND v_cur_exp > NOW() THEN v_cur_exp - NOW()
                        ELSE INTERVAL '0' END;
    IF v_remaining = INTERVAL '0' OR v_cur_tier = v_paid THEN
      v_tier := v_paid;
      v_expires := NOW() + v_remaining + c_period;
    ELSIF v_cur_tier = 'max' THEN
      -- Active Max, Pro amount paid: never downgrade; credit the payment as Max time.
      v_tier := 'max';
      v_expires := NOW() + v_remaining + c_period * (c_price_pro / c_price_max);
      v_reason := 'Pro payment added to the active Max plan as extra time';
    ELSE
      -- Active Pro, Max amount paid: upgrade; the unused Pro time keeps its value as Max time.
      v_tier := 'max';
      v_expires := NOW() + v_remaining * (c_price_pro / c_price_max) + c_period;
    END IF;

    UPDATE public.users_profile
    SET subscription_tier = v_tier, expires_at = v_expires, updated_at = NOW()
    WHERE public.users_profile.id = v_user_id;
  END IF;

  INSERT INTO public.billing_records (user_email, amount, plan, status, payment_method)
  VALUES (LOWER(TRIM(p_email)), '₹' || p_amount,
          CASE WHEN v_paid = 'max' THEN 'Max (Monthly)' ELSE 'Pro (Monthly)' END, 'paid', 'Razorpay');

  RETURN QUERY SELECT TRUE, v_user_id, v_tier, v_expires, v_reason;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_razorpay_payment_success(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_razorpay_payment_success(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
