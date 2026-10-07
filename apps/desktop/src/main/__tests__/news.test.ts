import { describe, expect, it } from 'vitest';
import { hackathonItems, hiringFromJobs, hiringFromSnapshots, sourceState, type HackathonRow, type NewsJobRow, type SnapshotRow } from '../services/news';

const NOW = new Date('2026-10-07T06:00:00Z');
const snap = (o: Partial<SnapshotRow>): SnapshotRow => ({
  company_slug: 'nvidia', taken_on: '2026-10-07', open_total: 20, internships: 3, entry_level: 5, new_openings: 4, baseline: false, sample_titles: ['ASIC Intern', 'SDE I'], ...o,
});
const companies = [
  { slug: 'nvidia', name: 'NVIDIA', careers_url: 'https://nvidia.test/careers' },
  { slug: 'oracle', name: 'Oracle', careers_url: 'https://oracle.test/careers' },
];

describe('hiring news from company snapshots', () => {
  it('says how many new roles, with the facts the snapshot has, linked to the careers page', () => {
    const [item] = hiringFromSnapshots([snap({})], companies, NOW);
    expect(item).toMatchObject({
      kind: 'hiring',
      title: 'NVIDIA posted 4 new roles in India',
      detail: '20 open roles in India · 3 internships · 5 entry level — e.g. ASIC Intern, SDE I',
      company: 'NVIDIA',
      url: 'https://nvidia.test/careers',
      newRoles: 4,
    });
  });

  it('never calls a first (baseline) run "new" and leaves unknown counts out', () => {
    const [item] = hiringFromSnapshots([snap({ baseline: true, new_openings: 20, internships: 0, entry_level: 0, sample_titles: [] })], companies, NOW);
    expect(item.title).toBe('NVIDIA is hiring in India');
    expect(item.detail).toBe('20 open roles in India');
    expect(item.newRoles).toBeNull();
  });

  it('uses the latest snapshot per company, drops stale and empty ones, and puts new roles first', () => {
    const items = hiringFromSnapshots(
      [
        snap({ taken_on: '2026-10-06', new_openings: 9 }),
        snap({ taken_on: '2026-10-07', new_openings: 2 }),
        snap({ company_slug: 'oracle', new_openings: 7 }),
        snap({ company_slug: 'oracle', taken_on: '2026-09-20' }),
        snap({ company_slug: 'unknown-co' }),
      ],
      companies,
      NOW,
    );
    expect(items.map((i) => i.title)).toEqual(['Oracle posted 7 new roles in India', 'NVIDIA posted 2 new roles in India']);
    expect(hiringFromSnapshots([snap({ taken_on: '2026-09-01' })], companies, NOW)).toEqual([]);
    expect(hiringFromSnapshots([snap({ open_total: 0 })], companies, NOW)).toEqual([]);
  });
});

describe('hiring news from the job board', () => {
  const job = (o: Partial<NewsJobRow>): NewsJobRow => ({ company: 'Razorpay', title: 'Backend Engineer', apply_url: 'https://jobs.test/1', employment_type: 'full_time', posted_at: '2026-10-05T00:00:00Z', created_at: null, ...o });

  it('groups a week of postings by company and needs at least two', () => {
    const items = hiringFromJobs(
      [
        job({}),
        job({ title: 'Frontend Intern', employment_type: 'internship', apply_url: 'https://jobs.test/2', posted_at: '2026-10-06T00:00:00Z' }),
        job({ company: 'razorpay ', title: 'Data Analyst', apply_url: 'https://jobs.test/3' }),
        job({ company: 'Zoho', apply_url: 'https://jobs.test/4' }),
        job({ company: 'Old Co', apply_url: 'https://jobs.test/5', posted_at: '2026-09-01T00:00:00Z' }),
        job({ company: 'Old Co', apply_url: 'https://jobs.test/6', posted_at: '2026-09-02T00:00:00Z' }),
      ],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Razorpay posted 3 roles this week', sourceLabel: 'Nomadic job board', url: 'https://jobs.test/2', company: 'Razorpay' });
    expect(items[0].detail).toMatch(/^1 internship — e\.g\. /);
  });

  it('skips companies already covered by a careers snapshot', () => {
    const rows = [job({ company: 'NVIDIA' }), job({ company: 'NVIDIA', apply_url: 'https://jobs.test/9' })];
    expect(hiringFromJobs(rows, NOW, new Set(['nvidia']))).toEqual([]);
  });
});

describe('hackathon news', () => {
  const h = (o: Partial<HackathonRow>): HackathonRow => ({
    source: 'devfolio', source_id: 'x', title: 'HackBLR', organiser: 'BLR Devs', url: 'https://hackblr.devfolio.co/', mode: 'in_person', city: 'Bengaluru', in_india: true,
    starts_at: '2026-11-14T03:30:00Z', ends_at: '2026-11-15T12:00:00Z', registration_ends_at: '2026-11-05T18:29:00Z', themes: ['AI', 'Web3', 'Fintech'], prize_text: null, ...o,
  });

  it('lists upcoming events by deadline with where, who and themes, and drops ended ones', () => {
    const items = hackathonItems(
      [
        h({}),
        h({ source: 'devpost', source_id: 'y', title: 'Global AI Jam', mode: 'online', city: null, organiser: null, registration_ends_at: null, starts_at: '2026-10-20T00:00:00Z', prize_text: '$10,000 in prizes', themes: [] }),
        h({ source_id: 'old', title: 'Old Hack', ends_at: '2026-10-01T00:00:00Z' }),
      ],
      NOW,
    );
    expect(items.map((i) => i.title)).toEqual(['Global AI Jam', 'HackBLR']);
    expect(items[0]).toMatchObject({ detail: 'Online · $10,000 in prizes', sourceLabel: 'Devpost', mode: 'online' });
    expect(items[1]).toMatchObject({ detail: 'BLR Devs · Bengaluru · AI, Web3', registrationEndsAt: '2026-11-05T18:29:00Z' });
  });

  it('hides a registration deadline that has passed', () => {
    expect(hackathonItems([h({ registration_ends_at: '2026-10-01T00:00:00Z' })], NOW)[0].registrationEndsAt).toBeNull();
  });
});

describe('source state', () => {
  it('treats a missing table as not ready, other errors as errors', () => {
    expect(sourceState(null)).toBe('ok');
    expect(sourceState({ code: 'PGRST205', message: "Could not find the table 'public.hackathons'" })).toBe('not_ready');
    expect(sourceState({ code: '42P01', message: 'relation does not exist' })).toBe('not_ready');
    expect(sourceState({ code: '500', message: 'timeout' })).toBe('error');
  });
});
