import type { JobCandidate } from '../job-schema.js';
import { PoliteFetcher } from '../feed/http.js';
import { cleanText, htmlToText, normalizeEmploymentType, toIsoDate } from '../pipeline/normalize.js';
import type { FetchLike } from './ats.js';

/**
 * Unstop jobs and internships, from the public JSON its own listing pages load (the same endpoint the hackathon
 * scraper reads). Unstop lists Indian opportunities only. Fields the listing does not state stay empty: no salary
 * (Unstop mixes yearly CTC and monthly stipends without a reliable period) and no posting date unless given.
 */

export type UnstopKind = 'jobs' | 'internships';

export function normalizeUnstopJob(item: any, kind: UnstopKind, now = new Date()): JobCandidate | null {
  const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
  const title = cleanText(item?.title);
  const path = typeof item?.public_url === 'string' ? item.public_url.replace(/^\/+/, '') : '';
  const company = cleanText(item?.organisation?.name);
  if (!id || !title || !path || !company) return null;
  const region = String(item?.region ?? '').toLowerCase();
  const remote = region === 'online';
  const detail = item?.jobDetail ?? {};
  const cities: string[] = (Array.isArray(detail?.locations) ? detail.locations : [])
    .map((l: any) => cleanText(typeof l === 'string' ? l : l?.city ?? l?.name, 80))
    .filter(Boolean);
  const addrCity = cleanText(item?.address_with_country_logo?.city, 80);
  const place = [...new Set(cities.length ? cities : addrCity ? [addrCity] : [])].slice(0, 4).join(', ');
  const location = remote ? (place ? `${place} (work from home)` : 'India (work from home)') : place || 'India';
  const typeHint = kind === 'internships' ? 'internship' : cleanText(detail?.type ?? detail?.job_type ?? item?.type, 40) || null;
  return {
    source: 'unstop',
    sourceJobId: `${kind}:${id}`,
    title,
    company,
    location,
    remote,
    workplaceType: remote ? 'remote' : region === 'hybrid' ? 'hybrid' : region === 'offline' ? 'onsite' : 'unknown',
    employmentType: kind === 'internships' ? 'internship' : normalizeEmploymentType(typeHint, title),
    postedAt: toIsoDate(item?.approved_date, now),
    applyUrl: path.startsWith('http') ? path : `https://unstop.com/${path}`,
    description: htmlToText(item?.details ?? item?.seo_details?.[0]?.description ?? '', 8000),
    raw: { id, kind },
  };
}

/** True when the listing says applications have closed. */
function closed(item: any, now: Date): boolean {
  const end = Date.parse(String(item?.regnRequirements?.end_regn_dt ?? ''));
  return Number.isFinite(end) && end < now.getTime();
}

export interface UnstopOptions {
  maxPages: number;
  now: Date;
  warn: (message: string) => void;
}

export async function fetchUnstopJobs(fetchImpl: FetchLike, options: UnstopOptions): Promise<JobCandidate[]> {
  const http = new PoliteFetcher({ fetchImpl });
  const PAGE = 30;
  const out: JobCandidate[] = [];
  for (const kind of ['jobs', 'internships'] as const) {
    let page = 1;
    for (; page <= options.maxPages; page++) {
      const data = await http.json(
        `https://unstop.com/api/public/opportunity/search-result?opportunity=${kind}&oppstatus=open&per_page=${PAGE}&page=${page}`
      );
      const body = data?.data ?? {};
      const items: any[] = Array.isArray(body?.data) ? body.data : [];
      for (const item of items) {
        if (closed(item, options.now)) continue;
        const job = normalizeUnstopJob(item, kind, options.now);
        if (job) out.push(job);
      }
      const last = typeof body?.last_page === 'number' ? body.last_page : null;
      if (items.length < PAGE || (last !== null && page >= last)) break;
    }
    if (page > options.maxPages) options.warn(`${kind}: stopped after ${options.maxPages} pages (more listed)`);
  }
  return out;
}
