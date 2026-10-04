import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type Application } from '../../types';
import { withStatus, type NewApplicationDraft } from './applicationsLogic';

export interface ApplicationsData {
  apps: Application[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Optimistic; rolled back on failure. Resolves false on failure. */
  move: (app: Application, status: string) => Promise<boolean>;
  saveNotes: (app: Application, notes: string) => Promise<boolean>;
  /** YYYY-MM-DD or null to clear. Optimistic; rolled back on failure. */
  setFollowUp: (app: Application, followUpAt: string | null) => Promise<boolean>;
  /** Optimistic; rolled back on failure. */
  remove: (app: Application) => Promise<boolean>;
  add: (draft: NewApplicationDraft) => Promise<{ ok: boolean; error?: string }>;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Applications from the local DB via the desktop API. Stale responses are dropped; failures surface as `error`. */
export function useApplications(): ApplicationsData {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    (async () => {
      try {
        const rows = await getApi().getApplications();
        if (id !== reqId.current) return;
        setApps(Array.isArray(rows) ? rows : []);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(errMsg(e, 'Applications are unavailable.'));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const replace = (id: number | undefined, next: Application) =>
    setApps((prev) => prev.map((a) => (a.id === id ? next : a)));

  const move = useCallback(async (app: Application, status: string) => {
    if (app.id === undefined || app.status === status) return true;
    const prev = appsRef.current.find((a) => a.id === app.id) ?? app;
    replace(app.id, withStatus(prev, status, new Date().toISOString()));
    try {
      const res = await getApi().updateApplicationStatus(app.id, status);
      if (!res || res.success === false) throw new Error(res?.error || 'Status not saved.');
      if (res.application) replace(app.id, res.application);
      return true;
    } catch {
      replace(app.id, prev);
      return false;
    }
  }, []);

  const saveNotes = useCallback(async (app: Application, notes: string) => {
    if (app.id === undefined) return false;
    try {
      const res = await getApi().updateApplicationNotes(app.id, notes);
      if (!res || res.success === false) throw new Error(res?.error || 'Notes not saved.');
      replace(app.id, res.application ?? { ...app, notes });
      return true;
    } catch {
      return false;
    }
  }, []);

  const setFollowUp = useCallback(async (app: Application, followUpAt: string | null) => {
    const api = getApi();
    if (app.id === undefined || !api.updateApplicationFollowUp) return false;
    const prev = appsRef.current.find((a) => a.id === app.id) ?? app;
    replace(app.id, { ...prev, follow_up_at: followUpAt });
    try {
      const res = await api.updateApplicationFollowUp(app.id, followUpAt);
      if (!res || res.success === false) throw new Error(res?.error || 'Follow-up not saved.');
      if (res.application) replace(app.id, res.application);
      return true;
    } catch {
      replace(app.id, prev);
      return false;
    }
  }, []);

  const remove = useCallback(async (app: Application) => {
    if (app.id === undefined) return false;
    const snapshot = appsRef.current;
    setApps((prev) => prev.filter((a) => a.id !== app.id));
    try {
      const res = await getApi().deleteApplication(app.id);
      if (!res || res.success === false) throw new Error(res?.error || 'Not deleted.');
      return true;
    } catch {
      // Restore at its original position unless a reload replaced the list meanwhile.
      setApps((prev) => (prev.some((a) => a.id === app.id) ? prev : snapshot.filter((a) => a.id === app.id || prev.some((p) => p.id === a.id))));
      return false;
    }
  }, []);

  const add = useCallback(async (d: NewApplicationDraft) => {
    try {
      const res = await getApi().saveApplication({
        company: d.company.trim(),
        title: d.title.trim(),
        apply_url: d.url.trim() || undefined,
        status: d.status,
        mode: 'manual',
        notes: d.notes.trim() || undefined,
      });
      if (!res || res.success === false) return { ok: false, error: res?.error || 'The application was not saved.' };
      refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e, 'The application was not saved.') };
    }
  }, [refresh]);

  return { apps, loading, error, refresh, move, saveNotes, setFollowUp, remove, add };
}
