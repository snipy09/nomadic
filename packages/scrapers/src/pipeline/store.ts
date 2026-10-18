import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineJob } from '../job-schema.js';

/**
 * Persistence for the pipeline. `SupabaseJobStore` writes to Postgres (see
 * migration 006_scraper_pipeline.sql); `MemoryJobStore` has the same semantics
 * and backs the tests.
 */

export type JobStatus = 'active' | 'expired';

/** One row of public.jobs as written by the pipeline (first_seen/created_at are DB defaults). */
export interface JobRow {
  job_hash: string;
  source_key: string;
  source_id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  canonical_url: string;
  dedupe_key: string;
  remote: boolean;
  workplace_type: string;
  employment_type: string;
  seniority: string;
  role_family: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_range: string | null;
  posted_at: string | null;
  quality_score: number;
  link_status: string;
  link_checked_at: string | null;
  status: JobStatus;
  is_active: boolean;
  last_seen: string;
  expired_at: null;
  expire_reason: null;
}

export interface ScrapeRunRow {
  run_id: string;
  source: string;
  tier: number;
  status: 'ok' | 'error';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  fetched: number;
  valid: number;
  invalid: number;
  duplicates: number;
  link_failed: number;
  upserted: number;
  expired: number;
  error: string | null;
  alert: string | null;
  published: boolean;
}

export interface JobStore {
  /** Insert or update by (source_key, source_id). Never touches first_seen on update. */
  upsertJobs(rows: JobRow[]): Promise<number>;
  /** Expire active jobs of a source that were not seen since `seenSince`. */
  expireUnseen(sourceKey: string, seenSince: string, reason: string, idPrefix?: string): Promise<number>;
  /** Expire specific jobs (e.g. failed link check). */
  expireByIds(sourceKey: string, sourceIds: string[], reason: string): Promise<number>;
  /** Expire active rows written by the old publishers (no source_id). */
  expireLegacy(reason: string): Promise<number>;
  insertScrapeRuns(rows: ScrapeRunRow[]): Promise<void>;
  /** Latest successful run's `fetched` count per source, for drop alerts. */
  getPreviousFetchCounts(sources: string[]): Promise<Record<string, number>>;
  getRecentScrapeRuns(options?: RecentRunsOptions): Promise<ScrapeRunRow[]>;
  /** Active jobs already published, for cross-run duplicate checks and the new-job cap. */
  getActiveIndex(): Promise<ActiveIndex>;
}

/** Keys are `${source_key}|${source_id}`; dedupe keys and canonical URLs map to the row that holds them. */
export interface ActiveIndex {
  ids: Set<string>;
  byDedupeKey: Map<string, string>;
  byUrl: Map<string, string>;
}

export const rowKey = (sourceKey: string, sourceId: string) => `${sourceKey}|${sourceId}`;

function buildIndex(rows: { source_key: string; source_id: string; dedupe_key?: string | null; canonical_url?: string | null }[]): ActiveIndex {
  const index: ActiveIndex = { ids: new Set(), byDedupeKey: new Map(), byUrl: new Map() };
  for (const row of rows) {
    const key = rowKey(row.source_key, row.source_id);
    index.ids.add(key);
    if (row.dedupe_key && !index.byDedupeKey.has(row.dedupe_key)) index.byDedupeKey.set(row.dedupe_key, key);
    if (row.canonical_url && !index.byUrl.has(row.canonical_url)) index.byUrl.set(row.canonical_url, key);
  }
  return index;
}

export interface RecentRunsOptions {
  limit?: number;
  source?: string;
}

export function jobHashFor(sourceKey: string, sourceId: string): string {
  return createHash('sha256').update(`v2|${sourceKey}|${sourceId}`).digest('hex');
}

function formatSalaryRange(job: PipelineJob): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const fmt = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'));
  const range =
    job.salaryMin === job.salaryMax || job.salaryMax === null
      ? fmt(job.salaryMin)
      : `${fmt(job.salaryMin)} - ${fmt(job.salaryMax)}`;
  return [job.salaryCurrency, range, job.salaryPeriod ? `/${job.salaryPeriod}` : ''].filter(Boolean).join(' ').trim();
}

export function toJobRow(job: PipelineJob, sourceLabel: string, seenAt: string, linkCheckedAt: string | null): JobRow {
  return {
    job_hash: jobHashFor(job.source, job.sourceJobId),
    source_key: job.source,
    source_id: job.sourceJobId,
    source: sourceLabel,
    title: job.title,
    company: job.company,
    location: job.location || (job.remote ? 'Remote' : ''),
    description: job.description.slice(0, 10000),
    apply_url: job.applyUrl,
    canonical_url: job.canonicalUrl,
    dedupe_key: job.dedupeKey,
    remote: job.remote,
    workplace_type: job.workplaceType,
    employment_type: job.employmentType,
    seniority: job.seniority,
    role_family: job.roleFamily,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    salary_period: job.salaryPeriod,
    salary_range: formatSalaryRange(job),
    posted_at: job.postedAt,
    quality_score: job.score,
    link_status: job.linkStatus,
    link_checked_at: linkCheckedAt,
    status: 'active',
    is_active: true,
    last_seen: seenAt,
    expired_at: null,
    expire_reason: null,
  };
}

// ── In-memory store ───────────────────────────────────────────────────────

export interface StoredJob extends Omit<JobRow, 'expired_at' | 'expire_reason'> {
  first_seen: string;
  expired_at: string | null;
  expire_reason: string | null;
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, StoredJob>();
  readonly runs: ScrapeRunRow[] = [];
  /** Rows from the legacy publishers (no source_id), keyed by job_hash. */
  readonly legacy = new Map<string, { status: JobStatus; is_active: boolean }>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private key(sourceKey: string, sourceId: string) {
    return `${sourceKey}\u0000${sourceId}`;
  }

  async upsertJobs(rows: JobRow[]): Promise<number> {
    for (const row of rows) {
      const k = this.key(row.source_key, row.source_id);
      const existing = this.jobs.get(k);
      this.jobs.set(k, { ...row, first_seen: existing?.first_seen ?? row.last_seen });
    }
    return rows.length;
  }

  private expire(job: StoredJob, reason: string) {
    job.status = 'expired';
    job.is_active = false;
    job.expired_at = this.clock().toISOString();
    job.expire_reason = reason;
  }

  async expireUnseen(sourceKey: string, seenSince: string, reason: string, idPrefix?: string): Promise<number> {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.source_key === sourceKey && job.status === 'active' && job.last_seen < seenSince && (!idPrefix || job.source_id.startsWith(idPrefix))) {
        this.expire(job, reason);
        n++;
      }
    }
    return n;
  }

  async expireByIds(sourceKey: string, sourceIds: string[], reason: string): Promise<number> {
    let n = 0;
    for (const id of sourceIds) {
      const job = this.jobs.get(this.key(sourceKey, id));
      if (job && job.status === 'active') {
        this.expire(job, reason);
        n++;
      }
    }
    return n;
  }

  async expireLegacy(): Promise<number> {
    let n = 0;
    for (const row of this.legacy.values()) {
      if (row.status === 'active') {
        row.status = 'expired';
        row.is_active = false;
        n++;
      }
    }
    return n;
  }

  async insertScrapeRuns(rows: ScrapeRunRow[]): Promise<void> {
    this.runs.push(...rows);
  }

  async getPreviousFetchCounts(sources: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const run of [...this.runs].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
      if (run.status === 'ok' && sources.includes(run.source) && !(run.source in out)) out[run.source] = run.fetched;
    }
    return out;
  }

  async getRecentScrapeRuns(options: RecentRunsOptions = {}): Promise<ScrapeRunRow[]> {
    return [...this.runs]
      .filter((run) => !options.source || run.source === options.source)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, options.limit ?? 50);
  }

  async getActiveIndex(): Promise<ActiveIndex> {
    return buildIndex(this.activeJobs());
  }

  /** Feed view: what the app would show. */
  activeJobs(): StoredJob[] {
    return [...this.jobs.values()].filter((job) => job.status === 'active');
  }
}

// ── Supabase store ────────────────────────────────────────────────────────

const UPSERT_BATCH = 200;
const ID_BATCH = 200;

export class SupabaseJobStore implements JobStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async upsertJobs(rows: JobRow[]): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const batch = rows.slice(i, i + UPSERT_BATCH);
      const { error } = await this.client.from('jobs').upsert(batch, { onConflict: 'source_key,source_id' });
      if (error) throw new Error(`jobs upsert failed: ${error.message}`);
      written += batch.length;
    }
    return written;
  }

  private expiredPatch(reason: string) {
    return { status: 'expired', is_active: false, expired_at: this.clock().toISOString(), expire_reason: reason };
  }

  async expireUnseen(sourceKey: string, seenSince: string, reason: string, idPrefix?: string): Promise<number> {
    let query = this.client
      .from('jobs')
      .update(this.expiredPatch(reason))
      .eq('source_key', sourceKey)
      .eq('status', 'active')
      .lt('last_seen', seenSince);
    if (idPrefix) query = query.like('source_id', `${idPrefix.replace(/[\\%_]/g, '\\$&')}%`);
    const { data, error } = await query.select('id');
    if (error) throw new Error(`expire unseen failed: ${error.message}`);
    return data?.length ?? 0;
  }

  async expireByIds(sourceKey: string, sourceIds: string[], reason: string): Promise<number> {
    let n = 0;
    for (let i = 0; i < sourceIds.length; i += ID_BATCH) {
      const { data, error } = await this.client
        .from('jobs')
        .update(this.expiredPatch(reason))
        .eq('source_key', sourceKey)
        .eq('status', 'active')
        .in('source_id', sourceIds.slice(i, i + ID_BATCH))
        .select('id');
      if (error) throw new Error(`expire by id failed: ${error.message}`);
      n += data?.length ?? 0;
    }
    return n;
  }

  async expireLegacy(reason: string): Promise<number> {
    const { data, error } = await this.client
      .from('jobs')
      .update(this.expiredPatch(reason))
      .is('source_id', null)
      .eq('status', 'active')
      .select('id');
    if (error) throw new Error(`expire legacy failed: ${error.message}`);
    return data?.length ?? 0;
  }

  async insertScrapeRuns(rows: ScrapeRunRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from('scrape_runs').insert(rows);
    if (error) throw new Error(`scrape_runs insert failed: ${error.message}`);
  }

  async getPreviousFetchCounts(sources: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    // Latest successful run per source; small table, so a bounded scan is fine.
    const { data, error } = await this.client
      .from('scrape_runs')
      .select('source, fetched, started_at')
      .eq('status', 'ok')
      .in('source', sources)
      .order('started_at', { ascending: false })
      .limit(sources.length * 10);
    if (error) throw new Error(`scrape_runs read failed: ${error.message}`);
    for (const row of data ?? []) {
      if (!(row.source in out)) out[row.source] = row.fetched;
    }
    return out;
  }

  async getRecentScrapeRuns(options: RecentRunsOptions = {}): Promise<ScrapeRunRow[]> {
    return getRecentScrapeRuns(this.client, options);
  }

  async getActiveIndex(): Promise<ActiveIndex> {
    const rows: { source_key: string; source_id: string; dedupe_key: string | null; canonical_url: string | null }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from('jobs')
        .select('source_key, source_id, dedupe_key, canonical_url')
        .eq('status', 'active')
        .not('source_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`active jobs read failed: ${error.message}`);
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < PAGE) break;
    }
    return buildIndex(rows);
  }
}

/**
 * Recent pipeline runs, newest first, for the admin view. Needs a client that
 * can read scrape_runs (service role; RLS allows nothing else).
 */
export async function getRecentScrapeRuns(
  client: SupabaseClient,
  options: RecentRunsOptions = {}
): Promise<ScrapeRunRow[]> {
  let query = client
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 500));
  if (options.source) query = query.eq('source', options.source);
  const { data, error } = await query;
  if (error) throw new Error(`scrape_runs read failed: ${error.message}`);
  return (data ?? []) as ScrapeRunRow[];
}
