import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../../types';
import type { RememberedAnswer } from '../../../shared/ipc';

type Status = 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * Answers remembered on this computer from apply reviews. Edits are optimistic and roll back
 * when the main process refuses them.
 */
export function useRememberedAnswers() {
  const [items, setItems] = useState<RememberedAnswer[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api?.listRememberedAnswers) {
      setStatus('unavailable');
      return;
    }
    const mine = ++seq.current;
    setStatus('loading');
    setError(null);
    try {
      const list = await api.listRememberedAnswers();
      if (mine !== seq.current) return;
      setItems(Array.isArray(list) ? list : []);
      setStatus('ready');
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : 'Could not load remembered answers.');
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = useCallback(async (key: string, answer: string | null): Promise<boolean> => {
    const api = getApi();
    if (!api?.updateRememberedAnswer) return false;
    const before = items;
    setItems((list) => (answer === null ? list.filter((i) => i.key !== key) : list.map((i) => (i.key === key ? { ...i, answer } : i))));
    try {
      const res = await api.updateRememberedAnswer({ key, answer });
      if (!res.success) throw new Error(res.error || 'Could not change this answer.');
      return true;
    } catch (e) {
      setItems(before);
      setError(e instanceof Error ? e.message : 'Could not change this answer.');
      return false;
    }
  }, [items]);

  const clearAll = useCallback(async (): Promise<boolean> => {
    const api = getApi();
    if (!api?.clearRememberedAnswers) return false;
    const before = items;
    setItems([]);
    try {
      const res = await api.clearRememberedAnswers();
      if (!res.success) throw new Error(res.error || 'Could not clear remembered answers.');
      return true;
    } catch (e) {
      setItems(before);
      setError(e instanceof Error ? e.message : 'Could not clear remembered answers.');
      return false;
    }
  }, [items]);

  return { items, status, error, reload: load, update, clearAll, clearError: () => setError(null) };
}
