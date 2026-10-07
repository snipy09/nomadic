import type { CompanyDef } from '../feed/companies.js';
import { fetchCompanyOpenings, type RawOpening } from '../feed/careers.js';
import { PoliteFetcher } from '../feed/http.js';
import { classifyKind } from '../feed/schema.js';
import type { EmploymentType, JobCandidate } from '../job-schema.js';
import { detectWorkplace } from '../pipeline/normalize.js';
import type { FetchLike } from './ats.js';

/**
 * Company careers sites on the job board: the same listings the feed scraper reads for company snapshots (Workday,
 * SmartRecruiters, Eightfold, Oracle, amazon.jobs, Google careers), turned into job board rows. Greenhouse, Lever and
 * Ashby companies are read by their own sources instead (their board lists include these companies).
 */

export const CAREERS_KINDS = new Set(['workday', 'smartrecruiters', 'eightfold', 'oracle', 'amazon', 'google']);

const KIND_TO_EMPLOYMENT: Record<string, EmploymentType> = { internship: 'internship', full_time: 'full_time', other: 'unknown', unknown: 'unknown' };

export function openingToCandidate(company: CompanyDef, raw: RawOpening): JobCandidate {
  const { workplaceType, remote } = detectWorkplace(null, raw.location, raw.title);
  return {
    source: 'careers',
    sourceJobId: `${company.slug}:${raw.sourceJobId}`.slice(0, 256),
    title: raw.title,
    company: company.name,
    location: raw.location,
    remote: raw.remote || remote,
    workplaceType: raw.remote ? 'remote' : workplaceType,
    employmentType: KIND_TO_EMPLOYMENT[classifyKind(raw.title, raw.typeHint)],
    postedAt: raw.postedAt,
    applyUrl: raw.url,
    description: '',
    raw: { company: company.slug, kind: company.careers?.kind },
  };
}

export interface CareersJobsOptions {
  companies: CompanyDef[];
  maxPages: number;
  now: Date;
  warn: (message: string) => void;
  concurrency?: number;
}

export async function fetchCareersJobs(fetchImpl: FetchLike, options: CareersJobsOptions): Promise<JobCandidate[]> {
  const http = new PoliteFetcher({ fetchImpl });
  const picked = options.companies.filter((c) => c.careers && CAREERS_KINDS.has(c.careers.kind));
  const out: JobCandidate[] = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < picked.length) {
      const company = picked[next++];
      try {
        const result = await fetchCompanyOpenings(company, { http, maxPages: options.maxPages, now: options.now });
        if (result.truncated) options.warn(`${company.slug}: stopped after ${options.maxPages} pages (more listed)`);
        out.push(...result.openings.map((o) => openingToCandidate(company, o)));
      } catch (err) {
        failed++;
        options.warn(`${company.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, picked.length)) }, worker));
  if (picked.length > 0 && failed === picked.length) throw new Error(`all ${picked.length} careers sites failed`);
  return out;
}
