import { describe, expect, it, vi } from 'vitest';
import type { JobCandidate, SourceId } from '../job-schema.js';
import { isIndiaEligible, parseRegion } from '../pipeline/region.js';
import { runPipeline } from '../pipeline/run.js';
import { MemoryJobStore } from '../pipeline/store.js';
import type { SourceDefinition } from '../sources/registry.js';

describe('isIndiaEligible', () => {
  it.each([
    ['Bengaluru, Karnataka', false, true],
    ['Gurugram', false, true],
    ['Hybrid - Pune, India', false, true],
    ['San Francisco, CA', false, false],
    ['London, UK', false, false],
    ['', true, true],
    ['Remote', true, true],
    ['Remote - Worldwide', true, true],
    ['Remote (APAC)', true, true],
    ['Remote, India', true, true],
    ['Remote (US only)', true, false],
    ['Remote - Europe', true, false],
    ['USA', true, false],
    ['', false, false],
  ])('%s (remote=%s) -> %s', (location, remote, expected) => {
    expect(isIndiaEligible({ location, remote })).toBe(expected);
  });

  it('defaults to india unless "all" is asked for', () => {
    expect(parseRegion(undefined)).toBe('india');
    expect(parseRegion(' ALL ')).toBe('all');
    expect(parseRegion('us')).toBe('india');
  });
});

function candidate(source: SourceId, id: string, location: string, remote = false): JobCandidate {
  return {
    source,
    sourceJobId: id,
    title: `Backend Engineer ${id}`,
    company: 'Acme',
    location,
    remote,
    applyUrl: `https://jobs.lever.co/acme/${id}`,
    description: 'Go and Postgres.',
  };
}

const source = (id: SourceId, items: JobCandidate[], indiaOnly = false): SourceDefinition => ({
  id,
  label: id,
  tier: 1,
  officialApi: true,
  indiaOnly,
  fetchCandidates: async () => items,
});

describe('runPipeline region filter', () => {
  const noNetwork = vi.fn(async () => {
    throw new Error('network disabled in tests');
  });

  it('keeps India and open-remote jobs, counts the rest, and expires them on publish', async () => {
    const store = new MemoryJobStore();
    const items = [
      candidate('lever', 'blr', 'Bangalore'),
      candidate('lever', 'sf', 'San Francisco, CA'),
      candidate('lever', 'any', 'Remote', true),
      candidate('lever', 'us', 'Remote (US only)', true),
    ];
    // First run without the filter publishes all four; the india run must expire the two US jobs.
    await runPipeline({ sources: [source('lever', items)], store, publish: true, fetch: noNetwork });
    const report = await runPipeline({ sources: [source('lever', items)], store, publish: true, fetch: noNetwork, region: 'india' });

    expect(report.jobs.map((j) => j.sourceJobId).sort()).toEqual(['any', 'blr']);
    expect(report.sources[0].outOfRegion).toBe(2);
    const active = [...store.jobs.values()].filter((j) => j.is_active).map((j) => j.source_id).sort();
    expect(active).toEqual(['any', 'blr']);
  });

  it('does not filter sources that only list Indian jobs, or when region is all', async () => {
    const items = [candidate('internshala', 'x', 'Work from home')];
    const india = await runPipeline({ sources: [source('internshala', items, true)], fetch: noNetwork, region: 'india', linkCheck: false });
    expect(india.jobs).toHaveLength(1);
    const all = await runPipeline({ sources: [source('lever', [candidate('lever', 'sf', 'Austin, TX')])], fetch: noNetwork, region: 'all' });
    expect(all.jobs).toHaveLength(1);
  });
});
