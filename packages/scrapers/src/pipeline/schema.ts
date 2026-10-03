import { z } from 'zod';

/**
 * Normalized job schema (Phase 2, Step 2.1).
 *
 * Every source adapter maps its raw records to `JobInput`; `parseJob` validates
 * them at the boundary. Records that fail validation are logged and dropped.
 */

export const SOURCE_TIERS = [1, 2, 3] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'temporary', 'unknown'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORKPLACE_TYPES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const SALARY_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(value => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');

const isoDate = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)), 'must be an ISO-8601 date');

export const JobSchema = z
  .object({
    title: z.string().trim().min(2).max(300),
    company: z.string().trim().min(1).max(200),
    location: z.string().trim().max(300),
    remote: z.boolean(),
    workplaceType: z.enum(WORKPLACE_TYPES),
    salaryMin: z.number().finite().nonnegative().nullable(),
    salaryMax: z.number().finite().nonnegative().nullable(),
    salaryCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    salaryPeriod: z.enum(SALARY_PERIODS).nullable(),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    postedAt: isoDate.nullable(),
    applyUrl: httpUrl,
    description: z.string(),
    /** Stable source key, e.g. `greenhouse`, `internshala`. */
    source: z.string().regex(/^[a-z0-9_-]+$/),
    /** Human-readable label kept in `jobs.source` for backwards compatibility. */
    sourceLabel: z.string().min(1),
    sourceJobId: z.string().trim().min(1).max(500),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    raw: z.unknown(),
  })
  .refine(job => job.salaryMin === null || job.salaryMax === null || job.salaryMin <= job.salaryMax, {
    message: 'salaryMin must be <= salaryMax',
    path: ['salaryMin'],
  });

export type Job = z.infer<typeof JobSchema>;

/** What adapters produce; defaults are filled in by `parseJob`. */
export interface JobInput {
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean | null;
  workplaceType?: WorkplaceType | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  employmentType?: EmploymentType | null;
  postedAt?: string | null;
  applyUrl: string;
  description?: string | null;
  source: string;
  sourceLabel: string;
  sourceJobId: string | number;
  tier: SourceTier;
  raw: unknown;
}

export type ParseJobResult =
  | { ok: true; job: Job }
  | { ok: false; issues: string[] };

export function parseJob(input: JobInput): ParseJobResult {
  const workplaceType: WorkplaceType = input.workplaceType ?? (input.remote ? 'remote' : 'unknown');
  const candidate = {
    title: input.title,
    company: input.company,
    location: input.location ?? '',
    remote: input.remote ?? workplaceType === 'remote',
    workplaceType,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency ? input.salaryCurrency.toUpperCase() : null,
    salaryPeriod: input.salaryPeriod ?? null,
    employmentType: input.employmentType ?? 'unknown',
    postedAt: input.postedAt ?? null,
    applyUrl: input.applyUrl,
    description: input.description ?? '',
    source: input.source,
    sourceLabel: input.sourceLabel,
    sourceJobId: input.sourceJobId === undefined || input.sourceJobId === null ? '' : String(input.sourceJobId),
    tier: input.tier,
    raw: input.raw,
  };
  const result = JobSchema.safeParse(candidate);
  if (result.success) return { ok: true, job: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
