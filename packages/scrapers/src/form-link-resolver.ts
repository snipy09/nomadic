import type { RawJob } from './ats-api-scraper.js';
import { validateCanonicalJobUrl } from './canonical-link-guard.js';

export interface ResolvedJobForm {
  isValid: boolean;
  directApplyUrl: string;
  sourceUrl: string;
  platform?: string;
  failureReason?: string;
  /** Set when the live check could not run (timeout / network). The job is then accepted on the canonical guard alone. */
  networkError?: string;
  /** HTTP status of the live check, when one was made. */
  httpStatus?: number;
}

export interface ResolveOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Phrases on a job page (or in its description) that mean the posting is closed. */
export const CLOSED_JOB_PHRASES: readonly string[] = [
  'page not found',
  'job posting you were viewing is no longer active',
  'sorry, we couldn\'t find anything here',
  '404 not found',
  '404 error',
  'this job has expired',
  'this internship has expired',
  'position has been filled',
  'no longer accepting applications',
  'looks like you crashed',
  'no such internship',
  'no such job',
  'the job you are looking for has expired',
  'this position is closed',
  'this listing has expired',
  'this job is no longer available',
];

/**
 * Pure URL transformation from a canonical posting URL to the ATS's direct
 * application form (Lever `/apply`, Ashby `/application`, Greenhouse `#app`,
 * SmartRecruiters `/apply`). No network.
 */
export function toDirectFormUrl(cleanUrl: string): string {
  try {
    const parsed = new URL(cleanUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (host.includes('jobs.lever.co')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && !pathname.endsWith('/apply')) {
        return `https://jobs.lever.co/${parts[0]}/${parts[1]}/apply`;
      }
    } else if (host.includes('jobs.ashbyhq.com')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && !pathname.endsWith('/application')) {
        return `https://jobs.ashbyhq.com/${parts[0]}/${parts[1]}/application`;
      }
    } else if (host.includes('greenhouse.io') && pathname.includes('/jobs/')) {
      const cleanPath = pathname.split('#')[0];
      const segments = cleanPath.split('/').filter(Boolean);
      // Canonical format: https://boards.greenhouse.io/<company>/jobs/<id>#app
      if (segments.length >= 3 && segments[1] === 'jobs') {
        return `https://boards.greenhouse.io/${segments[0]}/jobs/${segments[2]}#app`;
      } else if (!parsed.hash.includes('app')) {
        parsed.hash = '#app';
        return parsed.toString();
      }
    } else if (host.includes('jobs.smartrecruiters.com') && !pathname.endsWith('/apply')) {
      parsed.pathname = `${pathname.replace(/\/$/, '')}/apply`;
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return cleanUrl;
}

/**
 * Resolves a raw job posting URL to its verified direct application form endpoint.
 * Multi-Stage Verification Pipeline:
 * Stage 1: Strict Canonical Link Guard (Rejects root directories & search pages)
 * Stage 2: Live HTTP 200 & Redirection Check
 * Stage 3: Content 404 / Expired Signature Scrutiny
 * Stage 4: DOM Application Form & External Destination Extraction
 */
export async function resolveDirectFormUrl(
  rawUrl: string,
  companyName?: string,
  options: ResolveOptions = {},
): Promise<ResolvedJobForm> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, directApplyUrl: '', sourceUrl: rawUrl, failureReason: 'empty_url' };
  }

  const trimmed = rawUrl.trim();

  // ── STAGE 1: CANONICAL LINK GUARD ──────────────────────────────────────────
  const guard = validateCanonicalJobUrl(trimmed);
  if (!guard.isValid) {
    return {
      isValid: false,
      directApplyUrl: trimmed,
      sourceUrl: trimmed,
      failureReason: guard.rejectionReason || 'canonical_guard_rejected',
    };
  }

  try {
    const candidateFormUrl = toDirectFormUrl(guard.cleanUrl);

    // ── STAGE 2: LIVE HTTP 200 HEALTH & REDIRECTION CHECK ───────────────────
    const fetchImpl = options.fetchImpl ?? fetch;
    const res = await fetchImpl(candidateFormUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      redirect: 'follow',
    });

    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      return {
        isValid: false,
        directApplyUrl: candidateFormUrl,
        sourceUrl: trimmed,
        failureReason: `http_${res.status}`,
        httpStatus: res.status,
      };
    }

    const finalUrl = res.url || candidateFormUrl;
    const html = (await res.text()).toLowerCase();

    // ── STAGE 3: CONTENT 404 / EXPIRED SIGNATURE SCRUTINY ───────────────────
    for (const sig of CLOSED_JOB_PHRASES) {
      if (html.includes(sig)) {
        return {
          isValid: false,
          directApplyUrl: finalUrl,
          sourceUrl: trimmed,
          failureReason: 'content_404_closed',
          httpStatus: res.status,
        };
      }
    }

    // ── STAGE 4: EXTERNAL DESTINATION EXTRACTION FOR AGGREGATORS ────────────
    const externalApplyMatch = html.match(
      /href=["'](https?:\/\/(?:jobs\.lever\.co|boards\.greenhouse\.io|jobs\.ashbyhq\.com|[^"']+\.myworkdayjobs\.com)[^"']*)["']/i
    );
    if (externalApplyMatch && externalApplyMatch[1]) {
      const resolvedExternalUrl = externalApplyMatch[1];
      const externalGuard = validateCanonicalJobUrl(resolvedExternalUrl);
      if (externalGuard.isValid) {
        return {
          isValid: true,
          directApplyUrl: externalGuard.cleanUrl,
          sourceUrl: trimmed,
          platform: externalGuard.platform,
          httpStatus: res.status,
        };
      }
    }

    return {
      isValid: true,
      directApplyUrl: finalUrl,
      sourceUrl: trimmed,
      platform: guard.platform,
      httpStatus: res.status,
    };
  } catch (err: any) {
    // If network verification times out, accept only if canonical guard passed
    return {
      isValid: true,
      directApplyUrl: guard.cleanUrl,
      sourceUrl: trimmed,
      platform: guard.platform,
      networkError: err?.message || String(err),
    };
  }
}

/**
 * Batch resolves direct application forms and purges dead links across all scraped jobs in parallel.
 */
export async function batchResolveAndFilterJobs(
  jobs: RawJob[],
  concurrency: number = 10
): Promise<RawJob[]> {
  console.log(`[Form Link Resolver] Pre-crawling and verifying direct form URLs for ${jobs.length} positions (Concurrency: ${concurrency})...`);

  const verifiedJobs: RawJob[] = [];
  let deadLinksFiltered = 0;
  let directFormsResolved = 0;

  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency);
    const resolvedChunk = await Promise.all(
      chunk.map(async (job) => {
        const res = await resolveDirectFormUrl(job.applyUrl, job.company);
        return { job, res };
      })
    );

    for (const { job, res } of resolvedChunk) {
      if (!res.isValid) {
        deadLinksFiltered++;
        continue;
      }

      if (res.directApplyUrl !== job.applyUrl) {
        directFormsResolved++;
        job.applyUrl = res.directApplyUrl;
      }

      verifiedJobs.push(job);
    }
  }

  console.log(`[Form Link Resolver] Verified: ${verifiedJobs.length} active positions (+${directFormsResolved} direct form deep-links resolved, -${deadLinksFiltered} dead/404/directory links purged).`);
  return verifiedJobs;
}
