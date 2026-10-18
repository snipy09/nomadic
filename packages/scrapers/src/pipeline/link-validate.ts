import { validateCanonicalJobUrl } from '../canonical-link-guard.js';
import { ERROR_404_SIGNATURES } from '../form-link-resolver.js';
import type { LinkStatus } from '../job-schema.js';
import type { FetchLike } from '../sources/ats.js';

/**
 * Link validation stage.
 *  1. Structural: canonical-link-guard rejects directory roots/search pages.
 *  2. Liveness (optional): HEAD, falling back to GET when HEAD is refused;
 *     404/410 => dead, closed-job phrases in the page => closed.
 * Network errors, timeouts, 429 and 5xx are "unknown": the job is kept and is
 * never expired on the strength of a flaky check.
 */

export interface LinkCheckResult {
  status: LinkStatus;
  reason?: string;
  httpStatus?: number;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; NomadicLinkCheck/1.0; +https://github.com/snipy09/nomadic)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
};

const MAX_BODY_CHARS = 300_000;

export function structuralCheck(url: string): LinkCheckResult | null {
  const guard = validateCanonicalJobUrl(url);
  if (!guard.isValid) return { status: 'invalid', reason: guard.rejectionReason ?? 'canonical_guard_rejected' };
  return null;
}

/** Closed phrases inside scripts and styles are translation tables (WordPress themes ship "position has been filled" on every page), not page text. */
export function findClosedSignal(html: string): string | null {
  const lower = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .slice(0, MAX_BODY_CHARS)
    .toLowerCase();
  return ERROR_404_SIGNATURES.find((sig) => lower.includes(sig)) ?? null;
}

export async function checkLink(url: string, fetchImpl: FetchLike, timeoutMs = 8000): Promise<LinkCheckResult> {
  const structural = structuralCheck(url);
  if (structural) return structural;

  try {
    const head = await fetchImpl(url, {
      method: 'HEAD',
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (head.status === 404 || head.status === 410)
      return { status: 'dead', reason: `http_${head.status}`, httpStatus: head.status };

    // Many boards refuse HEAD (403/405) or need the body to tell open from closed: GET.
    const get = await fetchImpl(url, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (get.status === 404 || get.status === 410)
      return { status: 'dead', reason: `http_${get.status}`, httpStatus: get.status };
    if (get.status === 429 || get.status >= 500)
      return { status: 'unknown', reason: `http_${get.status}`, httpStatus: get.status };
    if (get.status >= 400) return { status: 'unknown', reason: `http_${get.status}`, httpStatus: get.status };

    const contentType = get.headers?.get?.('content-type') ?? 'text/html';
    if (contentType.includes('html') || contentType.includes('text')) {
      const closed = findClosedSignal(await get.text());
      if (closed) return { status: 'closed', reason: `closed_phrase:${closed}`, httpStatus: get.status };
    }
    return { status: 'ok', httpStatus: get.status };
  } catch (err) {
    return { status: 'unknown', reason: err instanceof Error ? err.name || err.message : 'network_error' };
  }
}

export interface ValidateLinksOptions {
  fetch: FetchLike;
  /** false => structural check only (no network). */
  http: boolean;
  concurrency?: number;
  timeoutMs?: number;
  /** Skip the HTTP check for these urls (e.g. listed by an official API) and mark them ok. */
  trusted?: (url: string) => boolean;
}

export async function validateLinks(
  urls: string[],
  options: ValidateLinksOptions
): Promise<Map<string, LinkCheckResult>> {
  const results = new Map<string, LinkCheckResult>();
  const pending: string[] = [];

  for (const url of new Set(urls)) {
    const structural = structuralCheck(url);
    if (structural) results.set(url, structural);
    else if (options.trusted?.(url)) results.set(url, { status: 'ok', reason: 'listed_by_official_api' });
    else if (!options.http) results.set(url, { status: 'unchecked' });
    else pending.push(url);
  }

  const concurrency = Math.max(1, options.concurrency ?? 10);
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const url = pending[next++];
      results.set(url, await checkLink(url, options.fetch, options.timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return results;
}

/** Statuses that mean the posting is gone and should be expired. */
export function isFailedLink(status: LinkStatus): boolean {
  return status === 'dead' || status === 'closed' || status === 'invalid';
}
