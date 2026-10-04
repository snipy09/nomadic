import type { JobCandidate } from '../job-schema.js';
import {
  cleanText,
  detectWorkplace,
  htmlToText,
  normalizeCurrency,
  normalizeEmploymentType,
  normalizeSalaryPeriod,
  parseSalaryText,
  toIsoDate,
  toNumberOrNull,
} from '../pipeline/normalize.js';

/**
 * Tier 1 adapters for official public job-board APIs. Each maps the API's
 * native payload straight to a JobCandidate, keeping the native job id.
 */

export interface BoardConfig {
  /** Display name used as the company. */
  name: string;
  /** Board token / slug in the ATS URL. */
  boardId: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'NomadicJobPipeline/1.0 (+https://github.com/snipy09/nomadic)',
};

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs = 15000): Promise<any> {
  const res = await fetchImpl(url, { headers: JSON_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Runs one fetch per board; a failing board is reported but does not fail the source. */
export async function fetchBoards(
  boards: BoardConfig[],
  fetchBoard: (board: BoardConfig) => Promise<JobCandidate[]>,
  onBoardError: (board: BoardConfig, err: Error) => void,
  concurrency = 4
): Promise<JobCandidate[]> {
  const out: JobCandidate[] = [];
  const failures: Error[] = [];
  for (let i = 0; i < boards.length; i += concurrency) {
    const chunk = boards.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((board) => fetchBoard(board)));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        out.push(...result.value);
        return;
      }
      const err = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      failures.push(err);
      onBoardError(chunk[idx], err);
    });
  }
  if (boards.length > 0 && failures.length === boards.length) {
    throw new Error(`all ${boards.length} boards failed (first: ${failures[0].message})`);
  }
  return out;
}

// ── Greenhouse: https://developers.greenhouse.io/job-board.html ─────────────

export function normalizeGreenhouseJob(item: any, board: BoardConfig, now = new Date()): JobCandidate {
  const title = cleanText(item?.title);
  const location = cleanText(item?.location?.name);
  const { workplaceType, remote } = detectWorkplace(null, location, title);
  return {
    source: 'greenhouse',
    sourceJobId: `${board.boardId}:${item?.id}`,
    title,
    company: board.name,
    location,
    remote,
    workplaceType,
    employmentType: normalizeEmploymentType(null, title),
    postedAt: toIsoDate(item?.first_published ?? item?.updated_at, now),
    applyUrl: String(item?.absolute_url ?? ''),
    description: htmlToText(item?.content),
    raw: { id: item?.id, board: board.boardId },
  };
}

export async function fetchGreenhouseBoard(fetchImpl: FetchLike, board: BoardConfig): Promise<JobCandidate[]> {
  const data = await getJson(
    fetchImpl,
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs?content=true`
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs
    .filter((item: any) => item?.id && item?.absolute_url)
    .map((item: any) => normalizeGreenhouseJob(item, board));
}

// ── Lever: https://github.com/lever/postings-api ───────────────────────────

export function normalizeLeverJob(item: any, board: BoardConfig, now = new Date()): JobCandidate {
  const title = cleanText(item?.text);
  const location = cleanText(item?.categories?.location ?? item?.categories?.allLocations?.join(', '));
  const { workplaceType, remote } = detectWorkplace(item?.workplaceType, location, title);
  const salary = item?.salaryRange;
  const min = toNumberOrNull(salary?.min);
  const max = toNumberOrNull(salary?.max);
  return {
    source: 'lever',
    sourceJobId: `${board.boardId}:${item?.id}`,
    title,
    company: board.name,
    location,
    remote,
    workplaceType,
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: min !== null || max !== null ? normalizeCurrency(salary?.currency) : null,
    salaryPeriod: min !== null || max !== null ? normalizeSalaryPeriod(salary?.interval) : null,
    employmentType: normalizeEmploymentType(item?.categories?.commitment, title),
    postedAt: toIsoDate(item?.createdAt, now),
    applyUrl: String(item?.hostedUrl ?? item?.applyUrl ?? ''),
    description: cleanText(item?.descriptionPlain ?? htmlToText(item?.description), 20000),
    raw: { id: item?.id, board: board.boardId },
  };
}

export async function fetchLeverBoard(fetchImpl: FetchLike, board: BoardConfig): Promise<JobCandidate[]> {
  const data = await getJson(
    fetchImpl,
    `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json`
  );
  const jobs = Array.isArray(data) ? data : [];
  return jobs
    .filter((item: any) => item?.id && (item?.hostedUrl || item?.applyUrl))
    .map((item: any) => normalizeLeverJob(item, board));
}

// ── Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api ──────

const ASHBY_EMPLOYMENT: Record<string, string> = {
  FullTime: 'full_time',
  PartTime: 'part_time',
  Intern: 'internship',
  Contract: 'contract',
  Temporary: 'contract',
};

export function normalizeAshbyJob(item: any, board: BoardConfig, now = new Date()): JobCandidate {
  const title = cleanText(item?.title);
  const location = cleanText(typeof item?.location === 'string' ? item.location : item?.location?.name);
  const hint = item?.workplaceType ?? (item?.isRemote ? 'remote' : null);
  const { workplaceType, remote } = detectWorkplace(hint, location, title);

  const salaryComponent = (item?.compensation?.summaryComponents ?? []).find(
    (c: any) => c?.compensationType === 'Salary'
  );
  const min = toNumberOrNull(salaryComponent?.minValue);
  const max = toNumberOrNull(salaryComponent?.maxValue);
  const hasSalary = min !== null || max !== null;

  return {
    source: 'ashby',
    sourceJobId: `${board.boardId}:${item?.id}`,
    title,
    company: board.name,
    location,
    remote,
    workplaceType,
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: hasSalary ? normalizeCurrency(salaryComponent?.currencyCode) : null,
    salaryPeriod: hasSalary ? normalizeSalaryPeriod(salaryComponent?.interval) : null,
    employmentType: normalizeEmploymentType(ASHBY_EMPLOYMENT[item?.employmentType] ?? item?.employmentType, title),
    postedAt: toIsoDate(item?.publishedAt, now),
    applyUrl: String(item?.jobUrl ?? `https://jobs.ashbyhq.com/${board.boardId}/${item?.id}`),
    description: cleanText(item?.descriptionPlain ?? htmlToText(item?.descriptionHtml), 20000),
    raw: { id: item?.id, board: board.boardId },
  };
}

/**
 * Whether the company's hosted Ashby pages (jobs.ashbyhq.com/<board>/...) are switched on. Some companies
 * (e.g. Cursor) turn them off and list jobs on their own site, while the posting API keeps returning
 * jobUrls on jobs.ashbyhq.com that render "Page not found" (with HTTP 200, so the link check passes).
 * Ashby's page itself asks this GraphQL query and gets organization null. Any error counts as enabled.
 */
export async function ashbyHostedPageEnabled(fetchImpl: FetchLike, boardId: string): Promise<boolean> {
  try {
    const res = await fetchImpl('https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiOrganizationFromHostedJobsPageName', {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        operationName: 'ApiOrganizationFromHostedJobsPageName',
        variables: { organizationHostedJobsPageName: boardId, searchContext: 'JobPosting' },
        query:
          'query ApiOrganizationFromHostedJobsPageName($organizationHostedJobsPageName: String!, $searchContext: OrganizationSearchContext) { organization: organizationFromHostedJobsPageName(organizationHostedJobsPageName: $organizationHostedJobsPageName, searchContext: $searchContext) { name } }',
      }),
    });
    if (!res.ok) return true;
    const body: any = await res.json();
    return !(body && body.data && 'organization' in body.data && body.data.organization === null);
  } catch {
    return true;
  }
}

export async function fetchAshbyBoard(fetchImpl: FetchLike, board: BoardConfig): Promise<JobCandidate[]> {
  const data = await getJson(
    fetchImpl,
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}?includeCompensation=true`
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const listed = jobs.filter((item: any) => item?.id && item?.isListed !== false);
  // No jobs rather than a failed board: the board's old rows then expire as unseen.
  if (listed.length && !(await ashbyHostedPageEnabled(fetchImpl, board.boardId))) {
    console.warn(`[ashby] ${board.name}: hosted job pages are off (links show "Page not found"); skipping ${listed.length} jobs`);
    return [];
  }
  return listed.map((item: any) => normalizeAshbyJob(item, board));
}

// ── Remotive: https://remotive.com/api-documentation ───────────────────────

export function normalizeRemotiveJob(item: any, now = new Date()): JobCandidate {
  const title = cleanText(item?.title);
  const location = cleanText(item?.candidate_required_location) || 'Remote';
  const salary = parseSalaryText(item?.salary);
  return {
    source: 'remotive',
    sourceJobId: String(item?.id),
    title,
    company: cleanText(item?.company_name, 200),
    location,
    remote: true,
    workplaceType: 'remote',
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryPeriod: salary.period,
    employmentType: normalizeEmploymentType(item?.job_type, title),
    postedAt: toIsoDate(item?.publication_date, now),
    applyUrl: String(item?.url ?? ''),
    description: htmlToText(item?.description),
    raw: { id: item?.id, category: item?.category },
  };
}

export async function fetchRemotive(fetchImpl: FetchLike, category = 'software-dev'): Promise<JobCandidate[]> {
  const data = await getJson(
    fetchImpl,
    `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`
  );
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.filter((item: any) => item?.id && item?.url).map((item: any) => normalizeRemotiveJob(item));
}
