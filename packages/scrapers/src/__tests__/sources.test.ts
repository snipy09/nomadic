import { describe, expect, it, vi } from 'vitest';
import { parseJob } from '../job-schema.js';
import {
  fetchAshbyBoard,
  fetchBoards,
  fetchGreenhouseBoard,
  fetchLeverBoard,
  fetchRemotive,
  normalizeAshbyJob,
  normalizeLeverJob,
} from '../sources/ats.js';
import { internshalaSourceId, internshalaToCandidate, rawJobToCandidate } from '../sources/legacy.js';
import { SOURCES, selectSources } from '../sources/registry.js';

const board = { name: 'Acme', boardId: 'acme' };
const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('official API adapters', () => {
  it('Greenhouse: keeps native id, decodes content, detects remote', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        jobs: [
          {
            id: 11,
            title: 'Frontend Engineer',
            location: { name: 'Remote - India' },
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/11',
            content: '&lt;p&gt;Build UI&lt;/p&gt;',
            updated_at: '2026-09-20T10:00:00-04:00',
          },
          { id: 12, title: 'No URL' },
        ],
      })
    );
    const [job, ...rest] = await fetchGreenhouseBoard(fetch, board);
    expect(rest).toHaveLength(0);
    expect(fetch.mock.calls[0][0]).toBe('https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true');
    expect(job).toMatchObject({
      source: 'greenhouse',
      sourceJobId: 'acme:11',
      remote: true,
      description: 'Build UI',
      postedAt: '2026-09-20T14:00:00.000Z',
    });
    expect(parseJob(job).ok).toBe(true);
  });

  it('Lever: maps salaryRange, commitment, workplaceType and createdAt', () => {
    const job = normalizeLeverJob(
      {
        id: 'abc',
        text: 'Backend Intern',
        categories: { location: 'Bengaluru', commitment: 'Intern' },
        workplaceType: 'onsite',
        createdAt: Date.UTC(2026, 8, 1),
        hostedUrl: 'https://jobs.lever.co/acme/abc',
        descriptionPlain: 'Go and Postgres',
        salaryRange: { min: 30000, max: 40000, currency: 'inr', interval: 'per-month-salary' },
      },
      board
    );
    expect(job).toMatchObject({
      sourceJobId: 'acme:abc',
      employmentType: 'internship',
      workplaceType: 'onsite',
      remote: false,
      salaryMin: 30000,
      salaryMax: 40000,
      salaryCurrency: 'INR',
      salaryPeriod: 'month',
      postedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(parseJob(job).ok).toBe(true);
  });

  it('Ashby: maps compensation and employment type, skips unlisted', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        jobs: [
          {
            id: 'u1',
            title: 'ML Engineer',
            location: 'San Francisco',
            isRemote: true,
            employmentType: 'FullTime',
            publishedAt: '2026-09-10T00:00:00.000+00:00',
            jobUrl: 'https://jobs.ashbyhq.com/acme/u1',
            descriptionPlain: 'PyTorch',
            compensation: {
              summaryComponents: [
                {
                  compensationType: 'Salary',
                  interval: '1 YEAR',
                  currencyCode: 'USD',
                  minValue: 150000,
                  maxValue: 200000,
                },
              ],
            },
          },
          { id: 'u2', title: 'Hidden', isListed: false },
        ],
      })
    );
    const jobs = await fetchAshbyBoard(fetch, board);
    expect(fetch.mock.calls[0][0]).toContain('includeCompensation=true');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      remote: true,
      employmentType: 'full_time',
      salaryMin: 150000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    });
    expect(normalizeAshbyJob({ id: 'x', title: 'Designer', employmentType: 'Contract' }, board).salaryMin).toBeNull();
  });

  it('Ashby: skips a board whose hosted job pages are off', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('non-user-graphql')
        ? json({ data: { organization: null } })
        : json({ jobs: [{ id: 'u1', title: 'Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/u1' }] })
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchAshbyBoard(fetch, board)).toEqual([]);
    warn.mockRestore();
    fetch.mockImplementation(async (url: string) =>
      url.includes('non-user-graphql')
        ? json({ data: { organization: { name: 'Acme' } } })
        : json({ jobs: [{ id: 'u1', title: 'Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/u1' }] })
    );
    expect(await fetchAshbyBoard(fetch, board)).toHaveLength(1);
  });

  it('Remotive: parses salary text and job_type', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({
          jobs: [
            {
              id: 7,
              url: 'https://remotive.com/remote-jobs/software-dev/x-7',
              title: 'DevOps Engineer',
              company_name: 'Ops Co',
              job_type: 'contract',
              publication_date: '2026-09-29T08:00:00',
              candidate_required_location: 'Worldwide',
              salary: '$80k - $100k',
              description: '<b>K8s</b>',
            },
          ],
        })
      );
    const [job] = await fetchRemotive(fetch);
    expect(job).toMatchObject({
      source: 'remotive',
      sourceJobId: '7',
      remote: true,
      employmentType: 'contract',
      salaryMin: 80000,
      salaryMax: 100000,
      salaryCurrency: 'USD',
      description: 'K8s',
    });
    expect(parseJob(job).ok).toBe(true);
  });

  it('Lever: throws on HTTP errors so fetchBoards can report the board', async () => {
    const fetch = vi.fn().mockResolvedValue(json({}, 404));
    await expect(fetchLeverBoard(fetch, board)).rejects.toThrow('HTTP 404');
  });
});

describe('fetchBoards', () => {
  it('reports failing boards but keeps the rest', async () => {
    const onError = vi.fn();
    const out = await fetchBoards(
      [board, { name: 'Down', boardId: 'down' }],
      async (b) => {
        if (b.boardId === 'down') throw new Error('HTTP 404');
        return [{ source: 'lever', sourceJobId: 'acme:1' } as any];
      },
      onError
    );
    expect(out).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'down' }), expect.any(Error));
  });

  it('throws when every board fails', async () => {
    await expect(
      fetchBoards(
        [board],
        async () => {
          throw new Error('HTTP 403');
        },
        () => {}
      )
    ).rejects.toThrow('all 1 boards failed');
  });
});

describe('legacy adapters', () => {
  it('rawJobToCandidate derives a stable id and drops placeholder locations', () => {
    const raw = {
      company: 'Feed Co',
      title: 'Writer',
      location: 'Remote / Unspecified',
      description: '<p>Words</p>',
      applyUrl: 'https://example.com/job/1?utm_source=x',
      source: 'RSS: Feed',
      jobHash: 'h',
      salary: 'Competitive',
    };
    const a = rawJobToCandidate(raw, 'rss');
    const b = rawJobToCandidate({ ...raw, applyUrl: 'https://example.com/job/1' }, 'rss');
    expect(a.sourceJobId).toBe(b.sourceJobId);
    expect(a).toMatchObject({ location: '', remote: true, salaryMin: null, description: 'Words', postedAt: null });
    expect(parseJob(a).ok).toBe(true);
  });

  it('internshalaToCandidate uses the numeric slug id and never claims remote from the placeholder', () => {
    const base = {
      company: 'Acme',
      title: 'Frontend developer internship',
      location: 'India / Remote',
      description: 'x',
      source: 'Internshala',
      jobHash: 'h',
      employmentType: 'internship' as const,
      workplaceType: 'hybrid' as const,
      experienceLevel: 'entry' as const,
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const onsite = internshalaToCandidate({
      ...base,
      applyUrl: 'https://internshala.com/internship/detail/frontend-developer-internship-in-pune-at-acme1234567',
    });
    expect(onsite).toMatchObject({
      sourceJobId: '1234567',
      location: 'India',
      remote: false,
      employmentType: 'internship',
      postedAt: null,
    });
    const wfh = internshalaToCandidate({
      ...base,
      applyUrl: 'https://internshala.com/internship/detail/work-from-home-react-internship-at-acme7654321',
    });
    expect(wfh.remote).toBe(true);
    expect(internshalaSourceId('https://internshala.com/job/detail/no-digits')).toBe('no-digits');
  });
});

describe('selectSources (tiers)', () => {
  it('defaults to tier 1 + 2; tier 3 is opt-in', () => {
    const ids = selectSources({ env: {} }).map((s) => s.id);
    expect(ids).toEqual(['greenhouse', 'lever', 'ashby', 'remotive', 'internshala', 'careers', 'unstop', 'rss', 'arbeitnow', 'jobicy']);
    // Adzuna needs its app id and key; with them it joins the default set.
    expect(selectSources({ env: { ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' } }).some((s) => s.id === 'adzuna')).toBe(true);
    expect(selectSources({ sources: ['adzuna'], env: {} }).map((s) => s.id)).toEqual(['adzuna']);
    expect(selectSources({ includeTier3: true, env: {} }).some((s) => s.tier === 3)).toBe(true);
    expect(selectSources({ env: { SCRAPER_ENABLE_TIER3: '1' } }).some((s) => s.id === 'naukri')).toBe(true);
  });

  it('filters by tier and by explicit ids (naming a tier 3 source opts in)', () => {
    expect(selectSources({ tiers: [2], env: {} }).map((s) => s.id)).toEqual(['rss', 'arbeitnow', 'jobicy']);
    expect(selectSources({ sources: ['dom', 'lever'], env: {} }).map((s) => s.id)).toEqual(['lever', 'dom']);
    expect(() => selectSources({ sources: ['linkedin'], env: {} })).toThrow(/Unknown source/);
  });

  it('every source has the tier the product decision assigns', () => {
    const tiers = Object.fromEntries(SOURCES.map((s) => [s.id, s.tier]));
    expect(tiers).toEqual({
      greenhouse: 1,
      lever: 1,
      ashby: 1,
      remotive: 1,
      internshala: 1,
      careers: 1,
      unstop: 1,
      adzuna: 1,
      rss: 2,
      arbeitnow: 2,
      jobicy: 2,
      naukri: 3,
      indeed: 3,
      'web-search': 3,
      dom: 3,
    });
  });
});
