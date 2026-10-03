import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminResult } from '../../../shared/admin';

export interface AdminQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Server error code (e.g. 'forbidden', 'unauthorized'), for choosing the recovery action. */
  code: string | null;
  refresh: () => void;
}

/**
 * Runs an admin read whenever `key` changes (or on refresh). Stale responses are
 * dropped; a thrown call (IPC failure) becomes an error like a refused one.
 */
export function useAdminQuery<T>(load: () => Promise<AdminResult<T>>, key: string): AdminQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    (async () => {
      try {
        const res = await loadRef.current();
        if (id !== reqId.current) return;
        if (res && res.ok) {
          setData(res.data);
          setError(null);
          setCode(null);
        } else {
          setError(res?.error || 'The request failed.');
          setCode(res?.code ?? 'bad_response');
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error && e.message ? e.message : 'The request failed.');
        setCode('network');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, code, refresh };
}
