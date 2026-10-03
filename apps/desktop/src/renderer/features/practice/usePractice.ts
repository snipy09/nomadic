import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticeAttempt } from '@job-automator/learning';
import type { PracticeCatalog, PracticeRecordResult } from '../../../shared/ipc';
import { getApi } from '../../types';

export interface PracticeData {
  catalog: PracticeCatalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  attempts: PracticeAttempt[];
  /** Server count of today's practice attempts; null when unknown. */
  usedToday: number | null;
  signedIn: boolean;
  syncError: string | null;
  /** Set once the server refused an attempt for the daily limit. */
  limitReached: boolean;
  record: (attempt: PracticeAttempt) => Promise<PracticeRecordResult>;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Catalog and attempt log from the main process. Attempts are only kept after the server accepts them. */
export function usePractice(): PracticeData {
  const [catalog, setCatalog] = useState<PracticeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    (async () => {
      const api = getApi();
      try {
        const [cat, st] = await Promise.all([api.practiceGetCatalog(), api.practiceGetState().catch(() => null)]);
        if (!live) return;
        if (!cat || cat.success !== true) throw new Error(cat?.success === false ? cat.error : 'The practice question sets did not load.');
        setCatalog(cat.catalog);
        if (st && st.success) {
          setAttempts(st.state.attempts);
          setUsedToday(st.state.usedToday);
          setSignedIn(st.state.signedIn);
          setSyncError(st.state.syncError ?? null);
        } else {
          setSyncError(st && !st.success ? st.error : 'Your practice history could not be loaded.');
        }
      } catch (e) {
        if (live) setError(errMsg(e, 'The practice question sets did not load.'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const record = useCallback(async (attempt: PracticeAttempt): Promise<PracticeRecordResult> => {
    let res: PracticeRecordResult;
    try {
      res = await getApi().practiceRecordAttempt(attempt);
    } catch (e) {
      res = { success: false, code: 'network', error: errMsg(e, 'The attempt was not saved.') };
    }
    if (!mounted.current) return res;
    if (res.success) {
      const saved = res.attempt;
      setAttempts((prev) => (prev.some((a) => a.id === saved.id) ? prev : [saved, ...prev]));
      if (res.usedToday !== null) setUsedToday(res.usedToday);
    } else if (res.code === 'daily_limit') {
      setLimitReached(true);
    }
    return res;
  }, []);

  return { catalog, loading, error, retry, attempts, usedToday, signedIn, syncError, limitReached, record };
}
