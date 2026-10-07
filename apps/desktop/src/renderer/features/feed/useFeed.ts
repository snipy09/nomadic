import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type HiddenJob, type Job } from '../../types';
import { dedupeJobs, type FeedTab } from './feedLogic';

export interface FeedQuery {
  page: number;
  pageSize: number;
  search: string;
  tab: FeedTab;
  source: string;
}

export interface FeedData {
  jobs: Job[];
  saved: Job[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isSaved: (job: Job) => boolean;
  toggleSave: (job: Job) => Promise<boolean>;
  /** Jobs marked "Not interested" (newest first); never shown in the other tabs. */
  hidden: HiddenJob[];
  hide: (job: Job) => Promise<boolean>;
  unhide: (applyUrl: string) => Promise<boolean>;
}

const SERVER_TABS = new Set<FeedTab>(['all', 'jobs', 'internships', 'internshala', 'remote']);

/** Saved and hidden jobs come from the account too (the phone and the desktop share them); pull at most this often. */
export const ACCOUNT_PULL_MIN_MS = 2 * 60_000;
let lastAccountPull = 0;

/** Pulls the account's saved/hidden jobs into this device, throttled. Resolves true when it pulled. */
export async function pullAccountJobs(now = Date.now()): Promise<boolean> {
  if (now - lastAccountPull < ACCOUNT_PULL_MIN_MS) return false;
  lastAccountPull = now;
  const api = getApi();
  if (!api.syncCloudData) return false;
  try {
    const res = await api.syncCloudData();
    return Boolean(res?.success);
  } catch {
    return false;
  }
}

/** For tests. */
export function resetAccountPullThrottle(): void {
  lastAccountPull = 0;
}

/** Current feed page + saved jobs from the desktop API. Stale responses are dropped; failures surface as `error`. */
export function useFeed(q: FeedQuery): FeedData {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saved, setSaved] = useState<Job[]>([]);
  const [hidden, setHidden] = useState<HiddenJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const api = getApi();
    setLoading(true);
    (async () => {
      try {
        const savedJobs = (await api.getSavedJobs?.()) ?? [];
        const hiddenJobs = (await api.getHiddenJobs?.()) ?? [];
        let pageJobs: Job[] = [];
        let count = 0;
        if (q.tab !== 'saved' && q.tab !== 'hidden') {
          const tab = SERVER_TABS.has(q.tab) ? q.tab : 'all';
          if (api.getCloudFeedPage) {
            const res = await api.getCloudFeedPage({ page: q.page, pageSize: q.pageSize, search: q.search, filterTab: tab, source: q.source === 'all' ? undefined : q.source });
            if (!res.success) throw new Error(res.error || 'The job feed is unavailable.');
            pageJobs = dedupeJobs(res.jobs ?? []);
            count = res.totalCount ?? pageJobs.length;
          } else {
            const res = await api.getCloudFeed('candidate');
            if (!res.success) throw new Error(res.error || 'The job feed is unavailable.');
            pageJobs = dedupeJobs(res.jobs ?? []);
            count = pageJobs.length;
          }
        } else {
          count = q.tab === 'saved' ? savedJobs.length : hiddenJobs.length;
        }
        if (id !== reqId.current) return;
        setSaved(savedJobs);
        setHidden(hiddenJobs);
        setJobs(pageJobs);
        setTotal(count);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : 'The job feed is unavailable.');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [q.page, q.pageSize, q.search, q.tab, q.source, nonce]);

  // Jobs saved on the other device show up here: pull on open, when the Saved tab opens and when the window
  // comes back to the front (throttled), then reload the lists.
  useEffect(() => {
    const pull = () => {
      void pullAccountJobs().then((pulled) => {
        if (pulled) setNonce((n) => n + 1);
      });
    };
    pull();
    const onFocus = () => pull();
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useEffect(() => {
    if (q.tab !== 'saved') return;
    void pullAccountJobs().then((pulled) => {
      if (pulled) setNonce((n) => n + 1);
    });
  }, [q.tab]);

  const isSaved = useCallback((job: Job) => saved.some((s) => s.applyUrl === job.applyUrl), [saved]);

  const toggleSave = useCallback(async (job: Job) => {
    const api = getApi();
    const wasSaved = saved.some((s) => s.applyUrl === job.applyUrl);
    // Optimistic, rolled back on failure.
    setSaved((prev) => (wasSaved ? prev.filter((s) => s.applyUrl !== job.applyUrl) : [...prev, job]));
    try {
      const res = wasSaved ? await api.removeSavedJob(job.applyUrl) : await api.saveJob(job);
      if (res && res.success === false) throw new Error(res.error);
      return true;
    } catch {
      setSaved((prev) => (wasSaved ? [...prev, job] : prev.filter((s) => s.applyUrl !== job.applyUrl)));
      return false;
    }
  }, [saved]);

  const hide = useCallback(async (job: Job) => {
    const api = getApi();
    if (!api.hideJob) return false;
    const entry: HiddenJob = { applyUrl: job.applyUrl, title: job.title ?? '', company: job.company ?? '', hiddenAt: new Date().toISOString() };
    setHidden((prev) => [entry, ...prev.filter((h) => h.applyUrl !== job.applyUrl)]);
    try {
      const res = await api.hideJob({ applyUrl: job.applyUrl, title: job.title, company: job.company });
      if (!res?.success) throw new Error(res?.error);
      return true;
    } catch {
      setHidden((prev) => prev.filter((h) => h.applyUrl !== job.applyUrl));
      return false;
    }
  }, []);

  const unhide = useCallback(async (applyUrl: string) => {
    const api = getApi();
    if (!api.unhideJob) return false;
    const before = hidden;
    setHidden((prev) => prev.filter((h) => h.applyUrl !== applyUrl));
    try {
      const res = await api.unhideJob(applyUrl);
      if (!res?.success) throw new Error(res?.error);
      return true;
    } catch {
      setHidden(before);
      return false;
    }
  }, [hidden]);

  return { jobs, saved, total, loading, error, refresh: () => setNonce((n) => n + 1), isSaved, toggleSave, hidden, hide, unhide };
}
