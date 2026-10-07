import { useEffect, useRef, useState } from 'react';
import { getApi, type AppUser, type HeartbeatStatus } from '../../types';

export interface StoredSession {
  userId: string;
  sessionToken: string;
  deviceFingerprint: string;
}

// Account ids are server UUIDs; anything else was saved by an older build and cannot be resumed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The server session saved with the signed-in user, or null when it cannot be resumed. */
export function storedSession(user: AppUser | null): StoredSession | null {
  if (!user) return null;
  const u = user as AppUser & { sessionToken?: unknown; deviceFingerprint?: unknown };
  const userId = user.id != null ? String(user.id) : '';
  const sessionToken = typeof u.sessionToken === 'string' ? u.sessionToken : '';
  const deviceFingerprint = typeof u.deviceFingerprint === 'string' ? u.deviceFingerprint : '';
  if (!UUID.test(userId) || !sessionToken || !deviceFingerprint) return null;
  return { userId, sessionToken, deviceFingerprint };
}

/**
 * The main process keeps the session in memory only. After a restart this hands the saved session back to it
 * (the heartbeat then checks it with the server) and signs out when the server ends the session.
 * Returns false until the saved session has been handed over, so screens do not call the server without one.
 */
export function useSessionRestore(
  currentUser: AppUser | null,
  onEnded: (reason?: string) => void,
  onStatus: (status: HeartbeatStatus) => void,
): boolean {
  // Only the user restored from storage at launch needs this; a fresh sign-in already started the session.
  const initialUser = useRef(currentUser);
  const [ready, setReady] = useState(() => !currentUser);
  const onEndedRef = useRef(onEnded);
  const onStatusRef = useRef(onStatus);
  onEndedRef.current = onEnded;
  onStatusRef.current = onStatus;

  useEffect(() => {
    const api = getApi();
    if (!api?.onHeartbeatStatus) return;
    return api.onHeartbeatStatus((status) => {
      onStatusRef.current(status);
      if (status.ended) onEndedRef.current(status.reason);
    });
  }, []);

  useEffect(() => {
    const user = initialUser.current;
    if (!user) return;
    // The browser preview (no preload bridge) has no server session to resume.
    const w = window as unknown as { api?: unknown; electronAPI?: unknown };
    if (!w.api && !w.electronAPI) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const saved = storedSession(user);
    const api = getApi();
    if (!saved) {
      onEndedRef.current('your saved session could not be resumed');
      setReady(true);
      return;
    }
    if (!api?.startHeartbeat) {
      setReady(true);
      return;
    }
    Promise.resolve(api.startHeartbeat(saved.userId, saved.sessionToken, saved.deviceFingerprint))
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  return ready || !currentUser;
}
