import { validateCanonicalJobUrl } from '../canonical-link-guard.ts';
import { CLOSED_JOB_PHRASES, resolveDirectFormUrl, toDirectFormUrl } from '../form-link-resolver.ts';
import type { Job } from './schema.ts';

/**
 * Link validation stage. Reuses the canonical link guard (no network) for every
 * job and the form-link resolver (HEAD/GET + closed-phrase scan) for the jobs
 * selected by `mode`.
 */

export type LinkStatus = 'verified' | 'unverified' | 'closed' | 'invalid';

export interface LinkCheckResult {
  status: LinkStatus;
  /** Direct application form URL (Lever /apply, Ashby /application, ...). */
  applyUrl: string;
  /** Canonical posting URL. */
  canonicalUrl: string;
  reason?: string;
  httpStatus?: number;
}

export type LinkCheckMode = 'all' | 'untrusted' | 'none';

export interface LinkCheckOptions {
  /** `untrusted` (default) live-checks tier 2/3 only: tier 1 APIs list open jobs by definition. */
  mode?: LinkCheckMode;
  concurrency?: number;
  timeoutMs?: number;
  /** Upper bound on live checks per run (rest are `unverified`). */
  maxChecks?: number;
  fetchImpl?: typeof fetch;
}

// Description-level phrases are stricter than page-level ones: "page not found"
// in a job description is not a closed signal, "position has been filled" is.
const DESCRIPTION_CLOSED_PHRASES = [
  'this position has been filled',
  'position has been filled',
  'no longer accepting applications',
  'this job has expired',
  'this internship has expired',
  'this position is closed',
  'applications are closed',
  'application closed for this',
  'job is no longer available',
  'this role has been filled',
];

export function findClosedPhrase(text: string | null | undefined, phrases: readonly string[] = DESCRIPTION_CLOSED_PHRASES): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return phrases.find(p => lower.includes(p)) ?? null;
}

export { CLOSED_JOB_PHRASES };

export function shouldLiveCheck(job: Pick<Job, 'tier'>, mode: LinkCheckMode): boolean {
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  return job.tier > 1;
}

export async function checkJobLink(job: Job, live: boolean, options: LinkCheckOptions = {}): Promise<LinkCheckResult> {
  const guard = validateCanonicalJobUrl(job.applyUrl);
  if (!guard.isValid) {
    return { status: 'invalid', applyUrl: job.applyUrl, canonicalUrl: job.applyUrl, reason: guard.rejectionReason ?? 'canonical_guard_rejected' };
  }
  const canonicalUrl = guard.cleanUrl;

  const closedPhrase = findClosedPhrase(job.description);
  if (closedPhrase) {
    return { status: 'closed', applyUrl: toDirectFormUrl(canonicalUrl), canonicalUrl, reason: `description:${closedPhrase}` };
  }

  if (!live) {
    return { status: 'unverified', applyUrl: toDirectFormUrl(canonicalUrl), canonicalUrl, reason: 'not_checked' };
  }

  const res = await resolveDirectFormUrl(job.applyUrl, job.company, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });

  if (res.isValid) {
    if (res.networkError) {
      return { status: 'unverified', applyUrl: res.directApplyUrl, canonicalUrl, reason: `network:${res.networkError}` };
    }
    return { status: 'verified', applyUrl: res.directApplyUrl, canonicalUrl, httpStatus: res.httpStatus };
  }

  const reason = res.failureReason ?? 'unknown';
  // 5xx is transient: keep the job, do not expire it on a flaky server.
  if (res.httpStatus !== undefined && res.httpStatus >= 500) {
    return { status: 'unverified', applyUrl: res.directApplyUrl, canonicalUrl, reason, httpStatus: res.httpStatus };
  }
  if (reason === 'content_404_closed' || reason.startsWith('http_')) {
    return { status: 'closed', applyUrl: res.directApplyUrl, canonicalUrl, reason, httpStatus: res.httpStatus };
  }
  return { status: 'invalid', applyUrl: res.directApplyUrl, canonicalUrl, reason };
}

/** Validates links for many jobs with bounded concurrency. Results are index-aligned with `jobs`. */
export async function validateJobLinks(jobs: Job[], options: LinkCheckOptions = {}): Promise<LinkCheckResult[]> {
  const mode = options.mode ?? 'untrusted';
  const concurrency = Math.max(1, options.concurrency ?? 16);
  const maxChecks = options.maxChecks ?? Number.POSITIVE_INFINITY;
  const results: LinkCheckResult[] = new Array(jobs.length);

  let liveBudget = maxChecks;
  const plan = jobs.map(job => {
    const live = shouldLiveCheck(job, mode) && liveBudget > 0;
    if (live) liveBudget--;
    return live;
  });

  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const i = cursor++;
      results[i] = await checkJobLink(jobs[i], plan[i], options);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}
