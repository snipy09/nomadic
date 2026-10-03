import type { Job, SourceTier } from './schema.ts';
import type { LinkStatus } from './link-validation.ts';
import type { RoleFamily, Seniority } from './classify.ts';

export type JobStatus = 'active' | 'expired';

/** A job after every pipeline stage, ready to upsert. */
export interface PipelineJob extends Job {
  jobHash: string;
  canonicalUrl: string;
  linkStatus: LinkStatus;
  linkReason: string | null;
  roleFamily: RoleFamily;
  seniority: Seniority;
  feedType: 'internship' | 'job';
  experienceLevel: 'entry' | 'mid' | 'senior';
  skills: string[];
  qualityScore: number;
  status: JobStatus;
  expireReason: string | null;
}

export type SourceRunStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export interface SourceRunStats {
  key: string;
  label: string;
  tier: SourceTier;
  status: SourceRunStatus;
  /** Raw records returned by the source. */
  fetched: number;
  /** Records that passed normalization + zod validation. */
  valid: number;
  /** Records dropped by normalization/zod or by the canonical link guard. */
  invalid: number;
  /** Valid records dropped as cross/intra-source duplicates. */
  duplicates: number;
  /** Closed/expired signals (detail 404, closed phrases, dead links). */
  closed: number;
  /** Active jobs written (or that would be written without --publish). */
  published: number;
  /** Previously active jobs marked expired because they disappeared. */
  expired: number;
  durationMs: number;
  errors: string[];
  skipReason?: string;
}

export interface ScrapeAlert {
  source: string;
  kind: 'zero' | 'drop';
  current: number;
  previous: number | null;
  message: string;
}

export interface ScrapeRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'ok' | 'partial' | 'failed';
  trigger: string;
  sourcesRequested: string[];
  published: boolean;
  totals: {
    fetched: number;
    valid: number;
    invalid: number;
    duplicates: number;
    closed: number;
    published: number;
    expired: number;
  };
  alerts: ScrapeAlert[];
  error: string | null;
  sources: SourceRunStats[];
}

export interface ExpireScope {
  source: string;
  /** Expire active rows of `source` whose last_seen_at is older than this. */
  seenBefore: string;
  /** Companies whose fetch failed this run: their rows are left alone. */
  excludeCompanies: string[];
  reason: string;
  at: string;
}

export interface JobStore {
  upsertJobs(jobs: PipelineJob[], ctx: { seenAt: string; runId: string }): Promise<{ upserted: number; errors: string[] }>;
  expireMissing(scope: ExpireScope): Promise<{ expired: number; error?: string }>;
  /** Fetched count of each source's most recent non-skipped run (null if none). */
  getLastSourceCounts(sources: string[]): Promise<Record<string, number | null>>;
  recordRun(run: ScrapeRunRecord): Promise<{ error?: string }>;
  /** Optional DB-side lifecycle maintenance (expire long-unseen, purge old expired). */
  maintainLifecycle?(): Promise<{ result?: unknown; error?: string }>;
}
