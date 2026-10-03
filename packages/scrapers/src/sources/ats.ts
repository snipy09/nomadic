import type { BoardConfig, ScraperConfig } from '../config.ts';
import type { JobInput } from '../pipeline/schema.ts';
import {
  cleanText,
  detectWorkplace,
  mapWorkplace,
  parseEmploymentType,
  parseSalary,
  stripHtml,
  toIsoDate,
} from '../pipeline/normalize.ts';
import {
  emptyResult,
  errorMessage,
  getJson,
  mapLimit,
  type SourceAdapter,
  type SourceContext,
  type SourceFetchResult,
} from './types.ts';

/** Tier 1: official public ATS job-board APIs. */

export interface BoardRecord<T = any> {
  board: BoardConfig;
  item: T;
}

async function fetchBoards<T>(
  ctx: SourceContext,
  boards: BoardConfig[],
  label: string,
  load: (board: BoardConfig) => Promise<T[]>,
): Promise<SourceFetchResult<BoardRecord<T>>> {
  const result = emptyResult<BoardRecord<T>>();
  await mapLimit(boards, ctx.config.sourceConcurrency, async board => {
    try {
      const items = await load(board);
      for (const item of items) result.records.push({ board, item });
    } catch (err) {
      result.errors.push(`${label} ${board.boardId}: ${errorMessage(err)}`);
      result.failedScopes.push(board.name);
    }
  });
  // mapLimit completes boards out of order; restore registry order for stable dedupe.
  const order = new Map(boards.map((b, i) => [b.boardId, i]));
  result.records.sort((a, b) => (order.get(a.board.boardId) ?? 0) - (order.get(b.board.boardId) ?? 0));
  return result;
}

const byBoardScope = (job: { company: string }) => job.company;

// ── Greenhouse ───────────────────────────────────────────────────────────────
// GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true

export const greenhouseSource: SourceAdapter<BoardRecord> = {
  key: 'greenhouse',
  label: 'Greenhouse API',
  tier: 1,
  description: 'Greenhouse public job board API',
  isConfigured: (c: ScraperConfig) => c.boards.greenhouse.length > 0,
  fetchRaw: ctx =>
    fetchBoards(ctx, ctx.config.boards.greenhouse, 'greenhouse', async board => {
      const data = await getJson(ctx, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs?content=true`);
      return Array.isArray(data?.jobs) ? data.jobs : [];
    }),
  normalize({ board, item }): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const location = cleanText(item.location?.name);
    const description = stripHtml(item.content);
    const metadataValues = Array.isArray(item.metadata)
      ? item.metadata.map((m: any) => (typeof m?.value === 'string' ? m.value : Array.isArray(m?.value) ? m.value.join(' ') : '')).join(' ')
      : '';
    const workplace = detectWorkplace(location, item.title, metadataValues);
    return {
      title: cleanText(item.title),
      company: board.name,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.title, metadataValues),
      postedAt: toIsoDate(item.first_published ?? item.updated_at),
      applyUrl: item.absolute_url,
      description,
      source: 'greenhouse',
      sourceLabel: 'Greenhouse API',
      sourceJobId: `${board.boardId}:${item.id ?? item.internal_job_id ?? item.absolute_url}`,
      tier: 1,
      raw: item,
    };
  },
  scopeOf: byBoardScope,
};

// ── Lever ────────────────────────────────────────────────────────────────────
// GET https://api.lever.co/v0/postings/{company}?mode=json

const LEVER_INTERVAL: Record<string, 'hour' | 'day' | 'week' | 'month' | 'year'> = {
  'per-hour-wage': 'hour',
  'per-day-wage': 'day',
  'per-week-salary': 'week',
  'per-month-salary': 'month',
  'per-year-salary': 'year',
};

export const leverSource: SourceAdapter<BoardRecord> = {
  key: 'lever',
  label: 'Lever API',
  tier: 1,
  description: 'Lever public postings API',
  isConfigured: c => c.boards.lever.length > 0,
  fetchRaw: ctx =>
    fetchBoards(ctx, ctx.config.boards.lever, 'lever', async board => {
      const data = await getJson(ctx, `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json`);
      return Array.isArray(data) ? data : [];
    }),
  normalize({ board, item }): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const location = cleanText(item.categories?.location ?? (Array.isArray(item.categories?.allLocations) ? item.categories.allLocations.join(' / ') : ''));
    const workplace = mapWorkplace(item.workplaceType) ?? detectWorkplace(location, item.text);
    const salary = item.salaryRange && typeof item.salaryRange === 'object' ? item.salaryRange : null;
    return {
      title: cleanText(item.text),
      company: board.name,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.categories?.commitment, item.text),
      salaryMin: typeof salary?.min === 'number' ? salary.min : null,
      salaryMax: typeof salary?.max === 'number' ? salary.max : null,
      salaryCurrency: typeof salary?.currency === 'string' ? salary.currency : null,
      salaryPeriod: salary?.interval ? LEVER_INTERVAL[salary.interval] ?? null : null,
      postedAt: toIsoDate(item.createdAt),
      applyUrl: item.hostedUrl || item.applyUrl,
      description: cleanText(item.descriptionPlain ?? stripHtml(item.description), 20000),
      source: 'lever',
      sourceLabel: 'Lever API',
      sourceJobId: `${board.boardId}:${item.id}`,
      tier: 1,
      raw: item,
    };
  },
  scopeOf: byBoardScope,
};

// ── Ashby ────────────────────────────────────────────────────────────────────
// GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true

const ASHBY_INTERVAL: Record<string, 'hour' | 'day' | 'week' | 'month' | 'year'> = {
  '1 HOUR': 'hour', '1 DAY': 'day', '1 WEEK': 'week', '1 MONTH': 'month', '1 YEAR': 'year',
};

export const ashbySource: SourceAdapter<BoardRecord> = {
  key: 'ashby',
  label: 'Ashby API',
  tier: 1,
  description: 'Ashby public job posting API',
  isConfigured: c => c.boards.ashby.length > 0,
  fetchRaw: ctx =>
    fetchBoards(ctx, ctx.config.boards.ashby, 'ashby', async board => {
      const data = await getJson(ctx, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}?includeCompensation=true`);
      return Array.isArray(data?.jobs) ? data.jobs.filter((j: any) => j?.isListed !== false) : [];
    }),
  normalize({ board, item }): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const location = cleanText(typeof item.location === 'string' ? item.location : item.location?.name);
    const workplace = mapWorkplace(item.workplaceType) ?? (item.isRemote ? 'remote' : detectWorkplace(location, item.title));
    const salaryComponent = Array.isArray(item.compensation?.summaryComponents)
      ? item.compensation.summaryComponents.find((c: any) => c?.compensationType === 'Salary')
      : null;
    const fromSummary = !salaryComponent ? parseSalary(item.compensation?.compensationTierSummary) : null;
    return {
      title: cleanText(item.title),
      company: board.name,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.employmentType === 'Intern' ? 'internship' : item.employmentType, item.title),
      salaryMin: salaryComponent?.minValue ?? fromSummary?.min ?? null,
      salaryMax: salaryComponent?.maxValue ?? fromSummary?.max ?? null,
      salaryCurrency: salaryComponent?.currencyCode ?? fromSummary?.currency ?? null,
      salaryPeriod: salaryComponent ? ASHBY_INTERVAL[salaryComponent.interval] ?? null : fromSummary?.period ?? null,
      postedAt: toIsoDate(item.publishedAt ?? item.publishedDate),
      applyUrl: item.jobUrl || `https://jobs.ashbyhq.com/${board.boardId}/${item.id}`,
      description: cleanText(item.descriptionPlain ?? stripHtml(item.descriptionHtml), 20000),
      source: 'ashby',
      sourceLabel: 'Ashby API',
      sourceJobId: `${board.boardId}:${item.id}`,
      tier: 1,
      raw: item,
    };
  },
  scopeOf: byBoardScope,
};

// ── Workable ─────────────────────────────────────────────────────────────────
// GET https://apply.workable.com/api/v1/widget/accounts/{account}?details=true

export const workableSource: SourceAdapter<BoardRecord> = {
  key: 'workable',
  label: 'Workable API',
  tier: 1,
  description: 'Workable public widget API (configure accounts in boards.workable)',
  isConfigured: c => c.boards.workable.length > 0,
  fetchRaw: ctx =>
    fetchBoards(ctx, ctx.config.boards.workable, 'workable', async board => {
      const data = await getJson(ctx, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board.boardId)}?details=true`);
      return Array.isArray(data?.jobs) ? data.jobs : [];
    }),
  normalize({ board, item }): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const location = cleanText([item.city, item.state, item.country].filter(Boolean).join(', '));
    const workplace = item.telecommuting ? 'remote' : detectWorkplace(location, item.title);
    return {
      title: cleanText(item.title),
      company: board.name,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.employment_type, item.title),
      postedAt: toIsoDate(item.published_on ?? item.created_at),
      applyUrl: item.url || item.shortlink || item.application_url,
      description: stripHtml(item.description),
      source: 'workable',
      sourceLabel: 'Workable API',
      sourceJobId: `${board.boardId}:${item.shortcode ?? item.code ?? item.url}`,
      tier: 1,
      raw: item,
    };
  },
  scopeOf: byBoardScope,
};

// ── SmartRecruiters ──────────────────────────────────────────────────────────
// GET https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100

export const smartRecruitersSource: SourceAdapter<BoardRecord> = {
  key: 'smartrecruiters',
  label: 'SmartRecruiters API',
  tier: 1,
  description: 'SmartRecruiters public postings API',
  isConfigured: c => c.boards.smartrecruiters.length > 0,
  fetchRaw: ctx =>
    fetchBoards(ctx, ctx.config.boards.smartrecruiters, 'smartrecruiters', async board => {
      const data = await getJson(ctx, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.boardId)}/postings?limit=100`);
      return Array.isArray(data?.content) ? data.content : [];
    }),
  normalize({ board, item }): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const loc = item.location ?? {};
    const location = cleanText(loc.fullLocation ?? [loc.city, loc.region, loc.country].filter(Boolean).join(', '));
    const workplace = loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : detectWorkplace(location, item.name);
    const companyId = item.company?.identifier ?? board.boardId;
    return {
      title: cleanText(item.name),
      company: board.name,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.typeOfEmployment?.label, item.typeOfEmployment?.id, item.name),
      postedAt: toIsoDate(item.releasedDate),
      applyUrl: item.postingUrl || `https://jobs.smartrecruiters.com/${companyId}/${item.id}`,
      description: '',
      source: 'smartrecruiters',
      sourceLabel: 'SmartRecruiters API',
      sourceJobId: `${board.boardId}:${item.id ?? item.uuid}`,
      tier: 1,
      raw: item,
    };
  },
  scopeOf: byBoardScope,
};
