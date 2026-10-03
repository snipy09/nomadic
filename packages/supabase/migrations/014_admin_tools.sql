-- ----------------------------------------------------------------------------
-- MIGRATION 014: Admin and content tools (F12)
--
-- The desktop admin panel used the service-role key (or, without it, the anon
-- key) to read and write users_profile directly. That key must never be on a
-- customer machine, and hiding the Admin tab is not protection. From here on
-- every admin read and write goes through the SECURITY DEFINER RPCs below.
-- Each one:
--   * verifies the caller's device session (session_token + user_id +
--     device_fingerprint + is_active, same model as 003 / 008 / 010), AND
--   * verifies users_profile.role = 'admin' and status = 'active' for that user
--     (the role is read from the database, never taken from the client), and
--   * writes one row to the append-only admin_audit_log in the same
--     transaction for every change.
-- Content edits snapshot the previous row into the append-only
-- content_versions table and bump the row's version (optimistic concurrency:
-- the caller must send the version it edited).
-- Resources cannot be created from the app (curated URLs come from the seed in
-- packages/learning); admins may only change a resource's status, and 'active'
-- requires a passing link check.
-- Idempotent.
-- ----------------------------------------------------------------------------

-- 1. Append-only audit log ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  -- No foreign key: an audit row must outlive the accounts it mentions.
  actor_id     UUID,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('user', 'lesson', 'resource', 'admin')),
  target_id    TEXT,
  target_label TEXT,
  reason       TEXT,
  before       JSONB,
  after        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log (target_type, target_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_append_only();
DROP TRIGGER IF EXISTS trg_admin_audit_log_no_truncate ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_truncate BEFORE TRUNCATE ON public.admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_append_only();

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM PUBLIC, anon, authenticated;

-- 2. Content versions ------------------------------------------------------------
-- snapshot = the full row as it was at `version`, written just before the edit
-- that produced version + 1.
CREATE TABLE IF NOT EXISTS public.content_versions (
  id           BIGSERIAL PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('lesson', 'resource')),
  content_id   TEXT NOT NULL,
  version      INT NOT NULL,
  snapshot     JSONB NOT NULL,
  edited_by    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id, version)
);

DROP TRIGGER IF EXISTS trg_content_versions_immutable ON public.content_versions;
CREATE TRIGGER trg_content_versions_immutable BEFORE UPDATE OR DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION public.admin_append_only();
DROP TRIGGER IF EXISTS trg_content_versions_no_truncate ON public.content_versions;
CREATE TRIGGER trg_content_versions_no_truncate BEFORE TRUNCATE ON public.content_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_append_only();

ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.content_versions_id_seq FROM PUBLIC, anon, authenticated;

-- Resources get a version like lessons; both get an edit timestamp.
ALTER TABLE public.learning_resources ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.learning_resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Caller check -----------------------------------------------------------------
-- 'ok' | 'unauthorized' (no valid session) | 'forbidden' (valid session, not an
-- active admin). A refused non-admin is audited at most once per 10 minutes.
CREATE OR REPLACE FUNCTION public.admin_check_caller(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL OR p_session_token IS NULL OR p_device_fingerprint IS NULL THEN
    RETURN 'unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.user_id = p_user_id AND s.session_token = p_session_token
      AND s.device_fingerprint = p_device_fingerprint AND s.is_active = TRUE
  ) THEN
    RETURN 'unauthorized';
  END IF;

  SELECT u.role, u.status, u.email INTO v_role, v_status, v_email
  FROM public.users_profile u WHERE u.id = p_user_id;

  IF v_role IS DISTINCT FROM 'admin' OR v_status IS DISTINCT FROM 'active' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_audit_log a
      WHERE a.actor_id = p_user_id AND a.action = 'admin.denied' AND a.created_at > NOW() - INTERVAL '10 minutes'
    ) THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id)
      VALUES (p_user_id, v_email, 'admin.denied', 'admin', p_user_id::text);
    END IF;
    RETURN 'forbidden';
  END IF;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit(
  p_actor UUID, p_action TEXT, p_target_type TEXT, p_target_id TEXT, p_target_label TEXT,
  p_reason TEXT, p_before JSONB, p_after JSONB
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, reason, before, after)
  VALUES (p_actor, (SELECT email FROM public.users_profile WHERE id = p_actor), p_action, p_target_type,
          p_target_id, p_target_label, p_reason, p_before, p_after)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Normalised reason: trimmed, 3-500 characters, or NULL when invalid.
CREATE OR REPLACE FUNCTION public.admin_reason(p_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(btrim(COALESCE(p_reason, ''))) BETWEEN 3 AND 500 THEN btrim(p_reason) ELSE NULL END;
$$;

-- LIKE pattern for a user-supplied search string (wildcards escaped).
CREATE OR REPLACE FUNCTION public.admin_like(p_query TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT '%' || replace(replace(replace(btrim(left(COALESCE(p_query, ''), 200)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- 4. Users ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_query TEXT DEFAULT NULL, p_tier TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_like TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_total INT;
  v_users JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;

  v_like := CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL ELSE public.admin_like(p_query) END;

  WITH filtered AS (
    SELECT u.* FROM public.users_profile u
    WHERE (v_like IS NULL OR u.email ILIKE v_like OR COALESCE(u.full_name, '') ILIKE v_like OR u.id::text = btrim(p_query))
      AND (p_tier IS NULL OR u.subscription_tier = p_tier)
      AND (p_status IS NULL OR u.status = p_status)
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at DESC NULLS LAST, r.email)
      FROM (
        SELECT f.id, f.email, f.full_name, f.subscription_tier, f.role, f.status, f.expires_at,
               f.created_at, f.last_login, f.apps_count,
               (SELECT count(*) FROM public.user_sessions s WHERE s.user_id = f.id AND s.is_active = TRUE) AS active_sessions
        FROM filtered f
        ORDER BY f.created_at DESC NULLS LAST, f.email
        LIMIT v_limit OFFSET v_offset
      ) r
    ), '[]'::jsonb)
  INTO v_total, v_users;

  RETURN jsonb_build_object('ok', TRUE, 'total', v_total, 'users', v_users);
END;
$$;

-- Change a user's plan and expiry. p_expires_at NULL = no expiry (lifetime is
-- always non-expiring). An admin cannot change their own account.
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_target_id UUID, p_tier TEXT, p_expires_at TIMESTAMPTZ, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  v_expires TIMESTAMPTZ := CASE WHEN p_tier = 'lifetime' THEN NULL ELSE p_expires_at END;
  u public.users_profile%ROWTYPE;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_target_id = p_user_id THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_change_self'); END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('trial', 'pro', 'max', 'lifetime') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_plan');
  END IF;
  IF v_expires IS NOT NULL AND v_expires <= NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_expiry');
  END IF;

  SELECT * INTO u FROM public.users_profile WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF u.subscription_tier IS NOT DISTINCT FROM p_tier AND u.expires_at IS NOT DISTINCT FROM v_expires THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change');
  END IF;

  UPDATE public.users_profile SET subscription_tier = p_tier, expires_at = v_expires, updated_at = NOW()
  WHERE id = p_target_id;

  v_audit := public.admin_audit(p_user_id, 'user.plan_changed', 'user', p_target_id::text, u.email, v_reason,
    jsonb_build_object('tier', u.subscription_tier, 'expires_at', u.expires_at),
    jsonb_build_object('tier', p_tier, 'expires_at', v_expires));

  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'tier', p_tier, 'expires_at', v_expires);
END;
$$;

-- Suspend or reactivate. Suspending also ends the user's active device sessions.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_target_id UUID, p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  u public.users_profile%ROWTYPE;
  v_ended INT := 0;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_target_id = p_user_id THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_change_self'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;

  SELECT * INTO u FROM public.users_profile WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF u.status = p_status THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;

  UPDATE public.users_profile SET status = p_status, updated_at = NOW() WHERE id = p_target_id;
  IF p_status = 'suspended' THEN
    UPDATE public.user_sessions SET is_active = FALSE WHERE user_id = p_target_id AND is_active = TRUE;
    GET DIAGNOSTICS v_ended = ROW_COUNT;
  END IF;

  v_audit := public.admin_audit(p_user_id,
    CASE WHEN p_status = 'suspended' THEN 'user.suspended' ELSE 'user.reactivated' END,
    'user', p_target_id::text, u.email, v_reason,
    jsonb_build_object('status', u.status),
    jsonb_build_object('status', p_status, 'sessions_ended', v_ended));

  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'status', p_status, 'sessions_ended', v_ended);
END;
$$;

-- 5. Audit log viewer -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_audit(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_limit INT DEFAULT 50, p_before_id BIGINT DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL, p_target_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_entries JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.id DESC), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT a.id, a.actor_id, a.actor_email, a.action, a.target_type, a.target_id, a.target_label,
           a.reason, a.before, a.after, a.created_at
    FROM public.admin_audit_log a
    WHERE (p_before_id IS NULL OR a.id < p_before_id)
      AND (p_target_type IS NULL OR a.target_type = p_target_type)
      AND (p_target_id IS NULL OR a.target_id = p_target_id)
    ORDER BY a.id DESC
    LIMIT v_limit
  ) r;

  RETURN jsonb_build_object('ok', TRUE, 'entries', v_entries,
    'has_more', jsonb_array_length(v_entries) = v_limit);
END;
$$;

-- 6. Scraper health -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_scrape_health(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT, p_days INT DEFAULT 7
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 30));
  v_runs JSONB;
  v_sources JSONB;
  v_jobs JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.started_at DESC), '[]'::jsonb) INTO v_runs
  FROM (
    SELECT id, run_id, source, tier, status, started_at, finished_at, duration_ms, fetched, valid, invalid,
           duplicates, link_failed, upserted, expired, error, alert, published
    FROM public.scrape_runs WHERE started_at >= v_since
    ORDER BY started_at DESC LIMIT 200
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.failures DESC, s.source), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT sr.source,
           count(*)::int AS runs,
           count(*) FILTER (WHERE sr.status = 'error')::int AS failures,
           max(sr.started_at) AS last_run_at,
           (array_agg(sr.status ORDER BY sr.started_at DESC))[1] AS last_status,
           max(sr.started_at) FILTER (WHERE sr.status = 'ok') AS last_ok_at,
           (array_agg(sr.error ORDER BY sr.started_at DESC) FILTER (WHERE sr.error IS NOT NULL))[1] AS last_error,
           COALESCE(sum(sr.fetched), 0)::int AS fetched,
           COALESCE(sum(sr.upserted), 0)::int AS upserted,
           COALESCE(sum(sr.link_failed), 0)::int AS link_failed,
           COALESCE(round(avg(sr.duration_ms)), 0)::int AS avg_duration_ms
    FROM public.scrape_runs sr WHERE sr.started_at >= v_since
    GROUP BY sr.source
  ) s;

  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO v_jobs
  FROM (
    SELECT COALESCE(j.source_key, j.source, 'unknown') AS k, count(*)::int AS n
    FROM public.jobs j WHERE j.status = 'active'
    GROUP BY 1
  ) c;

  RETURN jsonb_build_object('ok', TRUE, 'since', v_since, 'runs', v_runs, 'sources', v_sources,
    'active_jobs_by_source', v_jobs);
END;
$$;

-- 7. Content -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_content(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_kind TEXT, p_status TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL, p_limit INT DEFAULT 200
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_like TEXT := CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL ELSE public.admin_like(p_query) END;
  v_items JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;

  IF p_kind = 'skills' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.category, r.name), '[]'::jsonb) INTO v_items
    FROM (
      SELECT s.id, s.name, s.category, s.level, s.estimated_hours, s.updated_at,
             (SELECT count(*) FROM public.lessons l WHERE l.skill_id = s.id)::int AS lesson_count,
             (SELECT count(*) FROM public.learning_resources lr WHERE s.id = ANY (lr.skill_ids))::int AS resource_count,
             (SELECT count(*) FROM public.practice_items p WHERE p.skill_id = s.id)::int AS practice_count
      FROM public.skills s
      WHERE v_like IS NULL OR s.name ILIKE v_like OR s.id ILIKE v_like
      ORDER BY s.category, s.name LIMIT v_limit
    ) r;
  ELSIF p_kind = 'lessons' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.skill_id, r.title), '[]'::jsonb) INTO v_items
    FROM (
      SELECT l.id, l.skill_id, l.title, l.status, l.version, l.ai_drafted, l.is_core, l.estimated_minutes,
             l.summary_md, l.key_points, l.resource_ids, l.updated_at
      FROM public.lessons l
      WHERE (p_status IS NULL OR l.status = p_status)
        AND (v_like IS NULL OR l.title ILIKE v_like OR l.id ILIKE v_like OR l.skill_id ILIKE v_like)
      ORDER BY l.skill_id, l.title LIMIT v_limit
    ) r;
  ELSIF p_kind = 'resources' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.title), '[]'::jsonb) INTO v_items
    FROM (
      SELECT lr.id, lr.title, lr.url, lr.provider, lr.type, lr.status, lr.version, lr.skill_ids, lr.last_checked,
             lr.http_status, lr.fail_count, lr.source, lr.updated_at
      FROM public.learning_resources lr
      WHERE (p_status IS NULL OR lr.status = p_status)
        AND (v_like IS NULL OR lr.title ILIKE v_like OR lr.id ILIKE v_like OR lr.provider ILIKE v_like)
      ORDER BY lr.title LIMIT v_limit
    ) r;
  ELSIF p_kind = 'practice' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.skill_id, r.id), '[]'::jsonb) INTO v_items
    FROM (
      SELECT p.id, p.skill_id, p.lesson_id, p.kind, p.difficulty, p.status, p.version, p.ai_drafted,
             left(COALESCE(p.body->>'prompt', ''), 500) AS prompt
      FROM public.practice_items p
      WHERE (p_status IS NULL OR p.status = p_status)
        AND (v_like IS NULL OR p.id ILIKE v_like OR p.skill_id ILIKE v_like OR COALESCE(p.body->>'prompt', '') ILIKE v_like)
      ORDER BY p.skill_id, p.id LIMIT v_limit
    ) r;
  ELSE
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_kind');
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'kind', p_kind, 'items', v_items);
END;
$$;

-- Status workflow: draft -> review -> published; published -> review (pull back)
-- or archived; review -> draft; archived -> draft. Publishing needs review first.
CREATE OR REPLACE FUNCTION public.admin_content_transition_ok(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_from = p_to OR (p_from, p_to) IN (
    ('draft', 'review'), ('draft', 'archived'),
    ('review', 'draft'), ('review', 'published'),
    ('published', 'review'), ('published', 'archived'),
    ('archived', 'draft')
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_update_lesson(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_lesson_id TEXT, p_expected_version INT,
  p_title TEXT, p_summary_md TEXT, p_key_points TEXT[], p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_summary TEXT := btrim(COALESCE(p_summary_md, ''));
  v_points TEXT[];
  l public.lessons%ROWTYPE;
  v_changed TEXT[] := '{}';
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF length(v_title) NOT BETWEEN 1 AND 200 OR length(v_summary) NOT BETWEEN 1 AND 20000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_content');
  END IF;
  SELECT COALESCE(array_agg(btrim(k)) FILTER (WHERE btrim(k) <> ''), '{}') INTO v_points
  FROM unnest(COALESCE(p_key_points, '{}'::TEXT[])) k;
  IF cardinality(v_points) > 20 OR EXISTS (SELECT 1 FROM unnest(v_points) k WHERE length(k) > 300) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_content');
  END IF;
  -- Links only ever come from curated resources.
  IF v_title ~* 'https?://' OR v_summary ~* 'https?://'
     OR EXISTS (SELECT 1 FROM unnest(v_points) k WHERE k ~* 'https?://') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'urls_not_allowed');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;

  SELECT * INTO l FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF l.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'version_conflict', 'current_version', l.version);
  END IF;
  IF NOT public.admin_content_transition_ok(l.status, p_status) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_transition');
  END IF;

  IF l.title IS DISTINCT FROM v_title THEN v_changed := array_append(v_changed, 'title'); END IF;
  IF l.summary_md IS DISTINCT FROM v_summary THEN v_changed := array_append(v_changed, 'summary_md'); END IF;
  IF l.key_points IS DISTINCT FROM v_points THEN v_changed := array_append(v_changed, 'key_points'); END IF;
  IF l.status IS DISTINCT FROM p_status THEN v_changed := array_append(v_changed, 'status'); END IF;
  IF cardinality(v_changed) = 0 THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;

  INSERT INTO public.content_versions (content_type, content_id, version, snapshot, edited_by)
  VALUES ('lesson', l.id, l.version, to_jsonb(l), p_user_id);

  UPDATE public.lessons
  SET title = v_title, summary_md = v_summary, key_points = v_points, status = p_status,
      version = l.version + 1, updated_at = NOW()
  WHERE id = l.id;

  v_audit := public.admin_audit(p_user_id,
    CASE WHEN v_changed = ARRAY['status'] THEN 'lesson.status_changed' ELSE 'lesson.edited' END,
    'lesson', l.id, l.title, v_reason,
    jsonb_build_object('version', l.version, 'status', l.status, 'title', l.title),
    jsonb_build_object('version', l.version + 1, 'status', p_status, 'title', v_title, 'changed', to_jsonb(v_changed)));

  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'version', l.version + 1, 'status', p_status);
END;
$$;

-- Resources: status only (no creation, no URL edits). 'active' requires the last
-- link check to have passed (2xx/3xx), so a broken link can't be force-shown.
CREATE OR REPLACE FUNCTION public.admin_set_resource_status(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_resource_id TEXT, p_expected_version INT, p_status TEXT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_reason TEXT := public.admin_reason(p_reason);
  r public.learning_resources%ROWTYPE;
  v_audit BIGINT;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'reason_required'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('unverified', 'active', 'broken', 'retired') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_status');
  END IF;

  SELECT * INTO r FROM public.learning_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found'); END IF;
  IF r.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'version_conflict', 'current_version', r.version);
  END IF;
  IF r.status = p_status THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'no_change'); END IF;
  IF p_status = 'active' AND (r.last_checked IS NULL OR r.http_status IS NULL OR r.http_status NOT BETWEEN 200 AND 399) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'link_check_required');
  END IF;

  INSERT INTO public.content_versions (content_type, content_id, version, snapshot, edited_by)
  VALUES ('resource', r.id, r.version, to_jsonb(r), p_user_id);

  UPDATE public.learning_resources SET status = p_status, version = r.version + 1, updated_at = NOW()
  WHERE id = r.id;

  v_audit := public.admin_audit(p_user_id, 'resource.status_changed', 'resource', r.id, r.title, v_reason,
    jsonb_build_object('version', r.version, 'status', r.status),
    jsonb_build_object('version', r.version + 1, 'status', p_status));

  RETURN jsonb_build_object('ok', TRUE, 'audit_id', v_audit, 'version', r.version + 1, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_content_history(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT,
  p_content_type TEXT, p_content_id TEXT, p_limit INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_check TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_versions JSONB;
BEGIN
  v_check := public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint);
  IF v_check <> 'ok' THEN RETURN jsonb_build_object('ok', FALSE, 'error', v_check); END IF;
  IF p_content_type IS NULL OR p_content_type NOT IN ('lesson', 'resource') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_kind');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(v)::jsonb ORDER BY v.version DESC), '[]'::jsonb) INTO v_versions
  FROM (
    SELECT cv.version, cv.snapshot, cv.edited_by, u.email AS edited_by_email, cv.created_at
    FROM public.content_versions cv
    LEFT JOIN public.users_profile u ON u.id = cv.edited_by
    WHERE cv.content_type = p_content_type AND cv.content_id = p_content_id
    ORDER BY cv.version DESC LIMIT v_limit
  ) v;

  RETURN jsonb_build_object('ok', TRUE, 'versions', v_versions);
END;
$$;

-- 8. Grants ----------------------------------------------------------------------------
-- Helpers: never callable from a client.
REVOKE ALL ON FUNCTION public.admin_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_check_caller(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reason(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_like(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_content_transition_ok(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Session-checked admin RPCs (added to the SECURITY_CHECKLIST allow-list).
REVOKE ALL ON FUNCTION public.admin_list_users(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_plan(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit(UUID, TEXT, TEXT, INT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_scrape_health(UUID, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_content(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_lesson(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_resource_status(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_content_history(UUID, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_users(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(UUID, TEXT, TEXT, INT, BIGINT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_scrape_health(UUID, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_content(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lesson(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_resource_status(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_content_history(UUID, TEXT, TEXT, TEXT, TEXT, INT) TO anon, authenticated;
