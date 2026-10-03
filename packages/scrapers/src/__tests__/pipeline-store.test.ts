import { describe, expect, it, vi } from 'vitest';
import type { PipelineJob } from '../job-schema.js';
import { SupabaseJobStore, getRecentScrapeRuns, jobHashFor, toJobRow } from '../pipeline/store.js';

/** Minimal chainable stand-in for the supabase-js query builder that records calls. */
function fakeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: any = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: result.data ?? [], error: result.error ?? null });
        }
        return (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return builder;
        };
      },
    }
  );
  const client = { from: vi.fn((table: string) => (calls.push(['from', table]), builder)) };
  return { client: client as any, calls };
}

const job: PipelineJob = {
  source: 'lever',
  sourceJobId: 'acme:1',
  title: 'Backend Engineer',
  company: 'Acme',
  location: '',
  remote: true,
  workplaceType: 'remote',
  salaryMin: 100000,
  salaryMax: 150000,
  salaryCurrency: 'USD',
  salaryPeriod: 'year',
  employmentType: 'full_time',
  postedAt: '2026-09-01T00:00:00.000Z',
  applyUrl: 'https://jobs.lever.co/acme/1',
  description: 'x'.repeat(20000),
  tier: 1,
  canonicalUrl: 'https://jobs.lever.co/acme/1',
  dedupeKey: 'acme|backend engineer|remote',
  roleFamily: 'backend',
  seniority: 'unknown',
  linkStatus: 'ok',
  score: 80,
};

describe('toJobRow', () => {
  it('maps a pipeline job to a jobs row (no first_seen/created_at: DB defaults)', () => {
    const row = toJobRow(job, 'Lever API', '2026-10-01T00:00:00.000Z', null);
    expect(row).toMatchObject({
      job_hash: jobHashFor('lever', 'acme:1'),
      source_key: 'lever',
      source_id: 'acme:1',
      source: 'Lever API',
      location: 'Remote',
      status: 'active',
      is_active: true,
      salary_range: 'USD 100,000 - 150,000 /year',
      last_seen: '2026-10-01T00:00:00.000Z',
      employment_type: 'full_time',
      workplace_type: 'remote',
    });
    expect(row.description).toHaveLength(10000);
    expect(row).not.toHaveProperty('first_seen');
    expect(row).not.toHaveProperty('created_at');
    expect(jobHashFor('lever', 'acme:1')).toHaveLength(64);
    expect(jobHashFor('lever', 'acme:1')).not.toBe(jobHashFor('ashby', 'acme:1'));
  });
});

describe('SupabaseJobStore', () => {
  it('upserts in batches on (source_key, source_id)', async () => {
    const { client, calls } = fakeClient();
    const store = new SupabaseJobStore(client);
    const rows = Array.from({ length: 450 }, (_, i) =>
      toJobRow({ ...job, sourceJobId: String(i) }, 'Lever API', 'now', null)
    );
    expect(await store.upsertJobs(rows)).toBe(450);
    const upserts = calls.filter((c) => c[0] === 'upsert');
    expect(upserts).toHaveLength(3);
    expect(upserts[0][2]).toEqual({ onConflict: 'source_key,source_id' });
  });

  it('expireUnseen only touches active rows of that source last seen before the run', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 1 }, { id: 2 }] });
    const store = new SupabaseJobStore(client, () => new Date('2026-10-01T00:00:00Z'));
    expect(await store.expireUnseen('lever', '2026-09-30T00:00:00Z', 'not_seen_in_source')).toBe(2);
    expect(calls).toContainEqual([
      'update',
      {
        status: 'expired',
        is_active: false,
        expired_at: '2026-10-01T00:00:00.000Z',
        expire_reason: 'not_seen_in_source',
      },
    ]);
    expect(calls).toContainEqual(['eq', 'source_key', 'lever']);
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls).toContainEqual(['lt', 'last_seen', '2026-09-30T00:00:00Z']);
  });

  it('expireLegacy targets rows without source_id', async () => {
    const { client, calls } = fakeClient({ data: [] });
    await new SupabaseJobStore(client).expireLegacy('superseded_by_pipeline');
    expect(calls).toContainEqual(['is', 'source_id', null]);
  });

  it('surfaces database errors', async () => {
    const { client } = fakeClient({ error: { message: 'permission denied for table jobs' } });
    await expect(new SupabaseJobStore(client).upsertJobs([toJobRow(job, 'Lever API', 'now', null)])).rejects.toThrow(
      'permission denied'
    );
  });

  it('getPreviousFetchCounts keeps the newest successful run per source', async () => {
    const { client } = fakeClient({
      data: [
        { source: 'lever', fetched: 40, started_at: '2026-10-02' },
        { source: 'lever', fetched: 99, started_at: '2026-10-01' },
        { source: 'ashby', fetched: 7, started_at: '2026-10-01' },
      ],
    });
    expect(await new SupabaseJobStore(client).getPreviousFetchCounts(['lever', 'ashby'])).toEqual({
      lever: 40,
      ashby: 7,
    });
  });
});

describe('getRecentScrapeRuns', () => {
  it('orders newest first, clamps the limit and filters by source', async () => {
    const { client, calls } = fakeClient({ data: [{ source: 'lever' }] });
    const runs = await getRecentScrapeRuns(client, { limit: 10_000, source: 'lever' });
    expect(runs).toEqual([{ source: 'lever' }]);
    expect(calls).toContainEqual(['from', 'scrape_runs']);
    expect(calls).toContainEqual(['order', 'started_at', { ascending: false }]);
    expect(calls).toContainEqual(['limit', 500]);
    expect(calls).toContainEqual(['eq', 'source', 'lever']);
  });
});
