import { computeJobHash } from './hasher.js';
import type { RawJob } from './ats-api-scraper.js';

export interface InternshalaJob extends RawJob {
  employmentType: 'job' | 'internship';
  workplaceType: 'remote' | 'hybrid' | 'onsite';
  experienceLevel: 'entry' | 'mid' | 'senior';
  stipendOrSalary?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: 'month' | 'year' | 'lump-sum';
  canonicalUrl?: string;
  createdAt: string;
  /** Real posting date from the source, when it provides one (createdAt may be a scrape timestamp). */
  postedAt?: string;
}

export type ScrapeResultStatus = 'ok' | 'expired' | 'unparsable' | 'failed';

export interface ScrapeJobResult {
  status: ScrapeResultStatus;
  url: string;
  canonicalUrl?: string;
  job?: InternshalaJob;
  reason?: string;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

/**
 * 1. URL Normalization: Normalizes raw URLs into canonical HTTPS internshala.com detail paths
 */
export function normalizeInternshalaUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    let cleaned = trimmed;
    const doubleDomainMatch = cleaned.match(/https?:\/\/(?:www\.)?internshala\.com(https?:\/\/.*)/i);
    if (doubleDomainMatch && doubleDomainMatch[1]) {
      cleaned = doubleDomainMatch[1];
    }

    const parsed = new URL(cleaned, 'https://internshala.com');

    if (!parsed.hostname.toLowerCase().includes('internshala.com')) {
      return null;
    }

    parsed.protocol = 'https:';
    parsed.hostname = 'internshala.com';

    parsed.hash = '';
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 'source', 'view', 'from'];
    trackingParams.forEach(p => parsed.searchParams.delete(p));

    parsed.pathname = parsed.pathname.replace(/\/+/g, '/');

    if (!parsed.pathname || parsed.pathname === '/') {
      return null;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Checks if a URL is a direct job or internship detail posting (and NOT a category index)
 */
export function isDirectDetailUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    (lower.includes('/internship/detail/') || lower.includes('/job/detail/')) &&
    !lower.endsWith('/internships') &&
    !lower.endsWith('/jobs')
  );
}

/**
 * 2. 404 Detection: Detects if HTTP response or HTML body indicates an expired / missing listing
 */
export function isInternshala404Page(html: string, statusCode?: number): boolean {
  if (statusCode === 404) return true;
  if (!html || typeof html !== 'string') return false;

  const lower = html.toLowerCase();
  
  if (lower.includes('error 404') && lower.includes('looks like you crashed')) return true;
  if (lower.includes('the page you are looking for could not be found')) return true;
  if (lower.includes('no such internship') || lower.includes('no such job')) return true;
  if (lower.includes('this internship has expired') || lower.includes('this job has expired')) return true;
  if (lower.includes('application closed for this')) return true;
  if (lower.includes('404 - not found') && lower.includes('internshala')) return true;

  return false;
}

/**
 * 3. Page Structure Validation
 */
export function validateInternshalaJobPage(html: string): { valid: boolean; reason?: string } {
  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    return { valid: false, reason: 'empty_response' };
  }

  if (isInternshala404Page(html)) {
    return { valid: false, reason: 'internshala_404' };
  }

  if (html.length < 100) {
    return { valid: false, reason: 'empty_response' };
  }

  const lower = html.toLowerCase();

  if (lower.includes('"@type"') && (lower.includes('"jobposting"') || lower.includes('"internship"'))) {
    return { valid: true };
  }

  if (
    lower.includes('internship_meta') ||
    lower.includes('job_meta') ||
    lower.includes('heading_4_5') ||
    lower.includes('profile_heading') ||
    lower.includes('detail_view')
  ) {
    return { valid: true };
  }

  return { valid: false, reason: 'unrecognized_structure' };
}

/**
 * 4. Parse Internshala Detail HTML
 */
export function parseInternshalaDetailPage(html: string, url: string): InternshalaJob | null {
  if (!html || typeof html !== 'string') return null;

  try {
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        try {
          const raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(raw);
          const data = Array.isArray(parsed) ? parsed[0] : parsed;

          if (data && (data['@type'] === 'JobPosting' || data['@type'] === 'Internship' || data.title)) {
            const title = String(data.title || data.name || '').trim();
            const company = typeof data.hiringOrganization === 'object'
              ? String(data.hiringOrganization?.name || '').trim()
              : String(data.hiringOrganization || '').trim() || 'Tech Innovator';
            const location = data.jobLocation?.address?.addressLocality || 'India / Remote';
            const description = String(data.description || '').replace(/<[^>]*>?/gm, ' ').slice(0, 3000).trim();

            let salary: string | undefined = undefined;
            if (data.baseSalary) {
              const val = data.baseSalary?.value?.value || data.baseSalary?.value || data.baseSalary;
              if (val) {
                salary = typeof val === 'number' ? `₹${val} /month` : String(val);
              }
            }

            if (title && title.length > 2) {
              const canonical = normalizeInternshalaUrl(url) || url;
              const isIntern = title.toLowerCase().includes('intern') || url.includes('/internship/');

              return {
                company: company || 'Innovator',
                title,
                location: location || 'India',
                salary,
                stipendOrSalary: salary,
                applyUrl: canonical,
                canonicalUrl: canonical,
                source: 'Internshala',
                description,
                jobHash: computeJobHash(company, title, canonical),
                employmentType: isIntern ? 'internship' : 'job',
                workplaceType: location.toLowerCase().includes('remote') ? 'remote' : 'hybrid',
                experienceLevel: 'entry',
                createdAt: new Date().toISOString(),
              };
            }
          }
        } catch {}
      }
    }

    const titleMatch = html.match(/<div[^>]*class=["'][^"']*profile_heading[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<h1[^>]*class=["'][^"']*heading_4_5[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<title>([\s\S]*?)<\/title>/i);

    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>?/gm, '').replace(/\|.*/, '').trim() : '';
    if (!rawTitle || rawTitle.toLowerCase().includes('404') || rawTitle.toLowerCase().includes('looks like you crashed')) {
      return null;
    }

    const companyMatch = html.match(/<div[^>]*class=["'][^"']*company_name[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<a[^>]*class=["'][^"']*link_display_like_text[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const company = companyMatch ? companyMatch[1].replace(/<[^>]*>?/gm, '').trim() : 'Tech Innovator';

    const locationMatch = html.match(/<a[^>]*class=["'][^"']*location_link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
                          html.match(/<span[^>]*class=["'][^"']*location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const location = locationMatch ? locationMatch[1].replace(/<[^>]*>?/gm, '').trim() : 'India / Remote';

    const stipendMatch = html.match(/<span[^>]*class=["'][^"']*stipend[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const stipend = stipendMatch ? stipendMatch[1].replace(/<[^>]*>?/gm, '').trim() : undefined;

    const canonical = normalizeInternshalaUrl(url) || url;
    const isIntern = rawTitle.toLowerCase().includes('intern') || url.includes('/internship/');

    return {
      company: company || 'Innovator',
      title: rawTitle,
      location,
      salary: stipend,
      stipendOrSalary: stipend,
      applyUrl: canonical,
      canonicalUrl: canonical,
      source: 'Internshala',
      description: '',
      jobHash: computeJobHash(company, rawTitle, canonical),
      employmentType: isIntern ? 'internship' : 'job',
      workplaceType: location.toLowerCase().includes('remote') ? 'remote' : 'hybrid',
      experienceLevel: 'entry',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * 5. Fetch single Internshala detail page safely
 */
export async function fetchInternshalaDetail(
  url: string,
  retries: number = 2
): Promise<ScrapeJobResult> {
  const normalizedUrl = normalizeInternshalaUrl(url);
  if (!normalizedUrl) {
    return { status: 'unparsable', url, reason: 'invalid_url_structure' };
  }

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(normalizedUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 404) {
        return { status: 'expired', url: normalizedUrl, reason: 'http_404' };
      }

      if (!res.ok) {
        if (attempt <= retries) continue;
        return { status: 'failed', url: normalizedUrl, reason: `http_${res.status}` };
      }

      const html = await res.text();
      if (isInternshala404Page(html, res.status)) {
        return { status: 'expired', url: normalizedUrl, reason: 'content_404' };
      }

      const job = parseInternshalaDetailPage(html, normalizedUrl);
      if (job) {
        return { status: 'ok', url: normalizedUrl, canonicalUrl: normalizedUrl, job };
      }
      return { status: 'unparsable', url: normalizedUrl, reason: 'parsing_failed' };
    } catch (err: any) {
      if (attempt > retries) {
        return { status: 'failed', url: normalizedUrl, reason: err?.message || 'network_error' };
      }
    }
  }

  return { status: 'failed', url: normalizedUrl, reason: 'max_retries_exceeded' };
}

/**
 * 6. Crawls an Internshala listing page and extracts direct detail URLs
 */
export async function extractDetailUrlsFromListing(listingUrl: string): Promise<string[]> {
  try {
    const res = await fetch(listingUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const detailUrls: string[] = [];
    // Match data-href or href attributes containing detail links
    const regex = /(?:data-href|href)=["'](\/(?:internship|job)\/detail\/[^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const relPath = match[1];
      const fullUrl = `https://internshala.com${relPath.split('?')[0]}`;
      const normalized = normalizeInternshalaUrl(fullUrl);
      if (normalized && isDirectDetailUrl(normalized) && !detailUrls.includes(normalized)) {
        detailUrls.push(normalized);
      }
    }
    return detailUrls;
  } catch {
    return [];
  }
}

/** Listing pages read per run: tech internships, fresher jobs and the categories engineering students search. */
const INTERNSHALA_INTERNSHIP_CATEGORIES = [
  'computer-science',
  'web-development',
  'software-development',
  'full-stack-development',
  'front-end-development',
  'backend-development',
  'python-django',
  'java',
  'javascript-development',
  'react-js-development',
  'node-js-development',
  'android-app-development',
  'mobile-app-development',
  'flutter-development',
  'data-science',
  'data-analytics',
  'machine-learning',
  'artificial-intelligence-ai',
  'cloud-computing',
  'cyber-security',
  'devops',
  'ui-ux-design',
  'product-management',
  'business-analytics',
  'electronics',
  'electrical',
  'mechanical',
  'engineering',
];
const INTERNSHALA_JOB_CATEGORIES = [
  'software-development',
  'web-development',
  'full-stack-development',
  'front-end-development',
  'backend-development',
  'python-django',
  'java',
  'android-app-development',
  'data-science',
  'data-analytics',
  'machine-learning',
  'cloud-computing',
  'cyber-security',
  'software-testing',
  'computer-science',
  'engineering',
];

export const INTERNSHALA_LISTING_URLS = [
  'https://internshala.com/internships/work-from-home-computer-science-internships/',
  ...INTERNSHALA_INTERNSHIP_CATEGORIES.map((c) => `https://internshala.com/internships/${c}-internship/`),
  'https://internshala.com/fresher-jobs/',
  ...INTERNSHALA_JOB_CATEGORIES.map((c) => `https://internshala.com/jobs/${c}-jobs/`),
];

/** Page N of a listing: /internships/java-internship/page-2/. */
export function listingPageUrl(listingUrl: string, page: number): string {
  return page <= 1 ? listingUrl : `${listingUrl.replace(/\/+$/, '')}/page-${page}/`;
}

/**
 * Builds a posting from an Internshala detail URL using only what the slug tells us.
 * e.g. /internship/detail/full-stack-development-internship-in-bangalore-at-xyz12345
 * The city in the slug ("-in-bangalore") becomes the location; work-from-home slugs are remote.
 * Salary is left empty: the listing page does not expose it and we never invent one.
 */
export function internshalaJobFromDetailUrl(detailUrl: string, createdAt: string): InternshalaJob {
  const slug = detailUrl.split('/detail/')[1] || '';
  const at = slug.lastIndexOf('-at-');
  const rolePart = (at > 0 ? slug.slice(0, at) : slug).replace(/-/g, ' ');
  const companyPart = at > 0 ? slug.slice(at + 4).replace(/[0-9]+$/, '').replace(/-/g, ' ') : '';
  const isJob = detailUrl.includes('/job/detail/');
  const place = rolePart.match(/^(.*?\b(?:internship|job|jobs))\s+in\s+([a-z ]+)$/);
  const role = (place ? place[1] : rolePart).replace(/^work from home\s+/, '').trim();
  const city = place ? place[2].trim().replace(/\b\w/g, (ch) => ch.toUpperCase()) : '';
  const capital = (text: string) => (text.charAt(0).toUpperCase() + text.slice(1)).trim();

  return {
    company: capital(companyPart),
    title: capital(role),
    location: city ? `${city}, India` : 'India / Remote',
    applyUrl: detailUrl,
    canonicalUrl: detailUrl,
    source: 'Internshala',
    // The listing page has no description; leave it empty rather than write filler text.
    description: '',
    jobHash: computeJobHash(companyPart, role, detailUrl),
    employmentType: isJob ? 'job' : 'internship',
    workplaceType: 'hybrid',
    experienceLevel: 'entry',
    createdAt,
  };
}

export interface InternshalaListingOptions {
  /** Pages read per listing (1 = first page only). */
  maxPages?: number;
  /** Pause between requests, to stay gentle on the site. */
  delayMs?: number;
  extract?: (url: string) => Promise<string[]>;
  sleep?: (ms: number) => Promise<void>;
}

/** A listing stops paging at a page where fewer than this share of its postings are new. */
const MIN_NEW_SHARE = 0.25;

/**
 * Internshala only: crawls public listing pages one at a time and returns one posting per detail URL.
 * A listing stops paging at the first page that adds little new (under a quarter of its postings). Never returns category index URLs.
 * Postings without a company in the slug are dropped (no placeholder names).
 */
export async function scrapeInternshalaListings(
  listingUrls: string[] = INTERNSHALA_LISTING_URLS,
  options: InternshalaListingOptions = {}
): Promise<InternshalaJob[]> {
  const maxPages = Math.max(1, options.maxPages ?? 1);
  // One request a second: the repo-wide politeness floor for one site.
  const delayMs = options.delayMs ?? 1000;
  const extract = options.extract ?? extractDetailUrlsFromListing;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const detailUrls = new Set<string>();
  let requests = 0;
  for (const listing of listingUrls) {
    for (let page = 1; page <= maxPages; page++) {
      if (requests++ > 0) await sleep(delayMs);
      const found = await extract(listingPageUrl(listing, page)).catch(() => [] as string[]);
      const before = detailUrls.size;
      found.forEach((u) => detailUrls.add(u));
      // Categories overlap (computer-science, software-development, engineering): a page that is mostly postings
      // already read from another listing means the rest of this listing is too.
      const added = detailUrls.size - before;
      if (added === 0 || added < found.length * MIN_NEW_SHARE) break;
    }
  }
  const createdAt = new Date().toISOString();
  return [...detailUrls].map((url) => internshalaJobFromDetailUrl(url, createdAt)).filter((job) => job.company && job.title);
}

/**
 * Jobicy public remote-jobs API (developer tag).
 */
export async function scrapeJobicy(count: number = 25): Promise<InternshalaJob[]> {
  const jobs: InternshalaJob[] = [];
  const now = Date.now();
  const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=dev`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`jobicy_http_${res.status}`);
  const data: any = await res.json();
  if (!data || !Array.isArray(data.jobs)) return jobs;

  for (let i = 0; i < data.jobs.length; i++) {
    const item = data.jobs[i];
    if (!item.url || !item.jobTitle) continue;

    const titleLower = String(item.jobTitle).toLowerCase();
    const isIntern = titleLower.includes('intern') || titleLower.includes('junior') || titleLower.includes('entry');
    const isSenior = titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('staff');
    const hasSalary = Boolean(item.annualSalaryMin && item.annualSalaryMax);
    const currency = item.salaryCurrency || 'USD';

    jobs.push({
      company: item.companyName || 'Tech Innovator',
      title: item.jobTitle,
      location: item.jobGeo || 'Remote',
      salary: hasSalary ? `${currency} ${item.annualSalaryMin} - ${item.annualSalaryMax} /yr` : undefined,
      salaryMin: hasSalary ? Number(item.annualSalaryMin) : null,
      salaryMax: hasSalary ? Number(item.annualSalaryMax) : null,
      salaryCurrency: hasSalary ? currency : undefined,
      salaryPeriod: hasSalary ? 'year' : undefined,
      applyUrl: item.url,
      canonicalUrl: item.url,
      source: 'Verified Placements Feed',
      description: item.jobDescription ? String(item.jobDescription).replace(/<[^>]*>?/gm, '').slice(0, 3000) : '',
      jobHash: computeJobHash(item.companyName || 'Tech', item.jobTitle, item.url),
      employmentType: isIntern ? 'internship' : 'job',
      workplaceType: 'remote',
      experienceLevel: isIntern ? 'entry' : isSenior ? 'senior' : 'mid',
      createdAt: item.pubDate || new Date(now - (i + 20) * 180000).toISOString(),
      postedAt: item.pubDate || undefined,
    });
  }
  return jobs;
}

/**
 * Legacy combined scraper used by runAllScrapers: Internshala listings plus Jobicy.
 * The pipeline (pipeline/run.ts) uses scrapeInternshalaListings and scrapeJobicy
 * as separate sources instead.
 */
export async function scrapeInternshala(): Promise<InternshalaJob[]> {
  const legacyListings = [
    'https://internshala.com/internships/work-from-home-computer-science-internships/',
    'https://internshala.com/internships/computer-science-internship/',
    'https://internshala.com/jobs/developer-jobs/',
  ];
  const [internshala, jobicy] = await Promise.allSettled([scrapeInternshalaListings(legacyListings, { delayMs: 0 }), scrapeJobicy()]);
  const jobs: InternshalaJob[] = [];
  if (internshala.status === 'fulfilled') jobs.push(...internshala.value);
  else console.warn('[Internshala Live Parser] Warning:', internshala.reason?.message);
  if (jobicy.status === 'fulfilled') jobs.push(...jobicy.value);
  else console.warn('[Live Placements Scraper] Failed:', jobicy.reason?.message);

  console.log(`[Direct Scraper Summary] Valid Direct Postings: ${jobs.length}`);
  return jobs;
}
