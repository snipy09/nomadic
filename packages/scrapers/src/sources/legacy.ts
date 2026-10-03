import type { RawJob } from '../ats-api-scraper.js';
import type { InternshalaJob } from '../internshala-scraper.js';
import type { JobCandidate, SourceId } from '../job-schema.js';
import {
  cleanText,
  detectWorkplace,
  htmlToText,
  normalizeEmploymentType,
  parseSalaryText,
  stableIdFromUrl,
  toIsoDate,
} from '../pipeline/normalize.js';

/**
 * Adapters from the legacy RawJob shape (tier 2/3 scrapers and Internshala) to
 * JobCandidate. These sources have no native ids, so the id is derived from the
 * canonical apply URL, which is stable across runs.
 */

const PLACEHOLDER_LOCATIONS = /^(remote \/ unspecified|india \/ remote|unspecified)$/i;

export function rawJobToCandidate(
  raw: RawJob & Partial<Pick<InternshalaJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'>>,
  source: SourceId,
  options: { sourceJobId?: string; now?: Date } = {}
): JobCandidate {
  const title = cleanText(raw.title);
  const rawLocation = cleanText(raw.location);
  const location = PLACEHOLDER_LOCATIONS.test(rawLocation) ? '' : rawLocation;
  const { workplaceType, remote } = detectWorkplace(
    raw.workplaceType === 'remote' ? 'remote' : null,
    rawLocation,
    title
  );

  const hasStructuredSalary = raw.salaryMin != null || raw.salaryMax != null;
  const parsed = hasStructuredSalary ? null : parseSalaryText(raw.salary);

  const employmentHint = raw.employmentType === 'internship' ? 'internship' : null;

  return {
    source,
    sourceJobId: options.sourceJobId ?? stableIdFromUrl(raw.applyUrl),
    title,
    company: cleanText(raw.company, 200),
    location,
    remote,
    workplaceType,
    salaryMin: hasStructuredSalary ? (raw.salaryMin ?? null) : parsed!.min,
    salaryMax: hasStructuredSalary ? (raw.salaryMax ?? null) : parsed!.max,
    salaryCurrency: hasStructuredSalary ? (raw.salaryCurrency ?? null) : parsed!.currency,
    salaryPeriod: hasStructuredSalary
      ? raw.salaryPeriod === 'lump-sum'
        ? null
        : (raw.salaryPeriod ?? null)
      : parsed!.period,
    employmentType: normalizeEmploymentType(employmentHint, title),
    postedAt: toIsoDate(raw.createdAt, options.now),
    applyUrl: raw.applyUrl,
    description: htmlToText(raw.description),
    raw: { legacySource: raw.source },
  };
}

/** Internshala detail slugs end in a numeric id; use it when present. */
export function internshalaSourceId(applyUrl: string): string {
  const slug = applyUrl.split('/detail/')[1] ?? '';
  const numeric = slug.match(/(\d{4,})$/);
  return numeric ? numeric[1] : slug || stableIdFromUrl(applyUrl);
}

/**
 * Internshala listing results only carry a scrape timestamp, not a posting date,
 * so postedAt stays empty rather than pretending the job was posted just now.
 */
export function internshalaToCandidate(job: InternshalaJob): JobCandidate {
  // The listing scraper uses "India / Remote" as a placeholder; the slug is the only
  // reliable remote signal ("work-from-home-...").
  const isPlaceholder = job.location === 'India / Remote';
  const remote = isPlaceholder ? /work-from-home/.test(job.applyUrl) : /remote|work from home/i.test(job.location);
  return {
    ...rawJobToCandidate({ ...job, createdAt: undefined }, 'internshala', {
      sourceJobId: internshalaSourceId(job.applyUrl),
    }),
    location: isPlaceholder ? 'India' : cleanText(job.location),
    remote,
    workplaceType: remote ? 'remote' : 'unknown',
  };
}
