import { z } from 'zod';

/**
 * The one normalized job shape every source must produce.
 * Sources emit candidates; `parseJob` validates them at the boundary and the
 * pipeline drops (and logs) anything that does not match.
 */

export const SOURCE_IDS = [
  // Tier 1: official APIs and Internshala
  'greenhouse',
  'lever',
  'ashby',
  'remotive',
  'internshala',
  // Tier 2: RSS and niche boards
  'rss',
  'arbeitnow',
  'jobicy',
  // Tier 3: opt-in only
  'naukri',
  'indeed',
  'web-search',
  'dom',
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'unknown'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORKPLACE_TYPES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');

export const JobSchema = z
  .object({
    source: z.enum(SOURCE_IDS),
    sourceJobId: z.string().trim().min(1).max(256),
    title: z.string().trim().min(2).max(300),
    company: z.string().trim().min(1).max(200),
    location: z.string().trim().max(300).default(''),
    remote: z.boolean(),
    workplaceType: z.enum(WORKPLACE_TYPES).default('unknown'),
    salaryMin: z.number().finite().nonnegative().nullable().default(null),
    salaryMax: z.number().finite().nonnegative().nullable().default(null),
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'ISO 4217 code')
      .nullable()
      .default(null),
    salaryPeriod: z.enum(SALARY_PERIODS).nullable().default(null),
    employmentType: z.enum(EMPLOYMENT_TYPES).default('unknown'),
    postedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    applyUrl: httpUrl,
    description: z.string().max(20000).default(''),
    raw: z.unknown().optional(),
  })
  .refine((job) => job.salaryMin === null || job.salaryMax === null || job.salaryMin <= job.salaryMax, {
    message: 'salaryMin must be <= salaryMax',
    path: ['salaryMin'],
  });

/** What a source adapter hands to the pipeline (defaults not yet applied). */
export type JobCandidate = z.input<typeof JobSchema>;
/** A validated job. */
export type Job = z.output<typeof JobSchema>;

export type ParseJobResult = { ok: true; job: Job } | { ok: false; issues: string[] };

export function parseJob(candidate: unknown): ParseJobResult {
  const result = JobSchema.safeParse(candidate);
  if (result.success) return { ok: true, job: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  };
}

export const ROLE_FAMILIES = [
  'frontend',
  'backend',
  'full_stack',
  'data_analyst',
  'data_ml',
  'product_manager',
  'design',
  'devops',
  'other',
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const SENIORITIES = ['intern', 'entry', 'mid', 'senior', 'lead', 'unknown'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export type LinkStatus = 'ok' | 'dead' | 'closed' | 'invalid' | 'unknown' | 'unchecked';

/** A validated job after the pipeline's enrichment stages. */
export interface PipelineJob extends Job {
  tier: 1 | 2 | 3;
  canonicalUrl: string;
  dedupeKey: string;
  roleFamily: RoleFamily;
  seniority: Seniority;
  linkStatus: LinkStatus;
  linkReason?: string;
  score: number;
}
