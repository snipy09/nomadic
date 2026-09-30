import { describe, expect, it } from 'vitest';
import { publishJobs } from '../publisher.js';
import type { ScoredJob } from '../index.js';

const job = (i: number, source = 'Greenhouse API'): ScoredJob => ({
  company: 'Acme', title: `Engineer ${i}`, location: 'Remote', description: '', applyUrl: `https://x.com/${i}`,
  source, jobHash: `h${source}${i}`, score: 50, employmentType: 'job', postedAt: '2026-09-01T00:00:00.000Z',
});

/** Minimal chainable Supabase double recording upserts and stale-expiry updates. */
function fakeSupabase(opts: { rejectNewColumns?: boolean; upsertError?: string } = {}) {
  const calls = { upserts: [] as any[][], updates: [] as any[] };
  const client: any = {
    from: () => ({
      upsert: async (rows: any[]) => {
        calls.upserts.push(rows);
        if (opts.upsertError) return { error: { message: opts.upsertError } };
        if (opts.rejectNewColumns && 'last_seen_at' in rows[0]) return { error: { message: "Could not find the 'last_seen_at' column of 'jobs' in the schema cache" } };
        return { error: null };
      },
      update: (patch: any) => {
        const rec: any = { patch, filters: [] };
        calls.updates.push(rec);
        const chain: any = {
          eq: (k: string, v: any) => (rec.filters.push([k, v]), chain),
          or: (expr: string) => (rec.or = expr, chain),
          select: async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }),
        };
        return chain;
      },
    }),
  };
  return { client, calls };
}

describe('publishJobs', () => {
  it('upserts with freshness fields and expires jobs a healthy source no longer lists', async () => {
    const { client, calls } = fakeSupabase();
    const jobs = Array.from({ length: 12 }, (_, i) => job(i));
    const start = new Date('2026-09-30T10:00:00Z');
    const r = await publishJobs(client, jobs, start);
    expect(r).toMatchObject({ upserted: 12, failedBatches: 0, expired: 2, legacySchema: false });
    expect(calls.upserts[0][0]).toMatchObject({ posted_at: '2026-09-01T00:00:00.000Z', last_seen_at: start.toISOString(), is_active: true, employment_type: 'job' });
    expect(calls.updates[0].patch).toEqual({ is_active: false });
    expect(calls.updates[0].filters).toContainEqual(['source', 'Greenhouse API']);
    expect(calls.updates[0].or).toContain(start.toISOString());
  });

  it('never expires from a source that returned too few jobs (probably a partial failure)', async () => {
    const { client, calls } = fakeSupabase();
    const r = await publishJobs(client, [job(1), job(2), job(3)], new Date());
    expect(r.expired).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });

  it('falls back to the legacy columns when migration 006 has not been applied, and does not expire', async () => {
    const { client, calls } = fakeSupabase({ rejectNewColumns: true });
    const r = await publishJobs(client, Array.from({ length: 12 }, (_, i) => job(i)), new Date());
    expect(r.legacySchema).toBe(true);
    expect(r.upserted).toBe(12);
    expect('last_seen_at' in calls.upserts[calls.upserts.length - 1][0]).toBe(false);
    expect(calls.updates).toHaveLength(0);
  });

  it('does not expire anything when a batch failed', async () => {
    const { client, calls } = fakeSupabase({ upsertError: 'permission denied' });
    const r = await publishJobs(client, Array.from({ length: 12 }, (_, i) => job(i)), new Date());
    expect(r.failedBatches).toBe(1);
    expect(r.expired).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });
});
