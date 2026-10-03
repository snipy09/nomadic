import { describe, expect, it } from 'vitest';
import { parseJob, type JobCandidate } from '../job-schema.js';

const base: JobCandidate = {
  source: 'greenhouse',
  sourceJobId: 'stripe:123',
  title: 'Software Engineer',
  company: 'Stripe',
  location: 'Bengaluru',
  remote: false,
  applyUrl: 'https://boards.greenhouse.io/stripe/jobs/123',
};

describe('JobSchema / parseJob', () => {
  it('accepts a minimal candidate and applies defaults', () => {
    const result = parseJob(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({
      workplaceType: 'unknown',
      employmentType: 'unknown',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      postedAt: null,
      description: '',
    });
  });

  it('trims strings', () => {
    const result = parseJob({ ...base, title: '  Backend Engineer  ', company: ' Stripe ' });
    expect(result.ok && result.job.title).toBe('Backend Engineer');
    expect(result.ok && result.job.company).toBe('Stripe');
  });

  it.each([
    ['unknown source', { source: 'linkedin' }],
    ['missing id', { sourceJobId: '' }],
    ['one-letter title', { title: 'X' }],
    ['relative apply url', { applyUrl: '/jobs/1' }],
    ['non-http apply url', { applyUrl: 'javascript:alert(1)' }],
    ['lower-case currency', { salaryCurrency: 'usd' }],
    ['negative salary', { salaryMin: -5 }],
    ['min > max', { salaryMin: 200, salaryMax: 100 }],
    ['non-ISO date', { postedAt: 'yesterday' }],
    ['bad employment type', { employmentType: 'gig' }],
  ])('rejects %s', (_, patch) => {
    const result = parseJob({ ...base, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('accepts ISO dates with offsets', () => {
    expect(parseJob({ ...base, postedAt: '2026-09-01T10:00:00+05:30' }).ok).toBe(true);
    expect(parseJob({ ...base, postedAt: '2026-09-01T10:00:00.000Z' }).ok).toBe(true);
  });

  it('reports the failing path in issues', () => {
    const result = parseJob({ ...base, applyUrl: 'nope' });
    expect(!result.ok && result.issues[0]).toMatch(/^applyUrl:/);
  });
});
