import type { JobCandidate } from '../job-schema.js';
import { cleanText, detectWorkplace, htmlToText, normalizeEmploymentType, toIsoDate, toNumberOrNull } from '../pipeline/normalize.js';
import type { FetchLike } from './ats.js';

/**
 * Adzuna's official job search API for India (https://developer.adzuna.com). Needs a free app id and key
 * (ADZUNA_APP_ID, ADZUNA_APP_KEY); the source is skipped without them. Their terms ask for "Jobs by Adzuna"
 * credit and a licence for ongoing commercial use after the trial. Default limits are 25 calls a minute and 250 a
 * day, so calls are spaced 2.6 s apart and capped per run (ADZUNA_MAX_CALLS, default 40).
 * Salaries Adzuna estimates itself (salary_is_predicted = 1) are dropped: only stated salaries are kept.
 */

export const ADZUNA_ENV = ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'] as const;

/** What to ask for: categories that hold student and early-career roles, then keyword searches. */
export const ADZUNA_QUERIES: { category?: string; what?: string }[] = [
  { category: 'it-jobs' },
  { category: 'graduate-jobs' },
  { category: 'engineering-jobs' },
  { what: 'intern' },
  { what: 'fresher' },
  { what: 'graduate trainee' },
];

export function normalizeAdzunaJob(item: any, now = new Date()): JobCandidate | null {
  const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
  const title = htmlToText(item?.title, 300);
  const url = typeof item?.redirect_url === 'string' ? item.redirect_url : '';
  const company = cleanText(item?.company?.display_name);
  if (!id || !title || !url || !company) return null;
  const location = cleanText(item?.location?.display_name);
  const { workplaceType, remote } = detectWorkplace(null, location, title);
  const stated = String(item?.salary_is_predicted ?? '1') === '0';
  const min = stated ? toNumberOrNull(item?.salary_min) : null;
  const max = stated ? toNumberOrNull(item?.salary_max) : null;
  const hint = [item?.contract_time, item?.contract_type].filter(Boolean).join(' ');
  return {
    source: 'adzuna',
    sourceJobId: id,
    title,
    company,
    location,
    remote,
    workplaceType,
    salaryMin: min,
    salaryMax: max !== null && min !== null && max < min ? null : max,
    salaryCurrency: min !== null || max !== null ? 'INR' : null,
    salaryPeriod: min !== null || max !== null ? 'year' : null,
    employmentType: normalizeEmploymentType(hint || null, title),
    postedAt: toIsoDate(item?.created, now),
    applyUrl: url,
    description: htmlToText(item?.description, 4000),
    raw: { id },
  };
}

export interface AdzunaOptions {
  appId: string;
  appKey: string;
  maxCalls: number;
  pagesPerQuery: number;
  now: Date;
  warn: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
}

export async function fetchAdzuna(fetchImpl: FetchLike, options: AdzunaOptions): Promise<JobCandidate[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const gap = options.gapMs ?? 2600;
  const out = new Map<string, JobCandidate>();
  let calls = 0;
  let failures = 0;
  outer: for (const q of ADZUNA_QUERIES) {
    for (let page = 1; page <= options.pagesPerQuery; page++) {
      if (calls >= options.maxCalls) {
        options.warn(`stopped at ${options.maxCalls} calls (ADZUNA_MAX_CALLS)`);
        break outer;
      }
      const params = new URLSearchParams({
        app_id: options.appId,
        app_key: options.appKey,
        results_per_page: '50',
        max_days_old: '30',
        sort_by: 'date',
        'content-type': 'application/json',
      });
      if (q.what) params.set('what', q.what);
      const path = q.category ? `${page}?category=${encodeURIComponent(q.category)}&` : `${page}?`;
      if (calls > 0) await sleep(gap);
      calls++;
      const res = await fetchImpl(`https://api.adzuna.com/v1/api/jobs/in/search/${path}${params}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        failures++;
        // 401/403: wrong key; 429: daily limit. Neither gets better by asking again this run.
        if ([401, 403, 429].includes(res.status)) throw new Error(`HTTP ${res.status} from Adzuna (check ADZUNA_APP_ID/KEY or the daily limit)`);
        options.warn(`${q.category ?? q.what} page ${page}: HTTP ${res.status}`);
        break;
      }
      const data: any = await res.json();
      const items: any[] = Array.isArray(data?.results) ? data.results : [];
      for (const item of items) {
        const job = normalizeAdzunaJob(item, options.now);
        if (job) out.set(job.sourceJobId, job);
      }
      if (items.length < 50) break;
    }
  }
  if (calls > 0 && failures === calls) throw new Error('every Adzuna call failed');
  return [...out.values()];
}
