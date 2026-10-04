import { describe, expect, it } from 'vitest';
import { dedupeJobs, filterAndSort, pageRange, postedLabel, withoutHidden, type ScoredJob } from '../features/feed/feedLogic';
import { inferRole, jobSkills, matchJob, profileMastery } from '../features/feed/match';

const job = (o: Partial<ScoredJob>): ScoredJob => ({ title: 'Engineer', company: 'Acme', applyUrl: `https://x.co/${Math.random()}`, match: null, ...o });

describe('match (shared skill ids)', () => {
  it('returns no score without profile skills or without tagged job skills', () => {
    const j = job({ title: 'React Developer', description: 'React, TypeScript' });
    expect(matchJob(j, {})).toBeNull();
    expect(matchJob(job({ title: 'Office assistant', description: 'filing' }), profileMastery({ techStack: 'React' }))).toBeNull();
  });
  it('scores matched and missing skills from the same catalogue', () => {
    const j = job({ title: 'Frontend Developer', description: 'We use React and TypeScript with SQL' });
    const ids = jobSkills(j);
    expect(ids.length).toBeGreaterThan(1);
    const m = matchJob(j, profileMastery({ techStack: 'React' }), 'frontend')!;
    expect(m.score).toBeGreaterThan(0);
    expect(m.score).toBeLessThan(100);
    expect(m.matched.length).toBeGreaterThan(0);
    expect(m.missing.length).toBeGreaterThan(0);
    const full = matchJob(j, Object.fromEntries(ids.map((id) => [id, 1])))!;
    expect(full.score).toBe(100);
  });
  it('infers role families from titles', () => {
    expect(inferRole('Frontend Developer Intern')).toBe('frontend');
    expect(inferRole('')).toBeUndefined();
  });
});

describe('feed logic', () => {
  it('dedupes by hash, company+title+url and url', () => {
    const a = job({ applyUrl: 'https://a.co/j?ref=1' });
    expect(dedupeJobs([a, { ...a, applyUrl: 'https://a.co/j?ref=2', title: 'Other' }, job({})]).length).toBe(2);
  });
  it('filters high match, india and remote and sorts by best match', () => {
    const jobs = [
      job({ title: 'A', location: 'Bengaluru', match: { score: 90, matched: [], missing: [] } }),
      job({ title: 'B', location: 'Remote', match: { score: 40, matched: [], missing: [] } }),
      job({ title: 'C', location: 'Berlin' }),
    ];
    const run = (o: Partial<Parameters<typeof filterAndSort>[1]>) => filterAndSort(jobs, { search: '', tab: 'all', location: 'all', sort: 'latest', ...o }).map((j) => j.title);
    expect(run({ tab: 'high_match' })).toEqual(['A']);
    expect(run({ location: 'india' })).toEqual(['A']);
    expect(run({ location: 'remote' })).toEqual(['B']);
    expect(run({ sort: 'best_match' })).toEqual(['A', 'B', 'C']);
    expect(run({ search: 'berlin' })).toEqual(['C']);
  });
  it('builds page ranges and posted labels', () => {
    expect(pageRange(5, 20)).toEqual([1, '…', 4, 5, 6, '…', 20]);
    expect(pageRange(1, 3)).toEqual([1, 2, 3]);
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(postedLabel('2026-10-03T01:00:00Z', now)).toBe('Today');
    expect(postedLabel('2026-09-28T12:00:00Z', now)).toBe('5d ago');
    expect(postedLabel(undefined, now)).toBeNull();
  });
});

describe('withoutHidden', () => {
  it('drops hidden jobs by apply URL, ignoring query strings and case', () => {
    const list = [{ applyUrl: 'https://a.co/1?ref=x' }, { applyUrl: 'https://b.co/2' }];
    expect(withoutHidden(list, ['HTTPS://a.co/1'])).toEqual([{ applyUrl: 'https://b.co/2' }]);
    expect(withoutHidden(list, [])).toBe(list);
  });
});
