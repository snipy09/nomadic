import { useCallback, useEffect, useState } from 'react';
import { getApi, type UpdateChannel, type UpdatePolicyResult, type UpdaterInfo, type WhatsNewInfo } from '../../types';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export interface UpdaterState {
  info: UpdaterInfo | null;
  error: string | null;
  available: boolean;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  setChannel: (c: UpdateChannel) => Promise<void>;
}

/** Live updater status from the main process (push events plus explicit actions). */
export function useUpdater(): UpdaterState {
  const api = getApi();
  const available = Boolean(api.updaterGetStatus);
  const [info, setInfo] = useState<UpdaterInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = getApi();
    if (!a.updaterGetStatus) return;
    let alive = true;
    a.updaterGetStatus().then((s) => { if (alive) setInfo(s); }).catch((e) => { if (alive) setError(errMsg(e, 'Could not read update status.')); });
    const off = a.onUpdaterStatus?.((s) => setInfo((prev) => ({ channel: prev?.channel ?? 'stable', ...s })));
    return () => { alive = false; off?.(); };
  }, []);

  const run = useCallback(async (fn: () => Promise<UpdaterInfo> | undefined, fallback: string) => {
    setError(null);
    try {
      const next = await fn();
      if (next) setInfo(next);
    } catch (e) {
      setError(errMsg(e, fallback));
    }
  }, []);

  const check = useCallback(() => run(() => getApi().updaterCheck?.(), 'Could not check for updates.'), [run]);
  const download = useCallback(() => run(() => getApi().updaterDownload?.(), 'Could not download the update.'), [run]);
  const setChannel = useCallback((c: UpdateChannel) => run(() => getApi().updaterSetChannel?.(c), 'Could not change the update channel.'), [run]);
  const install = useCallback(async () => {
    setError(null);
    try {
      const res = await getApi().updaterInstall?.();
      if (res && !res.success) setError(res.error || 'Could not install the update.');
    } catch (e) {
      setError(errMsg(e, 'Could not install the update.'));
    }
  }, []);

  return { info, error, available, check, download, install, setChannel };
}

/** Whether this version is below the forced-update floor. Unknown never blocks. */
export function useUpdatePolicy(): UpdatePolicyResult | null {
  const [policy, setPolicy] = useState<UpdatePolicyResult | null>(null);
  useEffect(() => {
    const a = getApi();
    if (!a.getUpdatePolicy) return;
    let alive = true;
    a.getUpdatePolicy().then((p) => { if (alive) setPolicy(p); }).catch(() => { /* unknown: do not block */ });
    return () => { alive = false; };
  }, []);
  return policy;
}

/** "What's new" after an update; shown once. */
export function useWhatsNew(): { info: WhatsNewInfo | null; dismiss: () => void } {
  const [info, setInfo] = useState<WhatsNewInfo | null>(null);
  useEffect(() => {
    const a = getApi();
    if (!a.getWhatsNew) return;
    let alive = true;
    a.getWhatsNew().then((w) => { if (alive && w?.show) setInfo(w); }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);
  const dismiss = useCallback(() => {
    setInfo(null);
    void getApi().dismissWhatsNew?.();
  }, []);
  return { info, dismiss };
}
