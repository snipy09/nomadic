import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../feed/companies.js';
import { PoliteFetcher } from '../feed/http.js';
import { parseJob } from '../job-schema.js';
import { runPipeline } from '../pipeline/run.js';
import { fetchAdzuna, normalizeAdzunaJob } from '../sources/adzuna.js';
import { discoverBoards, feedCompanies, formatDiscoverySummary, loadDiscoveredBoards, mergeBoards, probeBoard, type DiscoveredBoard } from '../sources/boards.js';
import { fetchCareersJobs, openingToCandidate } from '../sources/careers-jobs.js';
import { INDIA_COMPANIES, boardSlugsFor, slugify } from '../sources/india-companies.js';
import type { SourceDefinition } from '../sources/registry.js';
import { fetchUnstopJobs, normalizeUnstopJob } from '../sources/unstop-jobs.js';

const NOW = new Date('2026-10-07T06:00:00Z');
const noSleep = async () => undefined;

function jsonFetch(routes: Record<string, (url: string) => { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    if (new URL(url).pathname === '/robots.txt') return new Response('', { status: 404 });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    const r = routes[key](url);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

const board = (over: Partial<DiscoveredBoard>): DiscoveredBoard => ({
  slug: 'acme',
  name: 'Acme',
  category: 'indian_product',
  ats: 'lever',
  board: 'acme',
  indiaJobs: 3,
  totalJobs: 5,
  checkedAt: NOW.toISOString(),
  ...over,
});

describe('India company list', () => {
  it('has unique slugs that do not clash with the famous companies', () => {
    const slugs = INDIA_COMPANIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const famous = new Set(COMPANIES.map((c) => c.slug));
    for (const c of INDIA_COMPANIES) {
      expect(c.slug).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      expect(famous.has(c.slug)).toBe(false);
    }
    expect(INDIA_COMPANIES.length).toBeGreaterThan(250);
  });

  it('derives board slugs from the name, hints first', () => {
    expect(boardSlugsFor({ name: 'Urban Company' })).toEqual(['urbancompany', 'urban-company']);
    expect(boardSlugsFor({ name: 'Zensar Technologies', boardHints: ['zensar'] })).toEqual(['zensar']);
    expect(slugify("Lowe's")).toBe('lowes');
    expect(slugify('L&T Technology Services')).toBe('l-and-t-technology-services');
  });
});

describe('discovered boards', () => {
  it('merges built-in and discovered boards once per board id', () => {
    const merged = mergeBoards([{ name: 'Meesho', boardId: 'meesho' }], [board({ board: 'Meesho' }), board({ slug: 'cred', name: 'CRED', board: 'cred' }), board({ ats: 'ashby', board: 'zepto' })], 'lever');
    expect(merged).toEqual([
      { name: 'Meesho', boardId: 'meesho' },
      { name: 'CRED', boardId: 'cred' },
    ]);
  });

  it('fills famous companies without a listing and adds new companies with their best board', () => {
    const list = feedCompanies([
      board({ slug: 'razorpay', name: 'Razorpay', category: 'fintech', ats: 'lever', board: 'razorpay', indiaJobs: 2 }),
      board({ slug: 'razorpay', name: 'Razorpay', category: 'fintech', ats: 'greenhouse', board: 'razorpaysoftware', indiaJobs: 9 }),
      board({ slug: 'acme', ats: 'ashby', board: 'acme' }),
    ]);
    expect(list.find((c) => c.slug === 'razorpay')?.careers).toEqual({ kind: 'greenhouse', board: 'razorpaysoftware' });
    expect(list.find((c) => c.slug === 'acme')).toMatchObject({ name: 'Acme', careersUrl: 'https://jobs.ashbyhq.com/acme', careers: { kind: 'ashby', board: 'acme' } });
    // A famous company that already has a listing keeps it.
    expect(list.find((c) => c.slug === 'amazon')?.careers).toEqual({ kind: 'amazon' });
  });

  it('reads the boards file and ignores a missing or broken one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'boards-'));
    const path = join(dir, 'boards.json');
    expect(loadDiscoveredBoards(path)).toEqual([]);
    writeFileSync(path, '{not json');
    expect(loadDiscoveredBoards(path)).toEqual([]);
    writeFileSync(path, JSON.stringify({ version: 1, generatedAt: NOW.toISOString(), boards: [board({})] }));
    expect(loadDiscoveredBoards(path)).toHaveLength(1);
  });

  it('probes each ATS and counts India-open jobs; SmartRecruiters must name the same company', async () => {
    const { fetchImpl } = jsonFetch({
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs': () => ({ body: { jobs: [{ location: { name: 'Bengaluru, India' } }, { location: { name: 'London' } }] } }),
      'https://api.lever.co/v0/postings/acme': () => ({ body: [{ categories: { location: 'Remote' }, workplaceType: 'remote' }] }),
      'https://api.ashbyhq.com/posting-api/job-board/acme': () => ({ body: { jobs: [{ location: 'Pune', isListed: true }, { location: 'Pune', isListed: false }] } }),
      'https://api.smartrecruiters.com/v1/companies/acme/postings': () => ({ body: { totalFound: 4, content: [{ company: { identifier: 'OtherCo' } }] } }),
    });
    const http = new PoliteFetcher({ fetchImpl, sleep: noSleep });
    expect(await probeBoard(http, 'greenhouse', 'acme')).toEqual({ total: 2, india: 1 });
    expect(await probeBoard(http, 'lever', 'acme')).toEqual({ total: 1, india: 1 });
    expect(await probeBoard(http, 'ashby', 'acme')).toEqual({ total: 1, india: 1 });
    expect(await probeBoard(http, 'smartrecruiters', 'acme')).toBeNull();
    expect(await probeBoard(http, 'greenhouse', 'nobody')).toBeNull();
  });

  it('reads the hosted Ashby board page when the posting API cannot be read', async () => {
    const appData = (jobBoard: unknown) => `<html><script>window.__appData = ${JSON.stringify({ jobBoard })};</script></html>`;
    const pages: Record<string, string> = {
      gamma: appData({ jobPostings: [{ id: 'a1', title: 'SWE', locationName: 'Bengaluru', secondaryLocations: [] }, { id: 'a2', title: 'PM', locationName: 'London' }] }),
      ghost: appData(null),
    };
    const fetchImpl = async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
      if (u.host === 'api.ashbyhq.com') return new Response('{}', { status: 500 });
      const page = pages[u.pathname.slice(1)];
      return page ? new Response(page, { status: 200, headers: { 'Content-Type': 'text/html' } }) : new Response('', { status: 404 });
    };
    const http = new PoliteFetcher({ fetchImpl, sleep: noSleep, minDelayMs: 0 });
    expect(await probeBoard(http, 'ashby', 'gamma')).toEqual({ total: 2, india: 1 });
    expect(await probeBoard(http, 'ashby', 'ghost')).toBeNull();
    expect(await probeBoard(http, 'ashby', 'missing')).toBeNull();
  });

  it('keeps boards with India jobs, drops ones without, and keeps a known board it could not reach', async () => {
    const { fetchImpl } = jsonFetch({
      'https://api.lever.co/v0/postings/acme': () => ({ body: [{ categories: { location: 'Hyderabad' } }] }),
      'https://boards-api.greenhouse.io/v1/boards/zeta/jobs': () => ({ body: { jobs: [{ location: { name: 'New York' } }] } }),
      'https://api.ashbyhq.com/posting-api/job-board/beta': () => ({ status: 500, body: {} }),
      'https://jobs.ashbyhq.com/beta': () => ({ status: 500, body: {} }),
    });
    const http = new PoliteFetcher({ fetchImpl, sleep: noSleep, minDelayMs: 0 });
    const report = await discoverBoards({
      http,
      now: NOW,
      candidates: [
        { slug: 'acme', name: 'Acme', category: 'product' },
        { slug: 'zeta', name: 'Zeta', category: 'fintech' },
        { slug: 'beta', name: 'Beta', category: 'product' },
      ],
      previous: [board({ slug: 'beta', name: 'Beta', ats: 'ashby', board: 'beta' })],
    });
    expect(report.file.boards.map((b) => `${b.slug}:${b.ats}`)).toEqual(['acme:lever', 'beta:ashby']);
    expect(report.errors.some((e) => e.includes('Beta ashby/beta'))).toBe(true);
  });
});

describe('board discovery and robots.txt', () => {
  it('stops asking a platform whose robots.txt disallows its API, and drops its old boards', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname === '/robots.txt') {
        return new Response(u.host === 'api.smartrecruiters.com' ? 'User-agent: LinkedInBot\nAllow: /\n\nUser-agent: *\nDisallow: /\n' : '', {
          status: u.host === 'api.smartrecruiters.com' ? 200 : 404,
        });
      }
      return new Response('not found', { status: 404 });
    };
    const http = new PoliteFetcher({ fetchImpl, sleep: noSleep, minDelayMs: 0 });
    const candidates = ['alpha', 'bravo', 'charlie', 'delta'].map((slug) => ({ slug, name: slug, category: 'product' as const }));
    const report = await discoverBoards({
      http,
      now: NOW,
      candidates,
      concurrency: 1,
      previous: [board({ slug: 'alpha', name: 'alpha', ats: 'smartrecruiters', board: 'alpha' })],
    });
    expect(report.blocked).toEqual(['smartrecruiters']);
    expect(report.errors).toEqual([]);
    expect(report.file.boards).toEqual([]);
    expect(calls.filter((c) => c.includes('smartrecruiters'))).toEqual(['https://api.smartrecruiters.com/robots.txt']);
    // Greenhouse, Lever and Ashby are still probed for every company; SmartRecruiters once.
    expect(report.probed).toBe(candidates.length * 3 + 1);
    expect(formatDiscoverySummary(report)).toContain('Skipped (robots.txt disallows the API): smartrecruiters.');
  });
});

describe('Unstop jobs', () => {
  const item = {
    id: 991,
    title: 'Software Engineer',
    public_url: 'jobs/software-engineer-acme-991',
    organisation: { name: 'Acme' },
    region: 'offline',
    jobDetail: { locations: [{ city: 'Pune' }, { city: 'Mumbai' }], type: 'Full Time' },
    approved_date: '2026-10-01T10:00:00+05:30',
  };

  it('maps a job with its cities and stated type, and never a salary', () => {
    const job = normalizeUnstopJob(item, 'jobs', NOW)!;
    expect(job).toMatchObject({
      source: 'unstop',
      sourceJobId: 'jobs:991',
      company: 'Acme',
      location: 'Pune, Mumbai',
      remote: false,
      employmentType: 'full_time',
      applyUrl: 'https://unstop.com/jobs/software-engineer-acme-991',
    });
    expect(job.salaryMin).toBeUndefined();
    expect(parseJob(job).ok).toBe(true);
  });

  it('marks internships and work from home', () => {
    const job = normalizeUnstopJob({ ...item, region: 'online', jobDetail: {} }, 'internships', NOW)!;
    expect(job).toMatchObject({ employmentType: 'internship', remote: true, location: 'India (work from home)', sourceJobId: 'internships:991' });
  });

  it('pages both kinds and skips listings whose applications closed', async () => {
    const { fetchImpl, calls } = jsonFetch({
      'https://unstop.com/api/public/opportunity/search-result?opportunity=jobs': () => ({
        body: { data: { data: [item, { ...item, id: 992, regnRequirements: { end_regn_dt: '2026-09-01T00:00:00Z' } }], last_page: 1 } },
      }),
      'https://unstop.com/api/public/opportunity/search-result?opportunity=internships': () => ({ body: { data: { data: [], last_page: 1 } } }),
    });
    const jobs = await fetchUnstopJobs(fetchImpl, { maxPages: 3, now: NOW, warn: () => undefined });
    expect(jobs.map((j) => j.sourceJobId)).toEqual(['jobs:991']);
    expect(calls.filter((c) => c.includes('search-result'))).toHaveLength(2);
  });
});

describe('Adzuna', () => {
  const item = {
    id: '4412',
    title: '<strong>Graduate</strong> Engineer Trainee',
    company: { display_name: 'Acme' },
    location: { display_name: 'Chennai, Tamil Nadu' },
    redirect_url: 'https://www.adzuna.in/land/ad/4412',
    created: '2026-10-05T08:00:00Z',
    description: 'Build things',
    salary_min: 300000,
    salary_max: 450000,
    salary_is_predicted: '0',
    contract_time: 'full_time',
  };

  it('keeps stated salaries and drops Adzuna estimates', () => {
    expect(normalizeAdzunaJob(item, NOW)).toMatchObject({ title: 'Graduate Engineer Trainee', salaryMin: 300000, salaryMax: 450000, salaryCurrency: 'INR', salaryPeriod: 'year', employmentType: 'full_time' });
    expect(normalizeAdzunaJob({ ...item, salary_is_predicted: '1' }, NOW)).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null });
    expect(parseJob(normalizeAdzunaJob(item, NOW)).ok).toBe(true);
  });

  it('asks India categories and keywords, caps calls, and stops on a key or quota error', async () => {
    const urls: string[] = [];
    const ok = async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ results: [item] }), { status: 200 });
    };
    const warnings: string[] = [];
    const jobs = await fetchAdzuna(ok, { appId: 'id', appKey: 'key', maxCalls: 3, pagesPerQuery: 2, now: NOW, warn: (m) => warnings.push(m), sleep: noSleep });
    expect(jobs).toHaveLength(1);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toMatch(/^https:\/\/api\.adzuna\.com\/v1\/api\/jobs\/in\/search\/1\?category=it-jobs&app_id=id&app_key=key/);
    expect(warnings[0]).toMatch(/ADZUNA_MAX_CALLS/);
    const denied = async () => new Response('{}', { status: 401 });
    await expect(fetchAdzuna(denied, { appId: 'id', appKey: 'bad', maxCalls: 5, pagesPerQuery: 1, now: NOW, warn: () => undefined, sleep: noSleep })).rejects.toThrow(/HTTP 401/);
  });
});

describe('company careers on the job board', () => {
  it('turns a careers opening into a job row with the company name', () => {
    const amazon = COMPANIES.find((c) => c.slug === 'amazon')!;
    const job = openingToCandidate(amazon, {
      sourceJobId: '/jobs/123',
      title: 'SDE Intern',
      location: 'Bengaluru, KA, IND',
      remote: false,
      url: 'https://www.amazon.jobs/en/jobs/123',
      postedAt: '2026-10-01T00:00:00.000Z',
      typeHint: null,
      levelHint: null,
    });
    expect(job).toMatchObject({ source: 'careers', sourceJobId: 'amazon:/jobs/123', company: 'Amazon', employmentType: 'internship' });
    expect(parseJob(job).ok).toBe(true);
  });

  it('reads only careers kinds the ATS sources do not cover, and reports a failing site', async () => {
    const { fetchImpl } = jsonFetch({
      'https://api.smartrecruiters.com/v1/companies/Visa/postings': () => ({ body: { totalFound: 1, content: [{ id: 'v1', name: 'Analyst', location: { city: 'Bengaluru', country: 'in' } }] } }),
    });
    const visa = { ...COMPANIES.find((c) => c.slug === 'visa')!, careers: { kind: 'smartrecruiters' as const, company: 'Visa' } };
    const stripe = COMPANIES.find((c) => c.slug === 'stripe')!;
    const broken = { ...visa, slug: 'broken', careers: { kind: 'smartrecruiters' as const, company: 'Broken' } };
    const warnings: string[] = [];
    const jobs = await fetchCareersJobs(fetchImpl, { companies: [visa, stripe, broken], maxPages: 2, now: NOW, warn: (m) => warnings.push(m) });
    expect(jobs.map((j) => j.sourceJobId)).toEqual(['visa:v1']);
    expect(warnings.some((w) => w.startsWith('broken:'))).toBe(true);
  });

  it('marks companies read in full, and skips the rest of a platform robots.txt disallows', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname === '/robots.txt') return new Response(u.host === 'api.smartrecruiters.com' ? 'User-agent: *\nDisallow: /\n' : '', { status: u.host === 'api.smartrecruiters.com' ? 200 : 404 });
      return new Response(JSON.stringify({ hits: 1, jobs: [{ id_icims: '9', title: 'SDE', job_path: '/en/jobs/9/sde', normalized_location: 'Bengaluru, KA, IND' }] }), { status: 200 });
    };
    const sr = (slug: string) => ({ ...COMPANIES.find((c) => c.slug === 'visa')!, slug, careers: { kind: 'smartrecruiters' as const, company: slug } });
    const amazon = COMPANIES.find((c) => c.slug === 'amazon')!;
    const warnings: string[] = [];
    const complete: string[] = [];
    await fetchCareersJobs(fetchImpl, { companies: [sr('one'), sr('two'), sr('three'), amazon], maxPages: 2, now: NOW, warn: (m) => warnings.push(m), complete: (p) => complete.push(p), concurrency: 1 });
    expect(complete).toEqual(['amazon:']);
    expect(calls.filter((c) => c.includes('smartrecruiters'))).toEqual(['https://api.smartrecruiters.com/robots.txt']);
    expect(warnings).toContain('smartrecruiters: robots.txt disallows its API; 2 more smartrecruiters companies skipped');
  });
});

describe('job age', () => {
  it('drops jobs posted more than maxAgeDays ago and counts them', async () => {
    const source: SourceDefinition = {
      id: 'lever',
      label: 'Lever',
      tier: 1,
      officialApi: true,
      fetchCandidates: async () =>
        ['2026-10-01T00:00:00Z', '2026-08-01T00:00:00Z', null].map((postedAt, i) => ({
          source: 'lever' as const,
          sourceJobId: `j${i}`,
          title: `Engineer ${i}`,
          company: 'Acme',
          location: 'Pune, India',
          remote: false,
          postedAt,
          applyUrl: `https://jobs.lever.co/acme/j${i}`,
        })),
    };
    const report = await runPipeline({ sources: [source], linkCheck: false, maxAgeDays: 30, now: () => NOW });
    expect(report.sources[0].tooOld).toBe(1);
    expect(report.jobs.map((j) => j.sourceJobId).sort()).toEqual(['j0', 'j2']);
  });
});
