import { useEffect, useState } from 'react';
import { AppUpdateInfo, getApi } from '../../types';

const DISMISSED_KEY = 'nomadic_dismissed_update_version';

/** Checks once on mount for a newer release; returns it unless the user dismissed that version this session. */
export function useUpdateCheck(onLog?: (msg: string) => void): AppUpdateInfo | null {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  useEffect(() => {
    const api = getApi();
    if (!api || !api.checkForUpdates) return;
    let cancelled = false;
    api.checkForUpdates().then((res: AppUpdateInfo | undefined) => {
      if (cancelled || !res || !res.updateAvailable) return;
      let dismissed: string | null = null;
      try { dismissed = sessionStorage.getItem(DISMISSED_KEY); } catch { /* ignore */ }
      if (dismissed !== res.latestVersion) {
        setInfo(res);
        onLog?.(`[Updates] New version available: v${res.latestVersion}`);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return info;
}
