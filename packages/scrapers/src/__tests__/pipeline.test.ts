import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canonicalUrl, dedupeJobs, detectSourceAlerts, runSources, validateJob, type SourceDef } from '../pipeline.js';
import { scrapeAtsApisDetailed } from '../ats-api-scraper.js';
import { computeJobHash } from '../hasher.js';
import type { RawJob } from '../ats-api-scraper.js';

const job = (over: Partial<RawJob> = {}): RawJob => ({
  company: 'Acme', title: 'Frontend Engineer', location: 'Bengaluru', description: '', source: 'test',
  applyUrl: 'https://jobs.lever.co/acme/123', jobHash: computeJobHash('Acme', 'Frontend Engineer', 'https://jobs.lever.co/acme/123'), ...over,
});

describe('validateJob', () => {
  it('accepts a good job and cleans HTML/whitespace', () => {
    const r = validateJob(job({ title: '  <b>Frontend</b>   Engineer ' }));
    expect(r.ok && r.job.title).toBe('Frontend Engineer');
  });
  it.each([
    [{ title: '' }, 'missing title'],
    [{ company: '' }, 'missing company'],
    [{ applyUrl: 'not a url' }, 'invalid apply URL'],
    [{ applyUrl: 'javascript:alert(1)' }, 'non-http apply URL'],
    [{ applyUrl: 'https://www.linkedin.com/jobs/view/1' }, 'LinkedIn excluded by policy'],
    [{ title: 'x'.repeat(200) }, 'title too long (likely scraped garbage)'],
  ])('rejects %j', (over, reason) => {
    const r = validateJob(job(over as any));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
  it('drops an unparseable postedAt instead of keeping garbage', () => {
    const r = validateJob(job({ postedAt: 'yesterday-ish' }));
    expect(r.ok && r.job.postedAt).toBeUndefined();
  });
});

describe('dedupeJobs', () => {
  it('removes same job seen via different URLs, tracking params, and sources', () => {
    const a = job();
    const b = job({ applyUrl: 'https://jobs.lever.co/acme/123?utm_source=x', jobHash: 'other' });
    const c = job({ applyUrl: 'https://boards.greenhouse.io/acme/jobs/9', jobHash: 'h3', source: 'rss' }); // same company+title+location
    const d = job({ title: 'Backend Engineer', applyUrl: 'https://jobs.lever.co/acme/456', jobHash: 'h4' });
    const r = dedupeJobs([a, b, c, d]);
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs.map((j) => j.title)).toEqual(['Frontend Engineer', 'Backend Engineer']);
  });
  it('keeps the job id query param when it identifies the posting', () => {
    expect(canonicalUrl('https://x.com/careers?gh_jid=55&utm=1#top')).toBe('https://x.com/careers?gh_jid=55');
  });
});

describe('runSources', () => {
  const src = (name: string, tier: 1 | 2 | 3, run: SourceDef['run']): SourceDef => ({ name, tier, timeoutMs: 200, run });

  it('isolates failures, reports health, and skips tier 3 by default', async () => {
    const res = await runSources([
      src('good', 1, async () => [job()]),
      src('bad', 1, async () => { throw new Error('boom'); }),
      src('slow', 2, () => new Promise(() => {})),
      src('fragile', 3, async () => [job({ title: 'Other', jobHash: 'z', applyUrl: 'https://x.com/z' })]),
    ], { includeTier3: false });
    const by = Object.fromEntries(res.results.map((r) => [r.name, r]));
    expect(by.good.status).toBe('ok');
    expect(by.bad.status).toBe('error');
    expect(by.slow.status).toBe('timeout');
    expect(by.fragile.status).toBe('skipped');
    expect(res.jobs).toHaveLength(1);
  });

  it('includes tier 3 only when opted in, and prefers the trusted tier on duplicates', async () => {
    const res = await runSources([
      src('fragile', 3, async () => [job({ source: 'scraped' })]),
      src('official', 1, async () => [job({ source: 'official' })]),
    ], { includeTier3: true });
    expect(res.jobs).toHaveLength(1);
    expect(res.jobs[0].source).toBe('official');
  });

  it('counts invalid records per reason instead of silently dropping them', async () => {
    const res = await runSources([src('s', 1, async () => [job(), job({ title: '' }), job({ applyUrl: 'nope', title: 'Backend Dev' })])]);
    expect(res.results[0].dropped).toBe(2);
    expect(res.invalidReasons['missing title']).toBe(1);
  });
});

describe('detectSourceAlerts', () => {
  const r = (name: string, valid: number, status: any = 'ok') => ({ name, tier: 1 as const, status, fetched: valid, valid, dropped: 0, ms: 1 });
  it('alerts on zero, errors and >50% drops, not on healthy sources', () => {
    const alerts = detectSourceAlerts(
      [r('zero', 0, 'empty'), r('err', 0, 'error'), r('drop', 10), r('fine', 95)],
      [{ name: 'drop', valid: 40 }, { name: 'fine', valid: 100 }],
    );
    expect(alerts.map((a) => `${a.source}:${a.kind}`).sort()).toEqual(['drop:drop', 'err:error', 'zero:zero']);
  });
});

describe('scrapeAtsApisDetailed', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs boards in parallel, keeps board order, and reports dead boards', async () => {
    const f = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('greenhouse')) return { ok: true, status: 200, json: async () => ({ jobs: [{ title: 'SWE', absolute_url: 'https://boards.greenhouse.io/a/jobs/1', location: { name: 'Remote' }, first_published: '2026-09-01T00:00:00Z' }] }) };
      if (u.includes('lever')) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ jobs: [{ title: 'ML Intern', jobUrl: 'https://jobs.ashbyhq.com/c/2', location: 'Bengaluru', publishedAt: '2026-09-02T00:00:00Z' }, { title: 'Hidden', jobUrl: 'https://jobs.ashbyhq.com/c/3', isListed: false }] }) };
    });
    vi.stubGlobal('fetch', f);
    const r = await scrapeAtsApisDetailed([
      { name: 'A', type: 'greenhouse', boardId: 'a' },
      { name: 'B', type: 'lever', boardId: 'b' },
      { name: 'C', type: 'ashby', boardId: 'c' },
    ], { retryDelayMs: 0 });
    expect(r.jobs.map((j) => j.company)).toEqual(['A', 'C']);
    expect(r.jobs[0].postedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(r.jobs[1].employmentType).toBe('internship');
    expect(r.boards.map((b) => [b.board, b.ok])).toEqual([['A', true], ['B', false], ['C', true]]);
    expect(r.boards[1].error).toMatch(/404/);
    // 404 must not be retried
    expect(f.mock.calls.filter(([u]) => String(u).includes('lever'))).toHaveLength(1);
  });

  it('retries transient 5xx once then succeeds', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => [] })));
    const r = await scrapeAtsApisDetailed([{ name: 'L', type: 'lever', boardId: 'l' }], { retryDelayMs: 0 });
    expect(n).toBe(2);
    expect(r.boards[0].ok).toBe(true);
  });
});
