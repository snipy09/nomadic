# Supabase SQL to paste (Learn v2 go-live)

Project: `nomadic` (ref `grqkiddfwoyicktpgdea`). Open **Supabase dashboard → SQL Editor → New query**, paste one block, press **Run**, check the result, then do the next one. Do them in this order.

| # | What | Where | Why |
|---|------|-------|-----|
| 1 | Migration 028 | block below (same as `packages/supabase/baseline/apply_028.sql`) | Learn v2 state table, sync RPCs, new event types |
| 2 | Migration 029 | block below (same as `packages/supabase/baseline/apply_029.sql`) | AI roadmap daily limits; **drops and recreates** `ai_limits` |
| 3 | Redeploy `ai-proxy` | terminal command below | the live function does not know `roadmap_plan` / `roadmap_adjust` yet |
| 4 | Content seed | whole file `packages/supabase/baseline/content_seed.sql` (278 KB, too big to copy here) | 7 new skills, lessons, 95 quiz items, 26 resources |
| 5 | Check | queries at the bottom | confirms all of the above |

Notes:
- Each file is one transaction (`BEGIN … COMMIT`): if anything fails, nothing is changed. Read the error and stop.
- Each records itself in `schema_migrations` with `ON CONFLICT DO NOTHING`, so running one twice is harmless.
- The files have no blank lines on purpose (the SQL editor splits on them). Paste them exactly as they are.
- 1 and 2 were rehearsed on a local PostgreSQL 16 copy of the schema, not on the live database.

## 1. Migration 028

```sql
-- Nomadic: migration 028 (Learn v2 state documents and event types). Paste into Supabase SQL Editor and Run.
BEGIN;
-- 028: Learn v2 student state and event types.
--
-- user_learn_state        one JSON document per user and kind: roadmap | schedule | projects | notes.
--                         RLS on, no client grants; reached only through the RPCs below.
-- learning_save_state     anon, session-checked (learning_session_ok), advisory-locked per user.
--                         Last writer wins by the client's updated_at; an older write is ignored
--                         and reported as stale so the client pulls first. 512 KB per document.
-- learning_pull_state     anon, session-checked; every document of the user.
-- learning_events.type    widened with the v2 task, problem, project and roadmap events. They are not
--                         item-level practice, so learning_record_events (007) keeps them out of the
--                         free plan's 10 attempts a day (its cap only counts quiz_passed, quiz_failed,
--                         problem_solved and review_done with an item id); no change needed there.
-- account_export_data     same signature; adds learn_state. Deletion cascades from users_profile.
-- The constraint swap (DROP CONSTRAINT) is the only destructive statement.
ALTER TABLE public.learning_events DROP CONSTRAINT IF EXISTS learning_events_type_check;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_type_check CHECK (type IN (
  'lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known',
  'task_done', 'task_skipped', 'task_moved', 'problem_attempted', 'stage_done', 'project_started',
  'project_done', 'roadmap_accepted'
));
CREATE TABLE IF NOT EXISTS public.user_learn_state (
  user_id    UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('roadmap', 'schedule', 'projects', 'notes')),
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.user_learn_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_learn_state FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.learning_save_state(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_kind TEXT, p_value JSONB, p_updated_at TIMESTAMPTZ
)
RETURNS TABLE (ok BOOLEAN, error TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $
#variable_conflict use_column
DECLARE
  v_current TIMESTAMPTZ;
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN
    RETURN QUERY SELECT FALSE, 'unauthorized', NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('roadmap', 'schedule', 'projects', 'notes') OR p_value IS NULL
     OR p_updated_at IS NULL OR octet_length(p_value::text) > 524288 THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TIMESTAMPTZ; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learn_state:' || p_user_id::text));
  SELECT s.updated_at INTO v_current FROM public.user_learn_state s WHERE s.user_id = p_user_id AND s.kind = p_kind;
  IF v_current IS NOT NULL AND v_current > p_updated_at THEN
    RETURN QUERY SELECT FALSE, 'stale', v_current; RETURN;
  END IF;
  INSERT INTO public.user_learn_state (user_id, kind, value, updated_at, received_at)
  VALUES (p_user_id, p_kind, p_value, LEAST(p_updated_at, NOW() + INTERVAL '5 minutes'), NOW())
  ON CONFLICT (user_id, kind) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, received_at = NOW();
  RETURN QUERY SELECT TRUE, NULL::TEXT, LEAST(p_updated_at, NOW() + INTERVAL '5 minutes');
END;
$;
CREATE OR REPLACE FUNCTION public.learning_pull_state(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
)
RETURNS TABLE (kind TEXT, value JSONB, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $
#variable_conflict use_column
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN; END IF;
  RETURN QUERY SELECT s.kind, s.value, s.updated_at FROM public.user_learn_state s
  WHERE s.user_id = p_user_id ORDER BY s.kind;
END;
$;
-- Export: same as 027 plus learn_state.
CREATE OR REPLACE FUNCTION public.account_export_data(p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT)
RETURNS TABLE (ok BOOLEAN, error TEXT, data JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $
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
    'learn_state', COALESCE((SELECT jsonb_agg(to_jsonb(ls) - 'user_id' ORDER BY ls.kind) FROM public.user_learn_state ls WHERE ls.user_id = p_user_id), '[]'::jsonb),
    'learning_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at) FROM public.learning_events e WHERE e.user_id = p_user_id), '[]'::jsonb),
    'outreach_reports', COALESCE((SELECT jsonb_agg(to_jsonb(o) - 'user_id' ORDER BY o.created_at) FROM public.outreach_contact_reports o WHERE o.user_id = p_user_id), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'session_token' ORDER BY s.created_at) FROM public.user_sessions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp) - 'user_id' - 'raw_payload' ORDER BY rp.created_at)
                            FROM public.razorpay_payments rp WHERE rp.user_id = p_user_id OR LOWER(rp.email) = v_email), '[]'::jsonb),
    'billing_records', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM public.billing_records b WHERE LOWER(b.user_email) = v_email), '[]'::jsonb)
  ) INTO v_data;
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_data;
END;
$;
REVOKE ALL ON FUNCTION public.learning_save_state(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_pull_state(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learning_save_state(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.learning_pull_state(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_export_data(UUID, TEXT, TEXT) TO anon, authenticated;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('028_learn_v2_state.sql', '42abc814c350c31c7e213f00404b34018a948d6c14dfc7ea7231b9c315ac866b') ON CONFLICT (filename) DO NOTHING;
COMMIT;
```

## 2. Migration 029

```sql
-- Nomadic: migration 029 (AI quotas for Learn v2 roadmaps). Paste into Supabase SQL Editor and Run.
BEGIN;
-- 029: AI quotas for Learn v2 roadmaps (ai-proxy kinds roadmap_plan and roadmap_adjust).
--
-- usage_counters metrics  + ai_roadmap, ai_roadmap_adjust.
-- ai_limits(plan)         recreated with two more columns (a changed result type needs DROP FUNCTION,
--                         so this file is pasted by the owner). Rows between the markers mirror
--                         packages/config (ai-limits-parity.test.ts).
-- consume_ai_quota        same signature; maps the new kinds to their metrics and limits and keeps
--                         027's outreach_email kind (limits from ai_outreach_limits).
-- refund_ai_quota         same signature; maps the new kinds.
-- Grants as in 020: service_role only. The rules planner never calls AI and is never counted.
-- The outreach metrics of 027 (ai_outreach_email, outreach_contact_rows) stay in the metric CHECK.
ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_metric_check;
ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_metric_check
  CHECK (metric IN ('apply', 'ai_rubric_feedback', 'ai_form_answers', 'ai_outreach_email', 'outreach_contact_rows',
                    'ai_roadmap', 'ai_roadmap_adjust'));
DROP FUNCTION IF EXISTS public.ai_limits(TEXT);
CREATE FUNCTION public.ai_limits(p_plan TEXT)
RETURNS TABLE (
  ai_feedback               BOOLEAN,
  ai_feedback_per_day       INT,
  ai_form_calls_per_day     INT,
  ai_roadmap_per_day        INT,
  ai_roadmap_adjust_per_day INT
)
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $
  SELECT t.ai_feedback, t.ai_feedback_per_day, t.ai_form_calls_per_day, t.ai_roadmap_per_day, t.ai_roadmap_adjust_per_day
  FROM (VALUES
    -- BEGIN ai_limits (generated from packages/config)
    ('free', FALSE, 0, 10, 2, 2),
    ('pro', TRUE, 30, 40, 10, 15),
    ('max', TRUE, 100, 300, 20, 40)
    -- END ai_limits
  ) AS t(plan, ai_feedback, ai_feedback_per_day, ai_form_calls_per_day, ai_roadmap_per_day, ai_roadmap_adjust_per_day)
  WHERE t.plan = p_plan;
$;
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $
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
                          WHEN 'outreach_email'  THEN 'ai_outreach_email'
                          WHEN 'roadmap_plan'    THEN 'ai_roadmap'
                          WHEN 'roadmap_adjust'  THEN 'ai_roadmap_adjust' END;
  IF v_metric IS NULL THEN
    RETURN QUERY SELECT FALSE, 'bad_request', NULL::TEXT, p_kind, NULL::INT, NULL::INT, NULL::INT, v_resets; RETURN;
  END IF;
  SELECT up.status INTO v_status FROM public.users_profile up WHERE up.id = p_user_id;
  v_plan := public.billing_effective_plan(p_user_id);
  SELECT * INTO l FROM public.ai_limits(v_plan);
  IF p_kind = 'rubric_feedback' THEN
    v_allowed := COALESCE(l.ai_feedback, FALSE) AND COALESCE(l.ai_feedback_per_day, 0) > 0;
    v_limit   := COALESCE(l.ai_feedback_per_day, 0);
  ELSIF p_kind = 'outreach_email' THEN
    v_limit   := COALESCE((SELECT o.ai_outreach_drafts_per_day FROM public.ai_outreach_limits(v_plan) o), 0);
    v_allowed := v_limit > 0;
  ELSIF p_kind = 'roadmap_plan' THEN
    v_limit   := COALESCE(l.ai_roadmap_per_day, 0);
    v_allowed := v_limit > 0;
  ELSIF p_kind = 'roadmap_adjust' THEN
    v_limit   := COALESCE(l.ai_roadmap_adjust_per_day, 0);
    v_allowed := v_limit > 0;
  ELSE
    v_allowed := COALESCE(l.ai_form_calls_per_day, 0) > 0;
    v_limit   := COALESCE(l.ai_form_calls_per_day, 0);
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
$;
CREATE OR REPLACE FUNCTION public.refund_ai_quota(p_user_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $
DECLARE
  v_metric TEXT := CASE p_kind WHEN 'rubric_feedback' THEN 'ai_rubric_feedback'
                               WHEN 'form_answers'    THEN 'ai_form_answers'
                               WHEN 'outreach_email'  THEN 'ai_outreach_email'
                               WHEN 'roadmap_plan'    THEN 'ai_roadmap'
                               WHEN 'roadmap_adjust'  THEN 'ai_roadmap_adjust' END;
  v_used   INT;
BEGIN
  IF v_metric IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_user_id::text));
  UPDATE public.usage_counters c SET used = GREATEST(c.used - 1, 0), updated_at = NOW()
  WHERE c.user_id = p_user_id AND c.usage_date = public.billing_today() AND c.metric = v_metric
  RETURNING c.used INTO v_used;
  RETURN COALESCE(v_used, 0);
END;
$;
REVOKE ALL ON FUNCTION public.ai_limits(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_limits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(UUID, TEXT) TO service_role;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('029_learn_v2_ai_limits.sql', 'd346c79429a0e42ee65f4f952709f4e0375eaf4b6bea4c41016f244f6cad27bd') ON CONFLICT (filename) DO NOTHING;
COMMIT;
```

## 3. Redeploy ai-proxy (terminal, repo root)

```
supabase functions deploy ai-proxy --project-ref grqkiddfwoyicktpgdea
```

Keep JWT verification on (the default; do not pass `--no-verify-jwt`). Needs the Supabase CLI logged in (`supabase login`).
Without this step the app still works: roadmaps fall back to the rules planner (no AI).

## 4. Content seed

Open `packages/supabase/baseline/content_seed.sql`, select all, paste into a new query, Run.
If you later run `check-links --write-seed` / `build-seed` on the laptop, regenerate it (`node packages/learning/scripts/seed-sql.mjs`) and paste the new file again (it is safe to re-run).

## 5. Check

```sql
select filename, applied_at from public.schema_migrations
where filename in ('028_learn_v2_state.sql', '029_learn_v2_ai_limits.sql');
-- expect 2 rows
select to_regclass('public.user_learn_state') is not null as learn_state_table;
-- expect true
select proname from pg_proc where proname in ('learning_save_state', 'learning_pull_state');
-- expect 2 rows
select * from public.ai_limits('free');
-- expect: false, 0, 10, 2, 2
select count(*) as skills from public.skills;
-- expect 109 after the content seed
```

Then in the app: Learn → build a roadmap. The review screen shows "AI plan from the reviewed catalogue" when AI worked; "Standard planner" while online means step 3 (or 2) did not take.
