import { baseDomain, decodeEntities, htmlToText } from '@job-automator/email-verifier';
import { isIndiaEligible, type Region } from '../pipeline/region.js';
import type { FetchLike } from '../sources/ats.js';
import { contactsFromText } from './from-text.js';
import type { HnCompanySite } from './hn.js';
import { hostOf, isJobBoardHost } from './hosts.js';
import type { JobDescriptionRow } from './job-descriptions.js';
import { CONTACT_BOT_AGENT, isAllowed, robotsFromResponse, DENY_ALL, type Robots } from './robots.js';
import type { ContactCandidate } from './schema.js';

/**
 * Addresses on companies' own sites: the careers page a job links to, or the site named in
 * an HN post, plus up to two careers/contact pages linked from it. Only addresses at the
 * company's own domain are kept. robots.txt is obeyed, one request per host at a time with a
 * pause between them, small pages only.
 */

const HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': `${CONTACT_BOT_AGENT}/1.0 (+https://github.com/snipy09/nomadic)`,
};
const MAX_BYTES = 1_500_000;
const LINK_RE = /\b(careers?|jobs|join(?:-us|us)?|hiring|work-with-us|contact(?:-us)?|team|about(?:-us)?|people)\b/i;

export interface PageSeed {
  url: string;
  company: string;
}

/** One page to start from per company host: the job's own careers page, else the site in an HN post. */
export function pageSeeds(jobs: JobDescriptionRow[], sites: HnCompanySite[], region: Region): PageSeed[] {
  const byHost = new Map<string, PageSeed>();
  const add = (url: string | null, company: string) => {
    const host = url ? hostOf(url) : null;
    if (!url || !host || !company.trim() || isJobBoardHost(host)) return;
    const key = baseDomain(host);
    if (!byHost.has(key)) byHost.set(key, { url, company: company.trim() });
  };
  for (const job of jobs) {
    if (region === 'india' && !isIndiaEligible({ location: job.location ?? '', remote: Boolean(job.remote) })) continue;
    add(job.apply_url, job.company);
    add(job.canonical_url, job.company);
  }
  for (const site of sites) add(site.url, site.company);
  return [...byHost.values()];
}

export interface CompanyPagesOptions {
  fetchImpl?: FetchLike;
  /** Pages across all hosts (default 40). */
  maxPages?: number;
  /** Pages per host, the first included (default 3). */
  perHost?: number;
  /** Pause between two requests to the same host (default 1000 ms; a longer robots Crawl-delay wins, up to 10 s). */
  delayMs?: number;
  /** Hosts read at the same time (default 4). */
  concurrency?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CompanyPagesResult {
  contacts: ContactCandidate[];
  hosts: number;
  pagesFetched: number;
  blockedByRobots: number;
  warnings: string[];
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, max);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (bytes >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return out + decoder.decode();
}

/** Same-site links whose path or text says careers, jobs or contact. */
export function careerLinks(html: string, pageUrl: string, limit: number): string[] {
  const host = hostOf(pageUrl);
  if (!host) return [];
  const base = baseDomain(host);
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]), pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (baseDomain(url.hostname.toLowerCase()) !== base) continue;
    const text = htmlToText(m[2]).slice(0, 60);
    if (!LINK_RE.test(url.pathname) && !LINK_RE.test(text)) continue;
    url.hash = '';
    const href = url.toString();
    if (href !== pageUrl && !out.includes(href)) out.push(href);
    if (out.length >= limit) break;
  }
  return out;
}

export async function scrapeCompanyPages(seeds: PageSeed[], options: CompanyPagesOptions = {}): Promise<CompanyPagesResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const perHost = Math.max(1, options.perHost ?? 3);
  const result: CompanyPagesResult = { contacts: [], hosts: 0, pagesFetched: 0, blockedByRobots: 0, warnings: [] };
  let budget = Math.max(0, options.maxPages ?? 40);
  let failures = 0;

  const readRobots = async (origin: string): Promise<Robots> => {
    try {
      const res = await fetchImpl(`${origin}/robots.txt`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      return robotsFromResponse(res.status, res.ok ? await readCapped(res, 500_000) : '');
    } catch {
      return DENY_ALL;
    }
  };

  const crawlHost = async (seed: PageSeed) => {
    const start = new URL(seed.url);
    const base = baseDomain(start.hostname.toLowerCase());
    const robots = await readRobots(start.origin);
    const pause = Math.min(10000, Math.max(options.delayMs ?? 1000, (robots.crawlDelay ?? 0) * 1000));
    const queue = [start.toString()];
    const seen = new Set<string>();
    let fetchedHere = 0;
    let counted = false;
    while (queue.length > 0 && fetchedHere < perHost && budget > 0) {
      const url = queue.shift() as string;
      if (seen.has(url)) continue;
      seen.add(url);
      const u = new URL(url);
      if (!isAllowed(robots, `${u.pathname}${u.search}`)) {
        result.blockedByRobots++;
        continue;
      }
      if (fetchedHere > 0) await sleep(pause);
      budget--;
      fetchedHere++;
      if (!counted) {
        result.hosts++;
        counted = true;
      }
      let html: string;
      let finalUrl = url;
      try {
        const res = await fetchImpl(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') ?? '')) continue;
        finalUrl = res.url || url;
        html = await readCapped(res, MAX_BYTES);
      } catch (err) {
        failures++;
        if (failures <= 5) result.warnings.push(`${u.hostname}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      // A redirect to another site (often an ATS) is not this company's page.
      const finalHost = hostOf(finalUrl);
      if (!finalHost || baseDomain(finalHost) !== base || isJobBoardHost(finalHost)) continue;
      result.pagesFetched++;
      result.contacts.push(
        ...contactsFromText({
          text: htmlToText(html),
          company: seed.company,
          companyDomain: base,
          hiringFor: null,
          location: null,
          remote: false,
          source: 'company_page',
          sourceUrl: finalUrl,
          jobUrl: null,
          postedAt: null,
          sameDomainAs: base,
        })
      );
      if (fetchedHere === 1) queue.push(...careerLinks(html, finalUrl, perHost - 1));
    }
  };

  const queue = [...seeds];
  const workers = Array.from({ length: Math.max(1, options.concurrency ?? 4) }, async () => {
    while (queue.length > 0 && budget > 0) {
      const seed = queue.shift() as PageSeed;
      try {
        await crawlHost(seed);
      } catch (err) {
        result.warnings.push(`${seed.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  await Promise.all(workers);
  if (failures > 5) result.warnings.push(`${failures - 5} more pages failed`);
  return result;
}
