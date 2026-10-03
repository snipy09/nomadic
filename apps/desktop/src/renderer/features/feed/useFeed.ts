import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type Job } from '../../types';
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
}

const SERVER_TABS = new Set<FeedTab>(['all', 'jobs', 'internships', 'internshala', 'remote']);

/** Current feed page + saved jobs from the desktop API. Stale responses are dropped; failures surface as `error`. */
export function useFeed(q: FeedQuery): FeedData {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saved, setSaved] = useState<Job[]>([]);
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
        let pageJobs: Job[] = [];
        let count = 0;
        if (q.tab !== 'saved') {
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
          count = savedJobs.length;
        }
        if (id !== reqId.current) return;
        setSaved(savedJobs);
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

  return { jobs, saved, total, loading, error, refresh: () => setNonce((n) => n + 1), isSaved, toggleSave };
}
