-- 012: let the desktop app restore the user's learning goal after a reinstall.
-- Migration 007 stores tracks in user_tracks (written by learning_start_track)
-- but had no way to read them back; events already come back through
-- learning_pull_events. Same session check as the other learning RPCs.

CREATE OR REPLACE FUNCTION public.learning_get_tracks(
  p_user_id UUID, p_session_token TEXT, p_device_fingerprint TEXT
) RETURNS TABLE (
  track_id TEXT, status TEXT, horizon_months SMALLINT, daily_hours SMALLINT,
  started_at TIMESTAMPTZ, archived_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.learning_session_ok(p_user_id, p_session_token, p_device_fingerprint) THEN RETURN; END IF;
  RETURN QUERY
    SELECT t.track_id, t.status, t.horizon_months, t.daily_hours, t.started_at, t.archived_at
    FROM public.user_tracks t
    WHERE t.user_id = p_user_id
    ORDER BY (t.status = 'active') DESC, t.started_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_get_tracks(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.learning_get_tracks(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
