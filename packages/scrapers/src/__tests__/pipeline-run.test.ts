import { describe, expect, it, vi } from 'vitest';
import type { JobCandidate, SourceId } from '../job-schema.js';
import { SUMMARY_CSV_HEADER, formatBenchMarkdown, formatRunSummary, formatRunTable, formatSummaryCsvRow } from '../pipeline/report.js';
import { computeAlert, expirySkipReason, runPipeline } from '../pipeline/run.js';
import { MemoryJobStore } from '../pipeline/store.js';
import type { SourceDefinition } from '../sources/registry.js';

function candidate(source: SourceId, id: string, patch: Partial<JobCandidate> = {}): JobCandidate {
  return {
    source,
    sourceJobId: id,
    title: `Backend Engineer ${id}`,
    company: 'Acme',
    location: 'Bangalore',
    remote: false,
    applyUrl: `https://jobs.lever.co/acme/${id}`,
    description: 'Go, Postgres and distributed systems.',
    ...patch,
  };
}

function fakeSource(
  id: SourceId,
  tier: 1 | 2 | 3,
  items: () => JobCandidate[] | Promise<JobCandidate[]>,
  officialApi = true
): SourceDefinition {
  return { id, label: `${id} label`, tier, officialApi, fetchCandidates: async () => items() };
}

/** A clock that advances one minute per call so each run has a distinct timestamp. */
function clock(start = Date.UTC(2026, 9, 1)) {
  let t = start;
  return () => new Date((t += 60_000));
}

const noNetwork = vi.fn(async () => {
  throw new Error('network disabled in tests');
});

describe('runPipeline', () => {
  it('normalizes, classifies, scores and returns live jobs (dry run writes nothing)', async () => {
    const store = new MemoryJobStore();
    const report = await runPipeline({
      sources: [
        fakeSource('lever', 1, () => [
          candidate('lever', 'a1', {
            title: 'Senior Frontend Engineer',
            salaryMin: 10,
            salaryMax: 20,
            salaryCurrency: 'USD',
            salaryPeriod: 'year',
          }),
        ]),
      ],
      store,
      fetch: noNetwork,
      now: clock(),
    });
    expect(report.published).toBe(false);
    expect(report.jobs).toHaveLength(1);
    expect(report.jobs[0]).toMatchObject({ roleFamily: 'frontend', seniority: 'senior', linkStatus: 'ok', tier: 1 });
    expect(report.jobs[0].score).toBeGreaterThan(50);
    expect(store.jobs.size).toBe(0);
    expect(store.runs).toHaveLength(0);
  });

  it('drops and reports invalid records', async () => {
    const log = vi.fn();
    const report = await runPipeline({
      sources: [
        fakeSource('lever', 1, () => [
          candidate('lever', 'ok'),
          candidate('lever', 'bad', { applyUrl: 'not a url' }),
          { foo: 'bar' } as any,
        ]),
      ],
      fetch: noNetwork,
      log,
    });
    expect(report.sources[0]).toMatchObject({ fetched: 3, valid: 1, invalid: 2 });
    expect(report.sources[0].invalidSamples[0]).toContain('applyUrl');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('dropped 2 invalid record(s)'));
  });

  it('re-running twice creates no duplicates and keeps first_seen', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    const sources = [
      fakeSource('lever', 1, () => [candidate('lever', '1'), candidate('lever', '2')]),
      // Same job as lever/1 via an aggregator: must collapse into one row.
      fakeSource(
        'rss',
        2,
        () => [candidate('rss', 'x', { applyUrl: 'https://jobs.lever.co/acme/1?utm_source=feed' })],
        false
      ),
    ];

    const first = await runPipeline({ sources, publish: true, store, fetch: noNetwork, linkCheck: false, now });
    const firstSeen = store
      .activeJobs()
      .map((j) => j.first_seen)
      .sort();
    const second = await runPipeline({ sources, publish: true, store, fetch: noNetwork, linkCheck: false, now });

    expect(first.totals.duplicates).toBe(1);
    expect(store.jobs.size).toBe(2);
    expect(store.activeJobs()).toHaveLength(2);
    expect(
      store
        .activeJobs()
        .map((j) => j.first_seen)
        .sort()
    ).toEqual(firstSeen);
    expect(store.activeJobs().every((j) => j.last_seen === second.startedAt)).toBe(true);
    expect(second.totals.expired).toBe(0);
    expect(store.runs).toHaveLength(4); // one row per source per run
  });

  it('expires jobs that disappear from their source, hiding them from the feed', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    let items = [candidate('lever', '1'), candidate('lever', '2'), candidate('lever', '3')];
    const sources = [fakeSource('lever', 1, () => items)];

    await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });
    items = [candidate('lever', '1'), candidate('lever', '2')];
    const report = await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });

    expect(report.sources[0].expired).toBe(1);
    expect(
      store
        .activeJobs()
        .map((j) => j.source_id)
        .sort()
    ).toEqual(['1', '2']);
    const gone = store.jobs.get('lever\u00003')!;
    expect(gone).toMatchObject({ status: 'expired', is_active: false, expire_reason: 'not_seen_in_source' });

    // It comes back if the source lists it again.
    items = [candidate('lever', '1'), candidate('lever', '2'), candidate('lever', '3')];
    await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });
    expect(store.activeJobs()).toHaveLength(3);
  });

  it('expires jobs whose link check fails and does not insert new dead ones', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const dead = url.endsWith('/2');
      return {
        status: dead ? 404 : 200,
        ok: !dead,
        headers: { get: () => 'text/html' },
        text: async () => (url.endsWith('/3') && init?.method === 'GET' ? 'This job has expired' : 'Apply'),
      } as unknown as Response;
    });
    const sources = [
      fakeSource('rss', 2, () => [candidate('rss', '1'), candidate('rss', '2'), candidate('rss', '3')], false),
    ];

    // Seed all three as active (no link check), then re-run with HTTP checks.
    await runPipeline({ sources, publish: true, store, fetch, linkCheck: false, now });
    const report = await runPipeline({ sources, publish: true, store, fetch, now });

    expect(report.sources[0]).toMatchObject({ linkFailed: 2, closed: 1, linkOk: 1 });
    expect(store.activeJobs().map((j) => j.source_id)).toEqual(['1']);
    expect(store.jobs.get('rss\u00002')!.expire_reason).toBe('link_check_failed');

    const fresh = new MemoryJobStore();
    await runPipeline({ sources, publish: true, store: fresh, fetch, now });
    expect([...fresh.jobs.keys()]).toEqual(['rss\u00001']);
  });

  it('alerts on zero results or a >50% drop and then skips expiry', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    let items = Array.from({ length: 10 }, (_, i) => candidate('lever', String(i)));
    const sources = [fakeSource('lever', 1, () => items)];

    await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });
    items = items.slice(0, 4);
    const dropped = await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });

    expect(dropped.alerts[0]).toMatch(/^lever: dropped_60pct \(was 10, now 4\)/);
    expect(dropped.sources[0].expired).toBe(0);
    expect(store.activeJobs()).toHaveLength(10);
    expect(store.runs.at(-1)).toMatchObject({
      source: 'lever',
      alert: expect.stringContaining('dropped_60pct'),
      fetched: 4,
    });

    items = [];
    const empty = await runPipeline({ sources, publish: true, store, fetch: noNetwork, now });
    expect(empty.alerts).toEqual(['lever: zero_results']);
    expect(store.activeJobs()).toHaveLength(10);
  });

  it('does not expire unseen jobs after a partial fetch or a truncated run', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    const all = Array.from({ length: 4 }, (_, i) => candidate('lever', String(i)));
    let items = all;
    let warn: string | null = null;
    const source: SourceDefinition = {
      id: 'lever',
      label: 'Lever API',
      tier: 1,
      officialApi: true,
      fetchCandidates: async (ctx) => {
        if (warn) ctx.warn(warn);
        return items;
      },
    };

    await runPipeline({ sources: [source], publish: true, store, fetch: noNetwork, now });

    // One board failed: the remaining 3 jobs are a <50% drop, but job 3 must survive.
    items = all.slice(0, 3);
    warn = 'lever/acme: HTTP 403';
    const partial = await runPipeline({ sources: [source], publish: true, store, fetch: noNetwork, now });
    expect(partial.sources[0].expired).toBe(0);
    expect(partial.sources[0].warnings).toContain('skipped expiry of unseen jobs: partial fetch (see warnings)');
    expect(store.activeJobs()).toHaveLength(4);

    // --limit-per-source keeps only 2 jobs: the other 2 are not "gone".
    items = all;
    warn = null;
    const limited = await runPipeline({
      sources: [source],
      publish: true,
      store,
      fetch: noNetwork,
      now,
      limitPerSource: 2,
    });
    expect(limited.sources[0].expired).toBe(0);
    expect(store.activeJobs()).toHaveLength(4);
  });

  it('records source errors without failing the run', async () => {
    const store = new MemoryJobStore();
    const report = await runPipeline({
      sources: [
        fakeSource('greenhouse', 1, () => {
          throw new Error('HTTP 500');
        }),
        fakeSource('lever', 1, () => [candidate('lever', '1')]),
      ],
      publish: true,
      store,
      fetch: noNetwork,
      now: clock(),
    });
    expect(report.sources[0]).toMatchObject({ status: 'error', error: 'HTTP 500', alert: 'source_error' });
    expect(report.sources[1]).toMatchObject({ status: 'ok', upserted: 1 });
    expect(store.runs.map((r) => r.status)).toEqual(['error', 'ok']);
  });

  it('times out a hanging source', async () => {
    const report = await runPipeline({
      sources: [fakeSource('remotive', 1, () => new Promise(() => {}))],
      fetch: noNetwork,
      sourceTimeoutMs: 20,
    });
    expect(report.sources[0].error).toMatch(/timed out/);
  });

  it('expires legacy publisher rows only after a healthy tier-1 run', async () => {
    const store = new MemoryJobStore();
    store.legacy.set('old-hash', { status: 'active', is_active: true });
    const now = clock();

    await runPipeline({
      sources: [fakeSource('lever', 1, () => [candidate('lever', '1')])],
      publish: true,
      store,
      fetch: noNetwork,
      now,
    });
    expect(store.legacy.get('old-hash')!.status).toBe('active');

    const report = await runPipeline({
      sources: [
        fakeSource('lever', 1, () => [candidate('lever', '1')]),
        fakeSource('ashby', 1, () => [
          candidate('ashby', 'z', { applyUrl: 'https://jobs.ashbyhq.com/acme/z', title: 'Designer' }),
        ]),
      ],
      publish: true,
      store,
      fetch: noNetwork,
      now,
    });
    expect(report.totals.legacyExpired).toBe(1);
    expect(store.legacy.get('old-hash')!.status).toBe('expired');
  });

  it('refuses to publish without a store', async () => {
    await expect(runPipeline({ sources: [], publish: true })).rejects.toThrow('publish requires a store');
  });

  it('formats a table and a markdown benchmark with one row per source', async () => {
    const report = await runPipeline({
      sources: [fakeSource('lever', 1, () => [candidate('lever', '1')]), fakeSource('jobicy', 2, () => [], false)],
      fetch: noNetwork,
    });
    expect(formatRunTable(report).split('\n')).toHaveLength(4);
    const md = formatBenchMarkdown(report);
    expect(md.split('\n').filter((l) => /^\| (lever|jobicy) \|/.test(l))).toHaveLength(2);
    expect(md).toContain('jobicy: zero_results');
  });
});

describe('expirySkipReason', () => {
  const ok = { status: 'ok', alert: null, warnings: [] } as any;
  it('only allows expiry after a complete, healthy fetch', () => {
    expect(expirySkipReason(ok, false)).toBeNull();
    expect(expirySkipReason({ ...ok, status: 'error' }, false)).toBe('source error');
    expect(expirySkipReason({ ...ok, alert: 'zero_results' }, false)).toBe('zero_results');
    expect(expirySkipReason({ ...ok, warnings: ['x'] }, false)).toMatch(/partial/);
    expect(expirySkipReason(ok, true)).toMatch(/limit-per-source/);
  });
});

describe('computeAlert', () => {
  it('flags errors, zero results and >50% drops only', () => {
    expect(computeAlert(5, 5, 'error')).toBe('source_error');
    expect(computeAlert(0, null, 'ok')).toBe('zero_results');
    expect(computeAlert(49, 100, 'ok')).toMatch(/^dropped_51pct/);
    expect(computeAlert(50, 100, 'ok')).toBeNull();
    expect(computeAlert(10, null, 'ok')).toBeNull();
    expect(computeAlert(10, 0, 'ok')).toBeNull();
  });
});

describe('runPipeline: new-job cap and duplicates against the store', () => {
  it('adds at most maxNew new jobs per run, keeps refreshing known ones, and adds the rest next run', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    const ids = Array.from({ length: 5 }, (_, i) => `n${i}`);
    const sources = [fakeSource('lever', 1, () => ids.map((id) => candidate('lever', id)))];
    const first = await runPipeline({ sources, store, publish: true, fetch: noNetwork, now, maxNew: 3 });
    expect(first.totals).toMatchObject({ newJobs: 3, deferred: 2, refreshed: 0, upserted: 3 });
    expect(store.activeJobs()).toHaveLength(3);
    const second = await runPipeline({ sources, store, publish: true, fetch: noNetwork, now, maxNew: 3 });
    expect(second.totals).toMatchObject({ newJobs: 2, deferred: 0, refreshed: 3, expired: 0 });
    expect(store.activeJobs()).toHaveLength(5);
    expect(second.newJobs.map((j) => j.sourceJobId).sort()).toEqual(
      ids.filter((id) => !first.newJobs.some((j) => j.sourceJobId === id)).sort()
    );
  });

  it('skips a job another source already published (same company, title and location)', async () => {
    const store = new MemoryJobStore();
    const now = clock();
    await runPipeline({ sources: [fakeSource('lever', 1, () => [candidate('lever', 'x', { title: 'Data Engineer' })])], store, publish: true, fetch: noNetwork, now });
    const report = await runPipeline({
      sources: [fakeSource('greenhouse', 1, () => [candidate('greenhouse', 'y', { title: 'Data Engineer', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' })])],
      store,
      publish: true,
      fetch: noNetwork,
      now,
    });
    expect(report.totals).toMatchObject({ newJobs: 0, duplicates: 1 });
    expect(store.activeJobs()).toHaveLength(1);
  });

  it('formats a summary with the new jobs listed', async () => {
    const store = new MemoryJobStore();
    const report = await runPipeline({ sources: [fakeSource('lever', 1, () => [candidate('lever', 's1')])], store, publish: true, fetch: noNetwork, now: clock(), maxNew: 100 });
    const text = formatRunSummary(report, { maxNew: 100, region: 'india' });
    expect(text).toContain('New jobs added:        1 (limit 100 per run)');
    expect(text).toContain('https://jobs.lever.co/acme/s1');
    expect(formatSummaryCsvRow(report).split(',')).toHaveLength(SUMMARY_CSV_HEADER.split(',').length);
  });
});
