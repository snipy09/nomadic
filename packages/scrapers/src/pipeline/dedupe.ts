import type { PipelineJob } from '../job-schema.js';

/**
 * Dedupe across all sources by two keys: canonical apply URL, and
 * company + title + location. When two postings collide, the one from the
 * higher tier wins; within a tier, the one with more information wins.
 */

export interface DuplicateRecord {
  job: PipelineJob;
  keptSource: string;
  keptSourceJobId: string;
  key: 'url' | 'company_title_location';
}

export interface DedupeResult {
  kept: PipelineJob[];
  duplicates: DuplicateRecord[];
}

function richness(job: PipelineJob): number {
  return (
    (job.salaryMin !== null || job.salaryMax !== null ? 4 : 0) +
    (job.postedAt ? 2 : 0) +
    (job.location ? 1 : 0) +
    Math.min(3, Math.floor(job.description.length / 500))
  );
}

function preferA(a: PipelineJob, b: PipelineJob): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier;
  return richness(a) >= richness(b);
}

export function dedupeJobs(jobs: PipelineJob[]): DedupeResult {
  // Within one source, (source, sourceJobId) is the identity: keep the first.
  const bySourceId = new Map<string, PipelineJob>();
  const duplicates: DuplicateRecord[] = [];
  for (const job of jobs) {
    const id = `${job.source}:${job.sourceJobId}`;
    const existing = bySourceId.get(id);
    if (existing)
      duplicates.push({ job, keptSource: existing.source, keptSourceJobId: existing.sourceJobId, key: 'url' });
    else bySourceId.set(id, job);
  }

  const byUrl = new Map<string, PipelineJob>();
  const byKey = new Map<string, PipelineJob>();
  const removed = new Set<PipelineJob>();

  for (const job of bySourceId.values()) {
    const urlMatch = byUrl.get(job.canonicalUrl);
    const keyMatch = job.dedupeKey.split('|')[0] && job.dedupeKey.split('|')[1] ? byKey.get(job.dedupeKey) : undefined;
    const match = urlMatch ?? keyMatch;

    if (!match) {
      byUrl.set(job.canonicalUrl, job);
      byKey.set(job.dedupeKey, job);
      continue;
    }

    const key: DuplicateRecord['key'] = urlMatch ? 'url' : 'company_title_location';
    if (preferA(match, job)) {
      removed.add(job);
      duplicates.push({ job, keptSource: match.source, keptSourceJobId: match.sourceJobId, key });
      // Remember the loser's keys so a third copy under either is also caught.
      if (!byUrl.has(job.canonicalUrl)) byUrl.set(job.canonicalUrl, match);
      if (!byKey.has(job.dedupeKey)) byKey.set(job.dedupeKey, match);
    } else {
      removed.add(match);
      duplicates.push({ job: match, keptSource: job.source, keptSourceJobId: job.sourceJobId, key });
      byUrl.set(job.canonicalUrl, job);
      byUrl.set(match.canonicalUrl, job);
      byKey.set(job.dedupeKey, job);
      byKey.set(match.dedupeKey, job);
    }
  }

  return { kept: [...bySourceId.values()].filter((job) => !removed.has(job)), duplicates };
}
