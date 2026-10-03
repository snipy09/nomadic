import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type LearningEventInput, type LearningEventRecord, type LearningGoal, type LearningGoalInput } from '../../types';

export interface LearningData {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  goal: LearningGoal | null;
  events: LearningEventRecord[];
  /** Events saved on this device that the server has not accepted yet. */
  pendingSync: number;
  reload: () => void;
  saveGoal: (goal: LearningGoalInput) => Promise<{ ok: boolean; error?: string }>;
  /** Appends events; state updates only after the main process stored them. */
  record: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Learn state from the desktop API: the goal and the append-only event log. Syncs once on mount. */
export function useLearning(): LearningData {
  const [status, setStatus] = useState<LearningData['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [events, setEvents] = useState<LearningEventRecord[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);
  const synced = useRef(false);

  useEffect(() => {
    const id = ++reqId.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    (async () => {
      try {
        const state = await getApi().learningGetState();
        if (id !== reqId.current) return;
        setGoal(state.goal);
        setEvents(Array.isArray(state.events) ? state.events : []);
        setPendingSync(state.pendingSync ?? 0);
        setError(null);
        setStatus('ready');
      } catch (e) {
        if (id !== reqId.current) return;
        setError(errMsg(e, 'Your learning progress could not be loaded.'));
        setStatus('error');
      }
    })();
  }, [nonce]);

  // Pull progress from other devices once; reload only when something new arrived.
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    getApi().learningSync?.()
      .then((r) => { if (r && (r.pulled > 0 || r.pushed > 0)) setNonce((n) => n + 1); })
      .catch(() => {});
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const saveGoal = useCallback(async (input: LearningGoalInput) => {
    try {
      const res = await getApi().learningSaveGoal(input);
      if (!res?.success || !res.goal) throw new Error(res?.error || 'Your goal was not saved.');
      setGoal(res.goal);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e, 'Your goal was not saved.') };
    }
  }, []);

  const record = useCallback(async (input: LearningEventInput[]) => {
    if (!input.length) return { ok: true };
    try {
      const res = await getApi().learningRecordEvents(input);
      if (!res?.success) throw new Error(res?.error || 'Your progress was not saved.');
      const stored = res.events ?? [];
      setEvents((prev) => {
        const known = new Set(prev.map((e) => e.id));
        return [...prev, ...stored.filter((e) => !known.has(e.id))];
      });
      setPendingSync((n) => n + stored.length);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e, 'Your progress was not saved.') };
    }
  }, []);

  return { status, error, goal, events, pendingSync, reload, saveGoal, record };
}
