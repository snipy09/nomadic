-- 010: applications tracker (F5).
-- Adds notes and an append-only status history to the synced applications log,
-- lets a status change be pushed without resetting the applied date, adds a
-- delete RPC, and returns the new columns from sync_pull_user_data so the
-- tracker survives a reinstall.
--
-- status_history is a JSON array of {"status": TEXT, "changed_at": ISO-8601}
-- written by the desktop app (local table application_status_history is the
-- source; the cloud copy is the backup used on restore).

ALTER TABLE public.user_applications ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.user_applications ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.user_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Push (insert or update) one application ------------------------------------
-- The old 8-argument version reset applied_at to NOW() on every push, so a
-- status change moved the application date. Replaced by a version with
-- optional notes, history and applied date that never touches applied_at on
-- conflict. NULL notes/history keep the stored value.
DROP FUNCTION IF EXISTS public.sync_push_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.sync_push_application(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_fingerprint TEXT,
    p_company TEXT,
    p_title TEXT,
    p_apply_url TEXT,
    p_status TEXT,
    p_mode TEXT,
    p_notes TEXT DEFAULT NULL,
    p_status_history JSONB DEFAULT NULL,
    p_applied_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;

    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;

    IF p_notes IS NOT NULL AND length(p_notes) > 10000 THEN
        RETURN QUERY SELECT FALSE, 'Notes are too long (10000 characters max).';
        RETURN;
    END IF;

    IF p_status_history IS NOT NULL AND (
        jsonb_typeof(p_status_history) <> 'array' OR jsonb_array_length(p_status_history) > 200
    ) THEN
        RETURN QUERY SELECT FALSE, 'Invalid status history.';
        RETURN;
    END IF;

    INSERT INTO public.user_applications (
        user_id, company, title, apply_url, status, mode, applied_at, notes, status_history, updated_at
    )
    VALUES (
        p_user_id, p_company, p_title, p_apply_url,
        COALESCE(p_status, 'applied'), COALESCE(p_mode, 'autonomous'),
        COALESCE(p_applied_at, NOW()), p_notes, COALESCE(p_status_history, '[]'::jsonb), NOW()
    )
    ON CONFLICT (user_id, apply_url) DO UPDATE SET
        company = EXCLUDED.company,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        mode = EXCLUDED.mode,
        notes = COALESCE(p_notes, public.user_applications.notes),
        status_history = COALESCE(p_status_history, public.user_applications.status_history),
        updated_at = NOW();

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- Delete one application -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_delete_application(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_fingerprint TEXT,
    p_apply_url TEXT
)
RETURNS TABLE (ok BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;

    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.';
        RETURN;
    END IF;

    DELETE FROM public.user_applications
    WHERE user_id = p_user_id
      AND apply_url = p_apply_url;

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- Pull: same signature as 003, applications now include notes, history and updated_at.
CREATE OR REPLACE FUNCTION public.sync_pull_user_data(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_fingerprint TEXT
)
RETURNS TABLE (
    ok BOOLEAN,
    error TEXT,
    profile JSONB,
    applications JSONB,
    saved_jobs JSONB,
    resumes JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_valid BOOLEAN;
    v_profile JSONB;
    v_apps JSONB;
    v_saved JSONB;
    v_resumes JSONB;
BEGIN
    SELECT is_active INTO v_is_valid
    FROM public.user_sessions
    WHERE session_token = p_session_token
      AND user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
    LIMIT 1;

    IF NOT FOUND OR v_is_valid = FALSE THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: Active session required.', NULL::JSONB, NULL::JSONB, NULL::JSONB, NULL::JSONB;
        RETURN;
    END IF;

    SELECT to_jsonb(p) INTO v_profile
    FROM public.user_cloud_profiles p
    WHERE p.user_id = p_user_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_apps
    FROM (
        SELECT company, title, apply_url, status, mode, applied_at, notes, status_history, updated_at
        FROM public.user_applications
        WHERE user_id = p_user_id
        ORDER BY applied_at DESC
        LIMIT 500
    ) a;

    SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_saved
    FROM (
        SELECT title, company, apply_url, location, salary, source, score, description, saved_at
        FROM public.user_saved_jobs
        WHERE user_id = p_user_id
        ORDER BY saved_at DESC
    ) s;

    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_resumes
    FROM (
        SELECT name, target_role, file_path, resume_text, is_default, created_at
        FROM public.user_resumes
        WHERE user_id = p_user_id
        ORDER BY is_default DESC, created_at DESC
    ) r;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_profile, v_apps, v_saved, v_resumes;
END;
$$;

-- Grants (008 revokes EXECUTE by default; re-grant the anon-callable sync RPCs).
REVOKE ALL ON FUNCTION public.sync_push_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delete_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_pull_user_data(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_push_application(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_delete_application(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull_user_data(UUID, TEXT, TEXT) TO anon, authenticated;
