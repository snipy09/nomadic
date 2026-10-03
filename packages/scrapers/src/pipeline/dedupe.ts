import { validateCanonicalJobUrl } from '../canonical-link-guard.ts';
import type { Job } from './schema.ts';

/** Cross-source deduplication by (company + title + location) and canonical URL. */

const TRACKING_PARAMS = /^(utm_\w+|ref|refs|source|src|gh_src|gh_jid|lever-source|lever-origin|fbclid|gclid|mc_\w+|trk|trackingid|from|view)$/i;

/** Canonical URL used for dedupe: lower-case host, no tracking params, no hash, no trailing slash, no `/apply`. */
export function canonicalizeUrl(rawUrl: string): string {
  const guard = validateCanonicalJobUrl(rawUrl);
  const base = guard.cleanUrl || rawUrl;
  try {
    const u = new URL(base);
    u.hash = '';
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/(apply|application)$/i, '') || '/';
    return u.toString().replace(/\/$/, '');
  } catch {
    return base.trim().toLowerCase();
  }
}

const COMPANY_SUFFIX = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|gmbh|plc|technologies|technology|labs|hq)\b\.?/g;

export function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((m|f|d|w)\/(m|f|d|w)(\/(m|f|d|w))?\)/g, ' ')
    .replace(/\b(sr)\b\.?/g, 'senior')
    .replace(/\b(jr)\b\.?/g, 'junior')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(location: string, remote: boolean): string {
  const loc = location
    .toLowerCase()
    .replace(/bengaluru/g, 'bangalore')
    .replace(/gurugram/g, 'gurgaon')
    .replace(/\b(remote|anywhere|worldwide|global|work from home|wfh|unspecified)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Only the first locality matters for dedupe ("Bangalore, Karnataka, India" ~ "Bangalore").
  const first = loc.split(' ').slice(0, 1).join(' ');
  return `${remote ? 'remote:' : ''}${first}`;
}

export function jobContentKey(job: Pick<Job, 'company' | 'title' | 'location' | 'remote'>): string {
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${normalizeLocation(job.location, job.remote)}`;
}

export interface DedupeResult<T> {
  kept: T[];
  duplicates: Array<{ job: T; duplicateOf: T; reason: 'canonical_url' | 'content' | 'source_id' }>;
}

/**
 * Deduplicates jobs. When two jobs collide, the one with the lower tier wins,
 * then the richer record (salary, posted date, description), then input order.
 * Input order is deterministic (source registry order), so winners are stable
 * across runs and the upsert/expire logic does not flap.
 */
export function dedupeJobs<T extends Job>(jobs: T[]): DedupeResult<T> {
  const richness = (j: T) =>
    (j.salaryMin !== null ? 2 : 0) + (j.postedAt ? 1 : 0) + (j.description.length > 200 ? 1 : 0) + (j.location ? 1 : 0);
  const better = (a: T, b: T) => (a.tier !== b.tier ? a.tier < b.tier : richness(a) > richness(b));

  const byId = new Map<string, number>();
  const byUrl = new Map<string, number>();
  const byContent = new Map<string, number>();
  const slots: Array<T | null> = [];
  const duplicates: DedupeResult<T>['duplicates'] = [];

  for (const job of jobs) {
    const idKey = `${job.source}|${job.sourceJobId}`;
    const urlKey = canonicalizeUrl(job.applyUrl);
    const contentKey = jobContentKey(job);

    let reason: 'canonical_url' | 'content' | 'source_id' | null = null;
    let idx: number | undefined;
    if ((idx = byId.get(idKey)) !== undefined) reason = 'source_id';
    else if ((idx = byUrl.get(urlKey)) !== undefined) reason = 'canonical_url';
    else if ((idx = byContent.get(contentKey)) !== undefined) reason = 'content';

    if (idx === undefined || reason === null) {
      slots.push(job);
      const at = slots.length - 1;
      byId.set(idKey, at);
      byUrl.set(urlKey, at);
      byContent.set(contentKey, at);
      continue;
    }

    const existing = slots[idx] as T;
    if (better(job, existing)) {
      slots[idx] = job;
      duplicates.push({ job: existing, duplicateOf: job, reason });
    } else {
      duplicates.push({ job, duplicateOf: existing, reason });
    }
    // Index the loser's keys too so a third copy is caught by any of them.
    byId.set(idKey, idx);
    byUrl.set(urlKey, idx);
    byContent.set(contentKey, idx);
  }

  return { kept: slots.filter((j): j is T => j !== null), duplicates };
}
