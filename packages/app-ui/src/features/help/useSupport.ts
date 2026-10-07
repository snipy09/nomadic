import { useCallback, useEffect, useState } from 'react';
import { getApi, type FeedbackInput, type FeedbackResult, type TelemetryState } from '../../types';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function useFeedback(): {
  sending: boolean;
  result: FeedbackResult | null;
  error: string | null;
  send: (input: FeedbackInput) => Promise<boolean>;
  reset: () => void;
} {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = useCallback(async (input: FeedbackInput) => {
    const api = getApi();
    if (!api.sendFeedback) {
      setError('Sending feedback is not available in this build.');
      return false;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.sendFeedback(input);
      if (!res?.success) throw new Error(res?.error || 'Could not send your feedback.');
      setResult(res);
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not send your feedback.'));
      return false;
    } finally {
      setSending(false);
    }
  }, []);
  const reset = useCallback(() => { setResult(null); setError(null); }, []);
  return { sending, result, error, send, reset };
}

/** Crash-report consent from the main process (never assumed). */
export function useTelemetry(): {
  state: TelemetryState | null;
  saving: boolean;
  error: string | null;
  setEnabled: (v: boolean) => Promise<void>;
} {
  const [state, setState] = useState<TelemetryState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const api = getApi();
    if (!api.getTelemetry) return;
    let alive = true;
    api.getTelemetry().then((s) => { if (alive) setState(s); }).catch((e) => { if (alive) setError(errMsg(e, 'Could not read this setting.')); });
    return () => { alive = false; };
  }, []);
  const setEnabled = useCallback(async (v: boolean) => {
    const api = getApi();
    if (!api.setTelemetry) return;
    setSaving(true);
    setError(null);
    try {
      setState(await api.setTelemetry(v));
    } catch (e) {
      setError(errMsg(e, 'Could not save this setting.'));
    } finally {
      setSaving(false);
    }
  }, []);
  return { state, saving, error, setEnabled };
}
