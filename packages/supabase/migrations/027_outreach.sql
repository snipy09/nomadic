-- 027: Outreach contact directory and AI outreach drafts (docs/OUTREACH_PLAN.md).
--
-- outreach_contacts            public hiring contacts written by the contact scraper (service role only).
--                              Only addresses a person or company published for hiring; each row keeps
--                              its source URL and the sentence it came from.
-- outreach_suppressions        sha256 of addresses that asked not to be listed; a trigger refuses them.
-- outreach_contact_reports     one report per user per contact. "asked_to_stop" hides the contact and
--                              suppresses it; three reports from different users hide it.
-- outreach_list_contacts       anon, session-checked; 50 rows a page, 500 rows a day per user.
-- outreach_report_contact      anon, session-checked.
-- outreach_suppress            service_role only (removal requests sent to grievance@): deletes the row
--                              and blocks the address for good.
-- ai_outreach_limits(plan)     AI outreach drafts per day, rendered from packages/config.
-- consume_ai_quota / refund_ai_quota   same signatures as 020, plus kind 'outreach_email'.
-- account_export_data          same signature as 026, plus the user's outreach reports.
--
-- The legacy public.hr_contacts table (empty, unused since this migration) is dropped by the owner:
-- `DROP TABLE public.hr_contacts;` (DROP needs a paste in the SQL editor). Idempotent.

-- 1. Usage metrics -----------------------------------------------------------------
ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_metric_check;
ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_metric_check
  CHECK (metric IN ('apply', 'ai_rubric_feedback', 'ai_form_answers', 'ai_outreach_email', 'outreach_contact_rows'));

-- 2. Tables (RLS on, no client grants: clients use the RPCs below) -------------------
CREATE TABLE IF NOT EXISTS public.outreach_contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254 AND position('@' IN email) > 1),
  name           TEXT CHECK (length(name) <= 120),
  company        TEXT NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  company_domain TEXT CHECK (length(company_domain) <= 253),
  role_title     TEXT CHECK (length(role_title) <= 200),
  hiring_for     TEXT CHECK (length(hiring_for) <= 300),
  contact_kind   TEXT NOT NULL CHECK (contact_kind IN ('recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown')),
  address_type   TEXT NOT NULL CHECK (address_type IN ('personal', 'role')),
  source         TEXT NOT NULL CHECK (source IN ('hn_whos_hiring', 'job_description', 'company_page')),
  source_url     TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2000),
  source_snippet TEXT NOT NULL CHECK (length(source_snippet) BETWEEN 1 AND 500),
  job_url        TEXT CHECK (length(job_url) <= 2000),
  location       TEXT CHECK (length(location) <= 300),
  remote         BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at      TIMESTAMPTZ,
  mx_ok          BOOLEAN,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  hidden_at      TIMESTAMPTZ,
  report_count   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_listed ON public.outreach_contacts (last_seen_at DESC) WHERE is_active AND hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_company ON public.outreach_contacts (lower(company));
ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_contacts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.outreach_suppressions (
  email_hash TEXT PRIMARY KEY CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  reason     TEXT NOT NULL DEFAULT 'removal_request' CHECK (length(reason) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.outreach_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_suppressions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.outreach_contact_reports (
  contact_id UUID NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL CHECK (reason IN ('bounced', 'wrong_person', 'not_hiring', 'asked_to_stop', 'other')),
  note       TEXT CHECK (length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_outreach_contact_reports_user ON public.outreach_contact_reports (user_id, created_at DESC);
ALTER TABLE public.outreach_contact_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_contact_reports FROM anon, authenticated;

-- sha256 hex of the lowercased address (the scraper computes the same value).
CREATE OR REPLACE FUNCTION public.outreach_email_hash(p_email TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;

-- A suppressed address is never written again. BEFORE INSERT returning NULL also skips the
-- DO UPDATE branch of the scraper's upsert.
CREATE OR REPLACE FUNCTION public.outreach_contacts_skip_suppressed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outreach_suppressions s WHERE s.email_hash = public.outreach_email_hash(NEW.email)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_outreach_contacts_skip_suppressed
  BEFORE INSERT ON public.outreach_contacts
  FOR EACH ROW EXECUTE FUNCTION public.outreach_contacts_skip_suppressed();

-- 3. outreach_list_contacts ------------------------------------------------------------
-- Errors (nothing counted): unauthorized, account_suspended, bad_request, daily_limit.
-- p_company matches the company name or domain, p_query the name, title, roles, company or
-- location (both case-insensitive substrings); p_kinds NULL = every kind. Contacts the user
-- reported are left out. Returned rows count toward 500 a day.
CREATE OR REPLACE FUNCTION public.outreach_list_contacts(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_company TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL, p_kinds TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
)
RETURNS TABLE (ok BOOLEAN, error TEXT, contacts JSONB, total INT, rows_left_today INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_daily   CONSTANT INT := 500;
  v_today   DATE := public.billing_today();
  v_company TEXT := NULLIF(lower(btrim(COALESCE(p_company, ''))), '');
  v_query   TEXT := NULLIF(lower(btrim(COALESCE(p_query, ''))), '');
  v_limit   INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  v_offset  INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_used    INT;
  v_total   INT;
  v_rows    JSONB;
  v_count   INT;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::JSONB, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = p_user_id AND up.status = 'suspended') THEN
    RETURN QUERY SELECT FALSE, 'account_suspended', NULL::JSONB, NULL::INT, NULL::INT; RETURN;
  END IF;
  IF length(COALESCE(v_company, '')) > 200 OR length(COALESCE(v_query, '')) > 100 OR v_offset > 10000
     OR (p_kinds IS NOT NULL AND (cardinality(p_kinds) > 7 OR NOT p_kinds <@ ARRAY['recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown'])) THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::JSONB, NULL::INT, NULL::INT; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('outreach_rows:' || p_user_id::text));
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = v_today AND c.metric = 'outreach_contact_rows';
  IF v_used >= v_daily THEN
    RETURN QUERY SELECT FALSE, 'daily_limit', NULL::JSONB, NULL::INT, 0; RETURN;
  END IF;

  WITH m AS (
    SELECT oc.id, oc.email, oc.name, oc.company, oc.company_domain, oc.role_title, oc.hiring_for, oc.contact_kind,
           oc.address_type, oc.source, oc.source_url, oc.source_snippet, oc.job_url, oc.location, oc.remote,
           oc.posted_at, oc.mx_ok, oc.last_seen_at
    FROM public.outreach_contacts oc
    WHERE oc.is_active AND oc.hidden_at IS NULL
      AND (v_company IS NULL OR position(v_company IN lower(oc.company)) > 0 OR position(v_company IN lower(COALESCE(oc.company_domain, ''))) > 0)
      AND (v_query IS NULL OR position(v_query IN lower(concat_ws(' ', oc.name, oc.role_title, oc.hiring_for, oc.company, oc.location))) > 0)
      AND (p_kinds IS NULL OR oc.contact_kind = ANY (p_kinds))
      AND NOT EXISTS (SELECT 1 FROM public.outreach_contact_reports r WHERE r.contact_id = oc.id AND r.user_id = p_user_id)
  ), page AS (
    SELECT * FROM m ORDER BY m.last_seen_at DESC, m.id
    LIMIT LEAST(v_limit, v_daily - v_used) OFFSET v_offset
  )
  SELECT (SELECT COUNT(*)::INT FROM m),
         COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.last_seen_at DESC, p.id) FROM page p), '[]'::jsonb),
         (SELECT COUNT(*)::INT FROM page)
  INTO v_total, v_rows, v_count;

  IF v_count > 0 THEN
    INSERT INTO public.usage_counters (user_id, usage_date, metric, used, updated_at)
    VALUES (p_user_id, v_today, 'outreach_contact_rows', v_count, NOW())
    ON CONFLICT (user_id, usage_date, metric)
    DO UPDATE SET used = public.usage_counters.used + v_count, updated_at = NOW();
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_rows, v_total, GREATEST(v_daily - v_used - v_count, 0);
END;
$$;

-- 4. outreach_report_contact -----------------------------------------------------------
-- p_reason: bounced | wrong_person | not_hiring | asked_to_stop | other. One report per user per
-- contact (a new one replaces the old). At most 50 reports a day per user.
-- Errors: unauthorized, bad_request, not_found, too_many_reports.
CREATE OR REPLACE FUNCTION public.outreach_report_contact(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_contact_id UUID, p_reason TEXT, p_note TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, error TEXT, hidden BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email  TEXT;
  v_count  INT;
  v_hidden BOOLEAN := FALSE;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', FALSE; RETURN;
  END IF;
  IF p_contact_id IS NULL OR p_reason IS NULL
     OR p_reason NOT IN ('bounced', 'wrong_person', 'not_hiring', 'asked_to_stop', 'other')
     OR length(COALESCE(p_note, '')) > 500 THEN
    RETURN QUERY SELECT FALSE, 'bad_request', FALSE; RETURN;
  END IF;
  SELECT oc.email INTO v_email FROM public.outreach_contacts oc WHERE oc.id = p_contact_id;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found', FALSE; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('outreach_report:' || p_user_id::text));
  IF (SELECT COUNT(*) FROM public.outreach_contact_reports r
      WHERE r.user_id = p_user_id AND r.created_at >= ((public.billing_today())::TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) >= 50 THEN
    RETURN QUERY SELECT FALSE, 'too_many_reports', FALSE; RETURN;
  END IF;

  INSERT INTO public.outreach_contact_reports (contact_id, user_id, reason, note)
  VALUES (p_contact_id, p_user_id, p_reason, NULLIF(btrim(COALESCE(p_note, '')), ''))
  ON CONFLICT (contact_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note, created_at = NOW();

  SELECT COUNT(*)::INT INTO v_count FROM public.outreach_contact_reports r WHERE r.contact_id = p_contact_id;
  IF p_reason = 'asked_to_stop' THEN
    INSERT INTO public.outreach_suppressions (email_hash, reason)
    VALUES (public.outreach_email_hash(v_email), 'asked_to_stop (user report)')
    ON CONFLICT (email_hash) DO NOTHING;
    v_hidden := TRUE;
  ELSIF v_count >= 3 THEN
    v_hidden := TRUE;
  END IF;

  UPDATE public.outreach_contacts oc
     SET report_count = v_count,
         hidden_at = CASE WHEN v_hidden THEN COALESCE(oc.hidden_at, NOW()) ELSE oc.hidden_at END
   WHERE oc.id = p_contact_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_hidden;
END;
$$;

-- 5. outreach_suppress (service_role only) ----------------------------------------------
-- For removal requests: blocks the address for good and deletes its row. Returns rows deleted.
CREATE OR REPLACE FUNCTION public.outreach_suppress(p_email TEXT, p_reason TEXT DEFAULT 'removal_request')
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_email IS NULL OR position('@' IN p_email) < 2 THEN RETURN 0; END IF;
  INSERT INTO public.outreach_suppressions (email_hash, reason)
  VALUES (public.outreach_email_hash(p_email), left(COALESCE(p_reason, 'removal_request'), 200))
  ON CONFLICT (email_hash) DO UPDATE SET reason = EXCLUDED.reason;
  DELETE FROM public.outreach_contacts oc WHERE oc.email = lower(btrim(p_email));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 6. AI outreach limits (single source: packages/config/src/plans.ts) --------------------
-- Rows between the markers are checked line-for-line against aiOutreachLimitsSqlRows() by
-- packages/supabase/src/__tests__/ai-outreach-limits-parity.test.ts.
CREATE OR REPLACE FUNCTION public.ai_outreach_limits(p_plan TEXT)
RETURNS TABLE (ai_outreach_drafts_per_day INT)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT t.ai_outreach_drafts_per_day
  FROM (VALUES
    -- BEGIN ai_outreach_limits (generated from packages/config)
    ('free', 3),
    ('pro', 25),
    ('max', 100)
    -- END ai_outreach_limits
  ) AS t(plan, ai_outreach_drafts_per_day)
  WHERE t.plan = p_plan;
$$;

-- 7. consume_ai_quota: 020 plus kind 'outreach_email' ------------------------------------
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_kind TEXT
)
RETURNS TABLE (
  ok          BOOLEAN,
  error       TEXT,
  plan        TEXT,
  kind        TEXT,
  daily_limit INT,
  used        INT,
  remaining   INT,
  resets_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_plan    TEXT;
  v_status  TEXT;
  v_metric  TEXT;
  v_allowed BOOLEAN;
  v_limit   INT;
  v_used    INT;
  v_today   DATE := public.billing_today();
  v_resets  TIMESTAMPTZ := ((public.billing_today() + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  l         RECORD;
BEGIN
  IF NOT public.billing_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;

  v_metric := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                          WHEN 'form_answers'    THEN 'ai_form_answers'
                          WHEN 'outreach_email'  THEN 'ai_outreach_email' END;
  IF v_metric IS NULL THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;

  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  IF p_kind = 'outreach_email' THEN
    v_limit   := COALESCE((SELECT o.ai_outreach_drafts_per_day FROM public.ai_outreach_limits(v_plan) o), 0);
    v_allowed := v_limit > 0;
  ELSE
    SELECT * INTO l FROM public.ai_limits(v_plan);
    IF p_kind = 'rubric_feedback' THEN
      v_allowed := COALESCE(l.ai_feedback, FALSE) AND COALESCE(l.ai_feedback_per_day, 0) > 0;
      v_limit   := COALESCE(l.ai_feedback_per_day, 0);
    ELSE
      v_allowed := COALESCE(l.ai_form_calls_per_day, 0) > 0;
      v_limit   := COALESCE(l.ai_form_calls_per_day, 0);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_user_id::text));
  SELECT COALESCE(SUM(c.used), 0)::INT INTO v_used FROM public.usage_counters c
  WHERE c.user_id = p_user_id AND c.usage_date = v_today AND c.metric = v_metric;

  IF v_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, 'account_suspended', v_plan, p_kind, v_limit, v_used, 0, v_resets; RETURN;
  END IF;
  IF NOT v_allowed THEN
    RETURN QUERY SELECT FALSE, 'plan_required', v_plan, p_kind, v_limit, v_used, 0, v_resets; RETURN;
  END IF;
  IF v_used + 1 > v_limit THEN
    RETURN QUERY SELECT FALSE, 'quota_exceeded', v_plan, p_kind, v_limit, v_used, GREATEST(v_limit - v_used, 0), v_resets;
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (user_id, usage_date, metric, used, updated_at)
  VALUES (p_user_id, v_today, v_metric, 1, NOW())
  ON CONFLICT (user_id, usage_date, metric)
  DO UPDATE SET used = public.usage_counters.used + 1, updated_at = NOW();

  v_used := v_used + 1;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_plan, p_kind, v_limit, v_used, GREATEST(v_limit - v_used, 0), v_resets;
END;
$$;

-- 8. refund_ai_quota: 020 plus kind 'outreach_email' -------------------------------------
CREATE OR REPLACE FUNCTION public.refund_ai_quota(p_user_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_metric TEXT := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                               WHEN 'form_answers'    THEN 'ai_form_answers'
                               WHEN 'outreach_email'  THEN 'ai_outreach_email' END;
  v_used   INT;
BEGIN
  IF v_metric IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_user_id::text));
  UPDATE public.usage_counters c SET used = GREATEST(c.used - 1, 0), updated_at = NOW()
  WHERE c.user_id = p_user_id AND c.usage_date = public.billing_today() AND c.metric = v_metric
  RETURNING c.used INTO v_used;
  RETURN COALESCE(v_used, 0);
END;
$$;

-- 9. Export: same as 026 plus outreach_reports --------------------------------------------
CREATE OR REPLACE FUNCTION public.account_export_data(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, data JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT;
  v_data  JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions s
                  WHERE s.user_id = p_user_id AND s.session_token = p_session_token
                    AND s.device_fingerprint = p_device_fingerprint AND s.is_active) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::JSONB;
    RETURN;
  END IF;
  SELECT LOWER(up.email) INTO v_email FROM public.users_profile up WHERE up.id = p_user_id;
  SELECT jsonb_build_object(
    'account', (SELECT to_jsonb(up) - 'password_hash' FROM public.users_profile up WHERE up.id = p_user_id),
    'cloud_profile', (SELECT to_jsonb(p) - 'user_id' FROM public.user_cloud_profiles p WHERE p.user_id = p_user_id),
    'preferences', (SELECT to_jsonb(p) - 'user_id' FROM public.user_preferences p WHERE p.user_id = p_user_id),
    'applications', COALESCE((SELECT jsonb_agg(to_jsonb(a) - 'user_id' ORDER BY a.applied_at) FROM public.user_applications a WHERE a.user_id = p_user_id), '[]'::jsonb),
    'saved_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id') FROM public.user_saved_jobs s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'hidden_jobs', COALESCE((SELECT jsonb_agg(to_jsonb(h) - 'user_id' ORDER BY h.hidden_at) FROM public.user_hidden_jobs h WHERE h.user_id = p_user_id), '[]'::jsonb),
    'resumes', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.user_resumes r WHERE r.user_id = p_user_id), '[]'::jsonb),
    'job_matches', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'user_id') FROM public.user_job_matches m WHERE m.user_id = p_user_id), '[]'::jsonb),
    'learning_tracks', COALESCE((SELECT jsonb_agg(to_jsonb(t) - 'user_id') FROM public.user_tracks t WHERE t.user_id = p_user_id), '[]'::jsonb),
    'learning_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at) FROM public.learning_events e WHERE e.user_id = p_user_id), '[]'::jsonb),
    'outreach_reports', COALESCE((SELECT jsonb_agg(to_jsonb(o) - 'user_id' ORDER BY o.created_at) FROM public.outreach_contact_reports o WHERE o.user_id = p_user_id), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'session_token' ORDER BY s.created_at) FROM public.user_sessions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp) - 'user_id' - 'raw_payload' ORDER BY rp.created_at)
                            FROM public.razorpay_payments rp WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email), '[]'::jsonb),
    'billing_records', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM public.billing_records b WHERE LOWER(b.user_email) = v_email), '[]'::jsonb)
  ) INTO v_data;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_data;
END;
$$;

-- 10. Grants (allow-list rule, SECURITY_CHECKLIST) ------------------------------------------
REVOKE ALL ON FUNCTION public.outreach_email_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_contacts_skip_suppressed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_list_contacts(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.outreach_report_contact(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.outreach_suppress(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_outreach_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outreach_list_contacts(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_report_contact(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_suppress(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_outreach_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
