import { describe, expect, it } from 'vitest';
import type { PipelineJob } from '../job-schema.js';
import { dedupeJobs } from '../pipeline/dedupe.js';
import { canonicalizeUrl, dedupeKeyFor } from '../pipeline/normalize.js';

function job(patch: Partial<PipelineJob> & Pick<PipelineJob, 'source' | 'sourceJobId' | 'applyUrl'>): PipelineJob {
  const merged = {
    title: 'Backend Engineer',
    company: 'Acme',
    location: 'Bangalore',
    remote: false,
    workplaceType: 'unknown',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    employmentType: 'full_time',
    postedAt: null,
    description: '',
    tier: 1,
    roleFamily: 'backend',
    seniority: 'unknown',
    linkStatus: 'unchecked',
    score: 0,
    ...patch,
  } as PipelineJob;
  return { ...merged, canonicalUrl: canonicalizeUrl(merged.applyUrl), dedupeKey: dedupeKeyFor(merged) };
}

describe('dedupeJobs', () => {
  it('drops a second copy with the same canonical URL', () => {
    const a = job({ source: 'lever', sourceJobId: 'acme:1', applyUrl: 'https://jobs.lever.co/acme/1' });
    const b = job({
      source: 'rss',
      sourceJobId: 'x',
      applyUrl: 'https://jobs.lever.co/acme/1/apply?utm_source=rss',
      title: 'Different title',
      tier: 2,
    });
    const { kept, duplicates } = dedupeJobs([b, a]);
    expect(kept).toEqual([a]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ key: 'url', keptSource: 'lever' });
    expect(duplicates[0].job.source).toBe('rss');
  });

  it('drops copies with the same company + title + location across sources', () => {
    const a = job({
      source: 'greenhouse',
      sourceJobId: 'acme:9',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/9',
    });
    const b = job({
      source: 'jobicy',
      sourceJobId: 'j1',
      applyUrl: 'https://jobicy.com/jobs/1',
      company: 'Acme Inc.',
      location: 'Bengaluru',
      tier: 2,
    });
    const { kept, duplicates } = dedupeJobs([a, b]);
    expect(kept.map((j) => j.source)).toEqual(['greenhouse']);
    expect(duplicates[0].key).toBe('company_title_location');
  });

  it('within the same tier keeps the richer posting', () => {
    const poor = job({
      source: 'internshala',
      sourceJobId: 'i1',
      applyUrl: 'https://internshala.com/internship/detail/x-at-acme1',
    });
    const rich = job({
      source: 'remotive',
      sourceJobId: 'r1',
      applyUrl: 'https://remotive.com/remote-jobs/software-dev/x-1',
      salaryMin: 1,
      salaryMax: 2,
      postedAt: '2026-09-01T00:00:00.000Z',
    });
    const { kept } = dedupeJobs([poor, rich]);
    expect(kept.map((j) => j.source)).toEqual(['remotive']);
  });

  it('keeps one row per (source, sourceJobId)', () => {
    const a = job({ source: 'lever', sourceJobId: 'acme:1', applyUrl: 'https://jobs.lever.co/acme/1' });
    const { kept, duplicates } = dedupeJobs([a, { ...a }]);
    expect(kept).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it('keeps different jobs at the same company', () => {
    const a = job({ source: 'lever', sourceJobId: 'acme:1', applyUrl: 'https://jobs.lever.co/acme/1' });
    const b = job({
      source: 'lever',
      sourceJobId: 'acme:2',
      applyUrl: 'https://jobs.lever.co/acme/2',
      title: 'Frontend Engineer',
    });
    const c = job({
      source: 'lever',
      sourceJobId: 'acme:3',
      applyUrl: 'https://jobs.lever.co/acme/3',
      location: 'Pune',
    });
    expect(dedupeJobs([a, b, c]).kept).toHaveLength(3);
  });

  it('catches a third copy that only matches the dropped one', () => {
    const t1 = job({ source: 'ashby', sourceJobId: 'a', applyUrl: 'https://jobs.ashbyhq.com/acme/a' });
    const t2 = job({ source: 'rss', sourceJobId: 'r', applyUrl: 'https://feed.example.com/job/7', tier: 2 });
    const t3 = job({
      source: 'arbeitnow',
      sourceJobId: 'n',
      applyUrl: 'https://feed.example.com/job/7?utm_campaign=z',
      title: 'Other',
      tier: 2,
    });
    const { kept, duplicates } = dedupeJobs([t1, t2, t3]);
    expect(kept.map((j) => j.source)).toEqual(['ashby']);
    expect(duplicates).toHaveLength(2);
  });
});
