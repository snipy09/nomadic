import { useCallback, useEffect, useState } from 'react';
import { getApi, type ResumeRecord } from '../../types';

export interface ResumesState {
  resumes: ResumeRecord[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => Promise<void>;
  upload: (targetRole: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  makeDefault: (id: number) => Promise<void>;
}

/** Resume list backed by the desktop API (local DB). Every failure surfaces as `error`, never swallowed. */
export function useResumes(): ResumesState {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const api = getApi();
    if (!api?.getResumes) { setLoading(false); return; }
    try {
      setResumes((await api.getResumes()) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your resumes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (fn: () => Promise<{ success?: boolean; error?: string } | void>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.success === false) throw new Error(res.error || 'The action failed.');
      setError(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const upload = useCallback((targetRole: string) => run(async () => {
    const api = getApi();
    if (!api?.pickResumeFile || !api.saveResume) throw new Error('Resume upload is not available here.');
    const picked = await api.pickResumeFile();
    if (picked.canceled || !picked.filePath) return;
    const name = picked.fileName || picked.filePath.split(/[/\\]/).pop() || 'Resume.pdf';
    return api.saveResume({ name, targetRole: targetRole || 'General', filePath: picked.filePath, isDefault: resumes.length === 0 });
  }), [resumes.length, run]);

  const remove = useCallback((id: number) => run(async () => getApi()?.deleteResume?.(id)), [run]);
  const makeDefault = useCallback((id: number) => run(async () => getApi()?.setDefaultResume?.(id)), [run]);

  return { resumes, loading, busy, error, reload, upload, remove, makeDefault };
}
