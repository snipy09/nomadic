import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../../types';
import type { DbHealth } from './dataSafetyLogic';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export interface DataHealthState {
  loading: boolean;
  error: string | null;
  health: DbHealth | null;
  backups: number;
  latestBackupAt: string | null;
  sizeBytes: number | null;
  refresh: () => void;
}

/** Local database health as reported by the main process at startup. */
export function useDataHealth(): DataHealthState {
  const [state, setState] = useState<Omit<DataHealthState, 'refresh'>>({
    loading: true, error: null, health: null, backups: 0, latestBackupAt: null, sizeBytes: null,
  });
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const api = getApi();
    const id = ++reqId.current;
    if (!api.getDataHealth) {
      setState((s) => ({ ...s, loading: false, error: 'Local data status is not available in this build.' }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    api.getDataHealth()
      .then((res) => {
        if (id !== reqId.current) return;
        if (!res?.success) throw new Error(res?.error || 'Could not read local data status.');
        setState({ loading: false, error: null, health: res.health, backups: res.backups, latestBackupAt: res.latestBackupAt, sizeBytes: res.sizeBytes });
      })
      .catch((e) => {
        if (id === reqId.current) setState((s) => ({ ...s, loading: false, error: errMsg(e, 'Could not read local data status.') }));
      });
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}

export type ActionState = { status: 'idle' | 'busy' | 'done' | 'error'; message: string | null };

const IDLE: ActionState = { status: 'idle', message: null };

export function useCopyDiagnostics(): { state: ActionState; text: string | null; copy: () => Promise<void> } {
  const [state, setState] = useState<ActionState>(IDLE);
  const [text, setText] = useState<string | null>(null);
  const copy = useCallback(async () => {
    const api = getApi();
    if (!api.copyDiagnostics) {
      setState({ status: 'error', message: 'Diagnostics are not available in this build.' });
      return;
    }
    setState({ status: 'busy', message: null });
    try {
      const res = await api.copyDiagnostics();
      if (!res?.success) throw new Error(res?.error || 'Could not collect diagnostics.');
      setText(res.text ?? null);
      setState({ status: 'done', message: 'Diagnostics copied. Paste them into your support email or bug report.' });
    } catch (e) {
      setState({ status: 'error', message: errMsg(e, 'Could not collect diagnostics.') });
    }
  }, []);
  return { state, text, copy };
}

export function useAccountExport(): { state: ActionState; exportData: () => Promise<void> } {
  const [state, setState] = useState<ActionState>(IDLE);
  const exportData = useCallback(async () => {
    const api = getApi();
    if (!api.exportAccountData) {
      setState({ status: 'error', message: 'Export is not available in this build.' });
      return;
    }
    setState({ status: 'busy', message: null });
    try {
      const res = await api.exportAccountData();
      if (res?.canceled) return setState(IDLE);
      if (!res?.success) throw new Error(res?.error || 'Export failed.');
      setState({
        status: 'done',
        message: res.serverIncluded
          ? `Saved to ${res.filePath}.`
          : `Saved to ${res.filePath}. Only data on this computer is included: your account's server copy could not be reached (the file says why).`,
      });
    } catch (e) {
      setState({ status: 'error', message: errMsg(e, 'Export failed.') });
    }
  }, []);
  return { state, exportData };
}

export function useAccountDeletion(onDeleted: () => void): {
  busy: boolean;
  error: string | null;
  remove: (confirmEmail: string, password: string) => Promise<boolean>;
  reset: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useCallback(async (confirmEmail: string, password: string) => {
    const api = getApi();
    if (!api.deleteAccount) {
      setError('Account deletion is not available in this build.');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.deleteAccount({ confirmEmail: confirmEmail.trim().toLowerCase(), password });
      if (!res?.success) throw new Error(res?.error || 'The account was not deleted.');
      onDeleted();
      return true;
    } catch (e) {
      setError(errMsg(e, 'The account was not deleted.'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [onDeleted]);
  const reset = useCallback(() => setError(null), []);
  return { busy, error, remove, reset };
}
