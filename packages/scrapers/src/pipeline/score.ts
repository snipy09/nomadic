import type { LinkStatus } from '../job-schema.js';

/**
 * Feed quality score (0-100). Not personal relevance (that is computed per user
 * from skills); this ranks how trustworthy and complete a posting is.
 */
export interface ScoreInput {
  tier: 1 | 2 | 3;
  linkStatus: LinkStatus;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  location: string;
  remote: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

export function scoreJob(job: ScoreInput, now: Date = new Date()): number {
  let score = job.tier === 1 ? 40 : job.tier === 2 ? 25 : 10;

  if (job.linkStatus === 'ok') score += 20;
  else if (job.linkStatus === 'unknown' || job.linkStatus === 'unchecked') score += 5;

  if (job.postedAt) {
    const ageDays = (now.getTime() - Date.parse(job.postedAt)) / DAY_MS;
    if (ageDays <= 7) score += 15;
    else if (ageDays <= 30) score += 8;
    else if (ageDays <= 60) score += 3;
  }

  if (job.salaryMin !== null || job.salaryMax !== null) score += 10;
  if (job.description.length >= 200) score += 10;
  if (job.location || job.remote) score += 5;

  return Math.max(0, Math.min(100, score));
}
