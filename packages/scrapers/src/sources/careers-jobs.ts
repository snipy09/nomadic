import type { CompanyDef } from '../feed/companies.js';
import { fetchCompanyOpenings, type RawOpening } from '../feed/careers.js';
import { BlockedByRobotsError, PoliteFetcher } from '../feed/http.js';
import { classifyKind } from '../feed/schema.js';
import type { EmploymentType, JobCandidate } from '../job-schema.js';
import { detectWorkplace } from '../pipeline/normalize.js';
import type { FetchLike } from './ats.js';

/**
 * Company careers sites on the job board: the same listings the feed scraper reads for company snapshots (Workday,
 * SmartRecruiters, Eightfold, Oracle, amazon.jobs), turned into job board rows. Greenhouse, Lever and
 * Ashby companies are read by their own sources instead (their board lists include these companies).
 */

export const CAREERS_KINDS = new Set(['workday', 'smartrecruiters', 'eightfold', 'oracle', 'amazon']);

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
  /** Called with `${slug}:` for each company whose whole listing was read (not cut at maxPages, no error). */
  complete?: (idPrefix: string) => void;
  concurrency?: number;
}

export async function fetchCareersJobs(fetchImpl: FetchLike, options: CareersJobsOptions): Promise<JobCandidate[]> {
  const http = new PoliteFetcher({ fetchImpl });
  const picked = options.companies.filter((c) => c.careers && CAREERS_KINDS.has(c.careers.kind));
  const out: JobCandidate[] = [];
  let failed = 0;
  let next = 0;
  // A platform whose robots.txt disallows its API (SmartRecruiters) is the same for every company on it.
  const blocked = new Map<string, number>();
  const worker = async () => {
    while (next < picked.length) {
      const company = picked[next++];
      const kind = company.careers!.kind;
      if (blocked.has(kind)) {
        blocked.set(kind, blocked.get(kind)! + 1);
        failed++;
        continue;
      }
      try {
        const result = await fetchCompanyOpenings(company, { http, maxPages: options.maxPages, now: options.now });
        if (result.truncated) options.warn(`${company.slug}: stopped after ${options.maxPages} pages (more listed)`);
        else options.complete?.(`${company.slug}:`);
        out.push(...result.openings.map((o) => openingToCandidate(company, o)));
      } catch (err) {
        failed++;
        if (err instanceof BlockedByRobotsError && err.reason === null) blocked.set(kind, 0);
        options.warn(`${company.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, picked.length)) }, worker));
  for (const [kind, skipped] of blocked) if (skipped) options.warn(`${kind}: robots.txt disallows its API; ${skipped} more ${kind} companies skipped`);
  if (picked.length > 0 && failed === picked.length) throw new Error(`all ${picked.length} careers sites failed`);
  return out;
}
