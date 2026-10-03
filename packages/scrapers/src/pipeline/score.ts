import type { Job } from './schema.ts';
import type { LinkStatus } from './link-validation.ts';

/**
 * Profile-independent quality score (0-100) stored as `jobs.quality_score`.
 * Per-user relevance stays in `computeRelevanceScore` (index.ts) and is computed
 * on the client against the user's profile.
 */
export function computeQualityScore(job: Job, ctx: { linkStatus: LinkStatus; skills: string[]; now?: number }): number {
  let score = 0;

  // Source trust: official ATS / curated APIs over aggregators and scraping.
  score += job.tier === 1 ? 30 : job.tier === 2 ? 18 : 8;

  // Link confidence.
  if (ctx.linkStatus === 'verified') score += 20;
  else if (ctx.linkStatus === 'unverified') score += job.tier === 1 ? 15 : 6;

  // Freshness.
  if (job.postedAt) {
    const ageDays = ((ctx.now ?? Date.now()) - Date.parse(job.postedAt)) / 86400000;
    if (ageDays <= 3) score += 20;
    else if (ageDays <= 14) score += 14;
    else if (ageDays <= 30) score += 8;
    else if (ageDays <= 60) score += 3;
  } else {
    score += 5;
  }

  // Completeness.
  if (job.salaryMin !== null || job.salaryMax !== null) score += 10;
  if (job.description.length >= 300) score += 8;
  else if (job.description.length >= 80) score += 4;
  if (job.location || job.remote) score += 4;
  if (job.employmentType !== 'unknown') score += 3;
  if (ctx.skills.length >= 3) score += 5;
  else if (ctx.skills.length > 0) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}
