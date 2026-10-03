import type { Job } from '../../types';
import type { JobMatch } from './match';

export type FeedTab = 'all' | 'jobs' | 'internships' | 'internshala' | 'remote' | 'saved' | 'high_match';
export type SortKey = 'latest' | 'best_match' | 'company';
export type LocationFilter = 'all' | 'remote' | 'india';
export interface ScoredJob extends Job { match: JobMatch | null }

export const HIGH_MATCH = 70;
const INDIA = ['india', 'bengaluru', 'bangalore', 'mumbai', 'delhi', 'gurgaon', 'gurugram', 'noida', 'hyderabad', 'pune', 'chennai', 'kolkata', 'ahmedabad'];

const cleanUrl = (u?: string) => (u ?? '').split('?')[0].toLowerCase().trim();

export function dedupeJobs(list: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of list) {
    if (!j) continue;
    const url = cleanUrl(j.applyUrl);
    const key = j.jobHash || `${(j.company ?? '').toLowerCase().trim()}|${(j.title ?? '').toLowerCase().trim()}|${url}`;
    if (seen.has(key) || (url && seen.has(url))) continue;
    seen.add(key);
    if (url.length > 5) seen.add(url);
    out.push(j);
  }
  return out;
}

export const isRemote = (j: Job) => j.workplaceType === 'remote' || (j.location ?? '').toLowerCase().includes('remote');
export const isIndia = (j: Job) => INDIA.some((c) => (j.location ?? '').toLowerCase().includes(c));

export function filterAndSort(jobs: ScoredJob[], opts: { search: string; tab: FeedTab; location: LocationFilter; sort: SortKey }): ScoredJob[] {
  const q = opts.search.toLowerCase().trim();
  const out = jobs.filter((j) => {
    if (q && ![j.title, j.company, j.location, j.source, ...(j.match?.matched ?? [])].some((v) => (v ?? '').toLowerCase().includes(q))) return false;
    if (opts.tab === 'high_match' && (j.match?.score ?? 0) < HIGH_MATCH) return false;
    if (opts.location === 'remote' && !isRemote(j)) return false;
    if (opts.location === 'india' && !isIndia(j)) return false;
    return true;
  });
  const time = (j: Job) => (j.createdAt ? new Date(j.createdAt).getTime() || 0 : 0);
  const score = (j: ScoredJob) => j.match?.score ?? -1;
  return out.sort((a, b) => {
    if (opts.sort === 'best_match') return score(b) - score(a) || time(b) - time(a);
    if (opts.sort === 'company') return (a.company ?? '').localeCompare(b.company ?? '');
    return time(b) - time(a) || score(b) - score(a);
  });
}

/** Page numbers with '…' gaps, e.g. [1, '…', 4, 5, 6, '…', 20]. */
export function pageRange(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  const out: Array<number | '…'> = [1];
  if (left > 2) out.push('…');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function postedLabel(createdAt?: string, now = Date.now()): string | null {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (!t) return null;
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
