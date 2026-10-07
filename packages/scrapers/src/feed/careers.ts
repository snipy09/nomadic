import type { JobCandidate } from '../job-schema.js';
import { cleanText } from '../pipeline/normalize.js';
import { fetchAshbyBoard, fetchGreenhouseBoard, fetchLeverBoard } from '../sources/ats.js';
import type { CareersAdapter, CompanyDef } from './companies.js';
import type { PoliteFetcher } from './http.js';
import type { OpeningSource } from './schema.js';

/**
 * Careers adapters: one per listing type. Each returns raw openings as the site states them; the run
 * classifies, filters to India and validates. Paging stops at `maxPages`; `truncated` says more existed.
 */

export interface RawOpening {
  sourceJobId: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  postedAt: string | null;
  /** The site's own employment type, when it gives one. */
  typeHint: string | null;
  /** The site's own experience level, when it gives one. */
  levelHint: string | null;
}

export interface CareersResult {
  openings: RawOpening[];
  /** Total the site reported, when it reports one. */
  total: number | null;
  truncated: boolean;
}

export interface CareersContext {
  http: PoliteFetcher;
  maxPages: number;
  now: Date;
}

const iso = (ms: number): string | null => (Number.isFinite(ms) && ms > Date.UTC(2000, 0, 1) ? new Date(ms).toISOString() : null);

/** Dates as careers sites print them ("2026-10-05", "October 5, 2026", epoch seconds); never in the future. */
export function parsePostedDate(value: unknown, now: Date): string | null {
  if (value === null || value === undefined || value === '') return null;
  let ms: number;
  if (typeof value === 'number') ms = value < 1e12 ? value * 1000 : value;
  else {
    const s = String(value).trim();
    ms = /^\d{10}$/.test(s) ? Number(s) * 1000 : /^\d{13}$/.test(s) ? Number(s) : Date.parse(s);
  }
  if (ms > now.getTime() + 86_400_000) return null;
  return iso(ms);
}

/** Workday's "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago"; "30+ Days Ago" is not a date. */
export function parseWorkdayPostedOn(text: unknown, now: Date): string | null {
  const s = String(text ?? '').toLowerCase();
  const day = (n: number) => {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return new Date(d.getTime() - n * 86_400_000).toISOString();
  };
  if (/\btoday\b/.test(s)) return day(0);
  if (/\byesterday\b/.test(s)) return day(1);
  const m = s.match(/(\d+)\s+days?\s+ago/);
  if (m && !/\+/.test(s)) return day(Number(m[1]));
  return null;
}

const fromJobCandidate = (j: JobCandidate): RawOpening => ({
  sourceJobId: j.sourceJobId,
  title: j.title,
  location: j.location ?? '',
  remote: Boolean(j.remote),
  url: j.applyUrl,
  postedAt: j.postedAt ?? null,
  typeHint: j.employmentType && j.employmentType !== 'unknown' ? j.employmentType : null,
  levelHint: null,
});

// ── Workday (public CXS endpoint the careers site itself calls) ────────────────

export function normalizeWorkdayPosting(item: any, a: Extract<CareersAdapter, { kind: 'workday' }>, now: Date): RawOpening | null {
  const path = typeof item?.externalPath === 'string' ? item.externalPath : '';
  const title = cleanText(item?.title);
  if (!path || !title) return null;
  return {
    sourceJobId: path,
    title,
    location: cleanText(item?.locationsText),
    remote: /remote/i.test(String(item?.remoteType ?? '')),
    url: `https://${a.host}/en-US/${a.site}${path}`,
    postedAt: parseWorkdayPostedOn(item?.postedOn, now),
    typeHint: null,
    levelHint: null,
  };
}

async function workday(a: Extract<CareersAdapter, { kind: 'workday' }>, ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 20;
  const url = `https://${a.host}/wday/cxs/${a.tenant}/${a.site}/jobs`;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  for (let page = 0; page < ctx.maxPages; page++) {
    const data = await ctx.http.json(url, {
      method: 'POST',
      body: { appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText: 'India' },
    });
    // Workday reports the total on the first page only.
    if (page === 0) total = typeof data?.total === 'number' ? data.total : null;
    const items: any[] = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
    for (const item of items) {
      const o = normalizeWorkdayPosting(item, a, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || (total !== null && (page + 1) * PAGE >= total)) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── SmartRecruiters (public Posting API) ──────────────────────────────────────

export function normalizeSmartRecruitersPosting(item: any, company: string, now: Date): RawOpening | null {
  const id = item?.id ? String(item.id) : '';
  const title = cleanText(item?.name);
  if (!id || !title) return null;
  const loc = item?.location ?? {};
  const location = [loc.city, loc.region, loc.country === 'in' ? 'India' : loc.country].filter(Boolean).join(', ');
  return {
    sourceJobId: id,
    title,
    location: cleanText(location),
    remote: Boolean(loc.remote),
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(id)}`,
    postedAt: parsePostedDate(item?.releasedDate, now),
    typeHint: item?.typeOfEmployment?.label ? String(item.typeOfEmployment.label) : null,
    levelHint: item?.experienceLevel?.label ? String(item.experienceLevel.label) : null,
  };
}

async function smartRecruiters(a: Extract<CareersAdapter, { kind: 'smartrecruiters' }>, ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 100;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  for (let page = 0; page < ctx.maxPages; page++) {
    const data = await ctx.http.json(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(a.company)}/postings?country=in&limit=${PAGE}&offset=${page * PAGE}`
    );
    total = typeof data?.totalFound === 'number' ? data.totalFound : total;
    const items: any[] = Array.isArray(data?.content) ? data.content : [];
    for (const item of items) {
      const o = normalizeSmartRecruitersPosting(item, a.company, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || (total !== null && (page + 1) * PAGE >= total)) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── Eightfold (careers sites of Microsoft, Netflix, Qualcomm) ─────────────────

export function normalizeEightfoldPosition(item: any, a: Extract<CareersAdapter, { kind: 'eightfold' }>, now: Date): RawOpening | null {
  const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
  const title = cleanText(item?.name);
  if (!id || !title) return null;
  const locations: string[] = Array.isArray(item?.locations) ? item.locations.map(String) : [];
  const location = cleanText(locations.length ? locations.join('; ') : item?.location);
  const url =
    typeof item?.canonicalPositionUrl === 'string' && item.canonicalPositionUrl.startsWith('http')
      ? item.canonicalPositionUrl
      : `https://${a.host}/careers/job/${encodeURIComponent(id)}`;
  return {
    sourceJobId: id,
    title,
    location,
    remote: /remote/i.test(String(item?.work_location_option ?? '')),
    url,
    postedAt: parsePostedDate(item?.t_create, now),
    typeHint: null,
    levelHint: null,
  };
}

async function eightfold(a: Extract<CareersAdapter, { kind: 'eightfold' }>, ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 10;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  // Eightfold serves 10 per page; allow more pages than the slower APIs.
  const pages = ctx.maxPages * 3;
  for (let page = 0; page < pages; page++) {
    const data = await ctx.http.json(
      `https://${a.host}/api/apply/v2/jobs?domain=${encodeURIComponent(a.domain)}&location=India&start=${page * PAGE}&num=${PAGE}&sort_by=timestamp`
    );
    total = typeof data?.count === 'number' ? data.count : total;
    const items: any[] = Array.isArray(data?.positions) ? data.positions : [];
    for (const item of items) {
      const o = normalizeEightfoldPosition(item, a, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || (total !== null && (page + 1) * PAGE >= total)) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── Oracle Recruiting Cloud (Oracle, JPMorgan Chase) ──────────────────────────

export function normalizeOracleRequisition(item: any, a: Extract<CareersAdapter, { kind: 'oracle' }>, now: Date): RawOpening | null {
  const id = item?.Id ? String(item.Id) : '';
  const title = cleanText(item?.Title);
  if (!id || !title) return null;
  const location = cleanText(item?.PrimaryLocation);
  return {
    sourceJobId: id,
    title,
    location: item?.PrimaryLocationCountry === 'IN' && !/india/i.test(location) ? `${location}, India` : location,
    remote: /remote/i.test(String(item?.WorkplaceType ?? item?.WorkplaceTypeCode ?? '')),
    url: `https://${a.host}/hcmUI/CandidateExperience/en/sites/${a.site}/job/${encodeURIComponent(id)}`,
    postedAt: parsePostedDate(item?.PostedDate, now),
    typeHint: item?.JobSchedule ? String(item.JobSchedule) : null,
    levelHint: null,
  };
}

async function oracle(a: Extract<CareersAdapter, { kind: 'oracle' }>, ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 25;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  for (let page = 0; page < ctx.maxPages; page++) {
    const finder = `findReqs;siteNumber=${a.site},limit=${PAGE},offset=${page * PAGE},sortBy=POSTING_DATES_DESC,keyword=India`;
    const data = await ctx.http.json(
      `https://${a.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(finder)}`
    );
    const block = Array.isArray(data?.items) ? data.items[0] : null;
    total = typeof block?.TotalJobsCount === 'number' ? block.TotalJobsCount : total;
    const items: any[] = Array.isArray(block?.requisitionList) ? block.requisitionList : [];
    for (const item of items) {
      const o = normalizeOracleRequisition(item, a, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || (total !== null && (page + 1) * PAGE >= total)) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── Amazon (amazon.jobs search JSON) ──────────────────────────────────────────

export function normalizeAmazonJob(item: any, now: Date): RawOpening | null {
  const path = typeof item?.job_path === 'string' ? item.job_path : '';
  const title = cleanText(item?.title);
  if (!path || !title) return null;
  return {
    sourceJobId: String(item?.id_icims ?? item?.id ?? path),
    title,
    location: cleanText(item?.normalized_location ?? item?.location),
    remote: false,
    url: `https://www.amazon.jobs${path}`,
    postedAt: parsePostedDate(item?.posted_date, now),
    typeHint: item?.job_schedule_type ? String(item.job_schedule_type) : null,
    levelHint: null,
  };
}

async function amazon(ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 100;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  for (let page = 0; page < ctx.maxPages; page++) {
    const data = await ctx.http.json(
      `https://www.amazon.jobs/en/search.json?country=IND&result_limit=${PAGE}&offset=${page * PAGE}&sort=recent`
    );
    total = typeof data?.hits === 'number' ? data.hits : total;
    const items: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
    for (const item of items) {
      const o = normalizeAmazonJob(item, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || (total !== null && (page + 1) * PAGE >= total)) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── Google (careers search API) ───────────────────────────────────────────────

export function normalizeGoogleJob(item: any, now: Date): RawOpening | null {
  const rawId = String(item?.id ?? item?.job_id ?? '');
  const id = rawId.replace(/^jobs\//, '');
  const title = cleanText(item?.title);
  if (!id || !title) return null;
  const locations: any[] = Array.isArray(item?.locations) ? item.locations : [];
  const location = cleanText(locations.map((l) => l?.display ?? [l?.city, l?.country].filter(Boolean).join(', ')).join('; '));
  const apply = typeof item?.apply_url === 'string' && item.apply_url.startsWith('http') ? item.apply_url : null;
  return {
    sourceJobId: id,
    title,
    location,
    remote: /remote/i.test(location),
    url: apply ?? `https://www.google.com/about/careers/applications/jobs/results/${encodeURIComponent(id)}`,
    postedAt: parsePostedDate(item?.publish_date ?? item?.created, now),
    typeHint: null,
    levelHint: null,
  };
}

async function google(ctx: CareersContext): Promise<CareersResult> {
  const PAGE = 100;
  const openings: RawOpening[] = [];
  let total: number | null = null;
  for (let page = 1; page <= ctx.maxPages; page++) {
    const data = await ctx.http.json(`https://careers.google.com/api/v3/search/?location=India&page=${page}&page_size=${PAGE}&sort_by=date`);
    total = typeof data?.count === 'number' ? data.count : total;
    const items: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
    for (const item of items) {
      const o = normalizeGoogleJob(item, ctx.now);
      if (o) openings.push(o);
    }
    if (items.length < PAGE || !data?.next_page) return { openings, total, truncated: false };
  }
  return { openings, total, truncated: true };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function fetchCompanyOpenings(company: CompanyDef, ctx: CareersContext): Promise<CareersResult> {
  const a = company.careers;
  if (!a) return { openings: [], total: null, truncated: false };
  const board = (boardId: string) => ({ name: company.name, boardId });
  const fetchImpl = ctx.http.asFetch();
  switch (a.kind) {
    case 'greenhouse':
      return { openings: (await fetchGreenhouseBoard(fetchImpl, board(a.board))).map(fromJobCandidate), total: null, truncated: false };
    case 'lever':
      return { openings: (await fetchLeverBoard(fetchImpl, board(a.board))).map(fromJobCandidate), total: null, truncated: false };
    case 'ashby':
      return { openings: (await fetchAshbyBoard(fetchImpl, board(a.board))).map(fromJobCandidate), total: null, truncated: false };
    case 'workday':
      return workday(a, ctx);
    case 'smartrecruiters':
      return smartRecruiters(a, ctx);
    case 'eightfold':
      return eightfold(a, ctx);
    case 'oracle':
      return oracle(a, ctx);
    case 'amazon':
      return amazon(ctx);
    case 'google':
      return google(ctx);
  }
}

export function openingSource(a: CareersAdapter): OpeningSource {
  return a.kind;
}
