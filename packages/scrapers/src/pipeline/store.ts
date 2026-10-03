import crypto from 'crypto';
import { formatSalary } from './normalize.ts';
import type { ExpireScope, JobStore, PipelineJob, ScrapeRunRecord } from './types.ts';

/** Row shape written to `public.jobs` (see migration 006). */
export interface JobRow {
  job_hash: string;
  company: string;
  title: string;
  location: string;
  description: string;
  apply_url: string;
  canonical_url: string;
  source: string;
  source_key: string;
  source_job_id: string;
  source_tier: number;
  salary_range: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: 'internship' | 'job';
  job_type: string;
  workplace_type: string | null;
  is_remote: boolean;
  experience_level: string;
  seniority: string;
  role_family: string;
  skills: string[];
  quality_score: number;
  posted_at: string | null;
  status: 'active' | 'expired';
  is_active: boolean;
  link_status: string;
  last_seen_at: string;
  expired_at: string | null;
  expire_reason: string | null;
  last_run_id: string;
}

/** Stable identity hash for pipeline rows. Namespaced so it never collides with legacy (company|title|url) hashes. */
export function pipelineJobHash(source: string, sourceJobId: string): string {
  return crypto.createHash('sha256').update(`v2|${source}|${sourceJobId}`).digest('hex');
}

export function toJobRow(job: PipelineJob, ctx: { seenAt: string; runId: string }): JobRow {
  const active = job.status === 'active';
  return {
    job_hash: job.jobHash,
    company: job.company,
    title: job.title,
    location: job.location || (job.remote ? 'Remote' : 'Unspecified'),
    description: job.description.slice(0, 5000),
    apply_url: job.applyUrl,
    canonical_url: job.canonicalUrl,
    source: job.sourceLabel,
    source_key: job.source,
    source_job_id: job.sourceJobId,
    source_tier: job.tier,
    salary_range: formatSalary(job),
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    salary_period: job.salaryPeriod,
    employment_type: job.feedType,
    job_type: job.employmentType,
    workplace_type: job.workplaceType === 'unknown' ? null : job.workplaceType,
    is_remote: job.remote,
    experience_level: job.experienceLevel,
    seniority: job.seniority,
    role_family: job.roleFamily,
    skills: job.skills,
    quality_score: job.qualityScore,
    posted_at: job.postedAt,
    status: job.status,
    is_active: active,
    link_status: job.linkStatus,
    last_seen_at: ctx.seenAt,
    expired_at: active ? null : ctx.seenAt,
    expire_reason: active ? null : job.expireReason,
    last_run_id: ctx.runId,
  };
}

export interface StoredJobRow extends JobRow {
  first_seen_at: string;
  created_at: string;
}

/**
 * In-memory JobStore with the same semantics as the Supabase store. Used by the
 * hermetic tests, the benchmark, and CLI dry runs.
 */
export class MemoryJobStore implements JobStore {
  readonly rows = new Map<string, StoredJobRow>();
  readonly runs: ScrapeRunRecord[] = [];

  private key(source: string, id: string) {
    return `${source}|${id}`;
  }

  async upsertJobs(jobs: PipelineJob[], ctx: { seenAt: string; runId: string }) {
    for (const job of jobs) {
      const row = toJobRow(job, ctx);
      const k = this.key(row.source_key, row.source_job_id);
      const existing = this.rows.get(k);
      this.rows.set(k, {
        ...row,
        first_seen_at: existing?.first_seen_at ?? ctx.seenAt,
        created_at: existing?.created_at ?? ctx.seenAt,
      });
    }
    return { upserted: jobs.length, errors: [] };
  }

  async expireMissing(scope: ExpireScope) {
    let expired = 0;
    const excluded = new Set(scope.excludeCompanies);
    for (const row of this.rows.values()) {
      if (row.source_key !== scope.source || row.status !== 'active') continue;
      if (row.last_seen_at >= scope.seenBefore) continue;
      if (excluded.has(row.company)) continue;
      row.status = 'expired';
      row.is_active = false;
      row.expired_at = scope.at;
      row.expire_reason = scope.reason;
      expired++;
    }
    return { expired };
  }

  async getLastSourceCounts(sources: string[]) {
    const out: Record<string, number | null> = {};
    for (const source of sources) {
      out[source] = null;
      for (let i = this.runs.length - 1; i >= 0; i--) {
        const s = this.runs[i].sources.find(x => x.key === source && x.status !== 'skipped');
        if (s) {
          out[source] = s.fetched;
          break;
        }
      }
    }
    return out;
  }

  async recordRun(run: ScrapeRunRecord) {
    this.runs.push(run);
    return {};
  }

  /** Rows the desktop feed would show (status active). */
  activeRows(): StoredJobRow[] {
    return Array.from(this.rows.values()).filter(r => r.status === 'active' && r.is_active);
  }
}
