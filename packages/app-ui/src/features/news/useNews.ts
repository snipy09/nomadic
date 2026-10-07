import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type NewsResult } from '../../types';

export interface NewsState {
  data: NewsResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Loads the News page; stale responses are dropped and failures surface as `error` with a retry. */
export function useNews(): NewsState {
  const [data, setData] = useState<NewsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    const id = ++req.current;
    const api = getApi();
    setLoading(true);
    (async () => {
      try {
        if (!api.getNews) throw new Error('News is not available in this build.');
        const res = await api.getNews();
        if (id !== req.current) return;
        if (!res.success) throw new Error(res.error || 'Could not load the news.');
        setData(res);
        setError(null);
      } catch (e) {
        if (id !== req.current) return;
        setError(e instanceof Error ? e.message : 'Could not load the news.');
      } finally {
        if (id === req.current) setLoading(false);
      }
    })();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, refresh };
}
