import { describe, expect, it } from 'vitest';
import {
  normalizeAmazonJob,
  normalizeEightfoldPosition,
  normalizeGoogleJob,
  normalizeOracleRequisition,
  normalizeSmartRecruitersPosting,
  normalizeWorkdayPosting,
  parsePostedDate,
  parseWorkdayPostedOn,
} from '../feed/careers.js';
import { COMPANIES } from '../feed/companies.js';
import { normalizeDevfolio, normalizeDevpost, normalizeHackerEarth, normalizeUnstop, parseDevpostDates } from '../feed/hackathons.js';
import { BlockedByRobotsError, PoliteFetcher } from '../feed/http.js';
import { buildSnapshot, formatFeedSummary, istDate, mergeHackathons, runFeedScrape } from '../feed/run.js';
import { classifyKind, classifyLevel, classifyRoleFamily, parseHackathon, parseOpening, type Opening } from '../feed/schema.js';
import { MemoryFeedStore } from '../feed/store.js';

const NOW = new Date('2026-10-07T06:00:00Z');

type Route = (url: string, init?: RequestInit) => unknown;

/** fetch stub: robots.txt allows everything unless given; routes match by URL prefix. */
function stubFetch(routes: Record<string, Route>, robots: Record<string, { status: number; body?: string }> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const u = new URL(url);
    if (u.pathname === '/robots.txt') {
      const r = robots[u.host] ?? { status: 404 };
      return new Response(r.body ?? '', { status: r.status });
    }
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key](url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

const noSleep = async () => undefined;

describe('company registry', () => {
  it('has unique, valid slugs and https careers pages', () => {
    const slugs = COMPANIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COMPANIES) {
      expect(c.slug).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      expect(c.careersUrl.startsWith('https://')).toBe(true);
    }
  });

  it('covers big tech, Indian product companies and IT services', () => {
    const cats = new Set(COMPANIES.map((c) => c.category));
    for (const cat of ['big_tech', 'indian_product', 'services', 'finance', 'semiconductor']) expect(cats.has(cat as never)).toBe(true);
    expect(COMPANIES.filter((c) => c.careers).length).toBeGreaterThanOrEqual(30);
  });
});

describe('classification', () => {
  it('reads internships from the title or the type hint', () => {
    expect(classifyKind('Software Engineering Intern, Summer 2027')).toBe('internship');
    expect(classifyKind('Data Analyst', 'internship')).toBe('internship');
    expect(classifyKind('SDE', 'full-time')).toBe('full_time');
    expect(classifyKind('Backend Engineer', 'Contract')).toBe('other');
    expect(classifyKind('Backend Engineer')).toBe('unknown');
  });

  it('separates entry-level from experienced roles', () => {
    expect(classifyLevel('Software Engineer I')).toBe('entry');
    expect(classifyLevel('SDE-1, Payments')).toBe('entry');
    expect(classifyLevel('Graduate Engineer Trainee')).toBe('entry');
    expect(classifyLevel('Software Engineering Intern')).toBe('entry');
    expect(classifyLevel('Senior Software Engineer')).toBe('experienced');
    expect(classifyLevel('Software Engineer II')).toBe('experienced');
    expect(classifyLevel('Senior Associate, Data')).toBe('experienced');
    expect(classifyLevel('Software Engineer')).toBe('unknown');
    expect(classifyLevel('Analyst', 'Entry level')).toBe('entry');
  });

  it('groups titles into role families, most specific first', () => {
    expect(classifyRoleFamily('Machine Learning Engineer')).toBe('ml');
    expect(classifyRoleFamily('Data Engineer')).toBe('data');
    expect(classifyRoleFamily('Site Reliability Engineer')).toBe('devops');
    expect(classifyRoleFamily('SDET II')).toBe('qa');
    expect(classifyRoleFamily('ASIC Verification Engineer')).toBe('hardware');
    expect(classifyRoleFamily('Product Designer')).toBe('design');
    expect(classifyRoleFamily('Associate Product Manager')).toBe('product');
    expect(classifyRoleFamily('Frontend Developer')).toBe('software');
    expect(classifyRoleFamily('Account Executive')).toBe('other');
  });
});

describe('dates', () => {
  it('parses careers-site dates and never returns a future one', () => {
    expect(parsePostedDate('October 5, 2026', NOW)?.slice(0, 10)).toBe('2026-10-05');
    expect(parsePostedDate(1_790_000_000, NOW)).toBe(new Date(1_790_000_000_000).toISOString());
    expect(parsePostedDate('2027-01-01', NOW)).toBeNull();
    expect(parsePostedDate('', NOW)).toBeNull();
  });

  it('turns Workday relative dates into days, but not "30+ days ago"', () => {
    expect(parseWorkdayPostedOn('Posted Today', NOW)).toBe('2026-10-07T00:00:00.000Z');
    expect(parseWorkdayPostedOn('Posted Yesterday', NOW)).toBe('2026-10-06T00:00:00.000Z');
    expect(parseWorkdayPostedOn('Posted 3 Days Ago', NOW)).toBe('2026-10-04T00:00:00.000Z');
    expect(parseWorkdayPostedOn('Posted 30+ Days Ago', NOW)).toBeNull();
  });

  it('parses Devpost date ranges', () => {
    expect(parseDevpostDates('Oct 01 - Nov 15, 2026')).toEqual({ startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-15T23:59:59.000Z' });
    expect(parseDevpostDates('Oct 14 - 15, 2026')).toEqual({ startsAt: '2026-10-14T00:00:00.000Z', endsAt: '2026-10-15T23:59:59.000Z' });
    expect(parseDevpostDates('Dec 28, 2026 - Jan 05, 2027')).toEqual({ startsAt: '2026-12-28T00:00:00.000Z', endsAt: '2027-01-05T23:59:59.000Z' });
    expect(parseDevpostDates('Dec 28 - Jan 05, 2027').startsAt).toBe('2026-12-28T00:00:00.000Z');
    expect(parseDevpostDates('soon')).toEqual({ startsAt: null, endsAt: null });
  });

  it('gives the IST calendar day', () => {
    expect(istDate(new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-08');
    expect(istDate(new Date('2026-10-07T18:00:00Z'))).toBe('2026-10-07');
  });
});

describe('careers adapters', () => {
  it('maps a Workday posting', () => {
    const a = { kind: 'workday' as const, host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' };
    const o = normalizeWorkdayPosting(
      { title: 'ASIC Design Engineer - New College Grad 2027', externalPath: '/job/India-Bengaluru/ASIC_JR123', locationsText: 'India, Bengaluru', postedOn: 'Posted 2 Days Ago' },
      a,
      NOW
    )!;
    expect(o.url).toBe('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/India-Bengaluru/ASIC_JR123');
    expect(o.postedAt).toBe('2026-10-05T00:00:00.000Z');
    expect(normalizeWorkdayPosting({ title: 'x' }, a, NOW)).toBeNull();
  });

  it('maps SmartRecruiters, Eightfold, Oracle, Amazon and Google postings', () => {
    const sr = normalizeSmartRecruitersPosting(
      { id: '744000', name: 'Software Engineer Intern', releasedDate: '2026-10-01T10:00:00.000Z', location: { city: 'Bengaluru', country: 'in', remote: false }, typeOfEmployment: { label: 'Intern' }, experienceLevel: { label: 'Internship' } },
      'Visa',
      NOW
    )!;
    expect(sr).toMatchObject({ location: 'Bengaluru, India', url: 'https://jobs.smartrecruiters.com/Visa/744000', typeHint: 'Intern' });

    const ef = normalizeEightfoldPosition(
      { id: 1970, name: 'Software Engineer', locations: ['Hyderabad, Telangana, India'], t_create: 1_790_000_000, canonicalPositionUrl: 'https://apply.careers.microsoft.com/careers/job/1970' },
      { kind: 'eightfold', host: 'apply.careers.microsoft.com', domain: 'microsoft.com' },
      NOW
    )!;
    expect(ef).toMatchObject({ sourceJobId: '1970', location: 'Hyderabad, Telangana, India', url: 'https://apply.careers.microsoft.com/careers/job/1970' });

    const orc = normalizeOracleRequisition(
      { Id: '300123', Title: 'Member of Technical Staff', PostedDate: '2026-10-03', PrimaryLocation: 'Bangalore, Karnataka', PrimaryLocationCountry: 'IN' },
      { kind: 'oracle', host: 'eeho.fa.us2.oraclecloud.com', site: 'CX_45001' },
      NOW
    )!;
    expect(orc.location).toBe('Bangalore, Karnataka, India');
    expect(orc.url).toBe('https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001/job/300123');

    const amz = normalizeAmazonJob({ id_icims: '2790123', title: 'SDE I', job_path: '/en/jobs/2790123/sde-i', normalized_location: 'Bengaluru, KA, IND', posted_date: 'October 4, 2026', job_schedule_type: 'full-time' }, NOW)!;
    expect(amz).toMatchObject({ sourceJobId: '2790123', url: 'https://www.amazon.jobs/en/jobs/2790123/sde-i', typeHint: 'full-time' });

    const g = normalizeGoogleJob({ id: 'jobs/1234', title: 'Software Engineer, University Graduate', locations: [{ display: 'Bengaluru, Karnataka, India' }], publish_date: '2026-10-02T00:00:00Z' }, NOW)!;
    expect(g).toMatchObject({ sourceJobId: '1234', url: 'https://www.google.com/about/careers/applications/jobs/results/1234' });
  });
});

describe('hackathon adapters', () => {
  it('maps Devfolio, Unstop, Devpost and HackerEarth listings', () => {
    const df = normalizeDevfolio({ _source: { name: 'HackBLR', slug: 'hackblr', is_online: false, city: 'Bengaluru', country: 'India', starts_at: '2026-11-14T03:30:00Z', ends_at: '2026-11-15T12:30:00Z', themes: [{ name: 'AI' }] } })!;
    expect(df).toMatchObject({ url: 'https://hackblr.devfolio.co/', mode: 'in_person', city: 'Bengaluru', inIndia: true, themes: ['AI'] });

    const un = normalizeUnstop({ id: 99, title: 'Smart India Ideathon', public_url: 'hackathons/smart-india-ideathon-99', region: 'online', organisation: { name: 'IIT X' }, start_date: '2026-10-20T10:00:00+05:30', end_date: '2026-10-22T18:00:00+05:30', regnRequirements: { end_regn_dt: '2026-10-18T23:59:00+05:30' } })!;
    expect(un).toMatchObject({ url: 'https://unstop.com/hackathons/smart-india-ideathon-99', mode: 'online', organiser: 'IIT X', registrationEndsAt: '2026-10-18T18:29:00.000Z' });

    const dp = normalizeDevpost({ id: 5, title: 'Global AI Jam', url: 'https://ai-jam.devpost.com/', displayed_location: { icon: 'globe', location: 'Online' }, submission_period_dates: 'Oct 10 - Nov 01, 2026', prize_amount: '$<span data-currency-value>10,000</span>', themes: [{ name: 'Machine Learning/AI' }] })!;
    expect(dp).toMatchObject({ mode: 'online', prizeText: '$10,000 in prizes', startsAt: '2026-10-10T00:00:00.000Z' });

    const he = normalizeHackerEarth({ title: 'HackerEarth AI Sprint', url: 'https://www.hackerearth.com/challenges/hackathon/ai-sprint/', challenge_type: 'hackathon', start_utc_tstamp: '2026-10-12 04:30:00', end_utc_tstamp: '2026-10-20 04:30:00', status: 'UPCOMING' })!;
    expect(he).toMatchObject({ sourceId: '/challenges/hackathon/ai-sprint', startsAt: '2026-10-12T04:30:00.000Z' });
    expect(normalizeHackerEarth({ title: 'Hiring challenge', url: 'https://x', challenge_type: 'hiring' })).toBeNull();

    for (const h of [df, un, dp, he]) expect(parseHackathon(h).ok).toBe(true);
  });

  it('merges the same event listed on two sites, keeping the richer listing', () => {
    const base = parseHackathon(normalizeDevpost({ id: 1, title: 'Hack BLR!', url: 'https://a.devpost.com/', displayed_location: { location: 'Bengaluru, India' }, submission_period_dates: 'Nov 14 - 15, 2026' })!);
    const rich = parseHackathon(normalizeDevfolio({ name: 'HackBLR', slug: 'hackblr', is_online: false, city: 'Bengaluru', country: 'India', starts_at: '2026-11-14T00:00:00Z', ends_at: '2026-11-15T12:00:00Z', organization: { name: 'BLR Devs' } })!);
    if (!base.ok || !rich.ok) throw new Error('fixtures invalid');
    const { unique, duplicates } = mergeHackathons([base.value, rich.value]);
    expect(duplicates).toBe(1);
    expect(unique[0].source).toBe('devfolio');
  });
});

describe('polite fetching', () => {
  it('obeys robots.txt and spaces requests to one host', async () => {
    const { fetchImpl } = stubFetch({ 'https://a.test/ok': () => ({ ok: 1 }) }, { 'a.test': { status: 200, body: 'User-agent: *\nDisallow: /private\nCrawl-delay: 2' } });
    const waits: number[] = [];
    const t = 0;
    const http = new PoliteFetcher({ fetchImpl, minDelayMs: 500, sleep: async (ms) => void waits.push(ms), now: () => t });
    await expect(http.json('https://a.test/private/x')).rejects.toBeInstanceOf(BlockedByRobotsError);
    await http.json('https://a.test/ok');
    await http.json('https://a.test/ok');
    expect(waits).toEqual([2000]);
  });

  it('treats an unreadable robots.txt as a block', async () => {
    const { fetchImpl } = stubFetch({ 'https://b.test/': () => ({}) }, { 'b.test': { status: 403 } });
    const http = new PoliteFetcher({ fetchImpl, sleep: noSleep });
    await expect(http.json('https://b.test/x')).rejects.toThrow('robots.txt could not be read (HTTP 403), so b.test is skipped');
  });
});

describe('snapshots', () => {
  const o = (id: string, title: string, extra: Partial<Opening> = {}): Opening => ({
    companySlug: 'nvidia',
    source: 'workday',
    sourceJobId: id,
    title,
    kind: classifyKind(title),
    level: classifyLevel(title),
    roleFamily: classifyRoleFamily(title),
    location: 'Bengaluru, India',
    remote: false,
    url: `https://x.test/${id}`,
    postedAt: null,
    ...extra,
  });

  it('marks the first run as a baseline (no hiring burst from it)', () => {
    const s = buildSnapshot('nvidia', [o('1', 'ASIC Intern'), o('2', 'Senior Engineer')], new Set(), '2026-10-07', NOW.toISOString());
    expect(s).toMatchObject({ open_total: 2, internships: 1, new_openings: 2, baseline: true });
  });

  it('counts only never-seen postings as new', () => {
    const s = buildSnapshot('nvidia', [o('1', 'ASIC Intern'), o('3', 'Data Engineer', { postedAt: '2026-10-06T00:00:00.000Z' })], new Set(['1', '2']), '2026-10-07', NOW.toISOString());
    expect(s).toMatchObject({ new_openings: 1, baseline: false, sample_titles: ['Data Engineer'], role_families: { hardware: 1, data: 1 } });
  });
});

describe('runFeedScrape', () => {
  const routes: Record<string, Route> = {
    'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs': (_u, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.searchText).toBe('India');
      return {
        total: 3,
        jobPostings: [
          { title: 'Software Engineering Intern 2027', externalPath: '/job/Pune/Intern_JR1', locationsText: 'India, Pune', postedOn: 'Posted Today' },
          { title: 'Senior GPU Architect', externalPath: '/job/Bengaluru/GPU_JR2', locationsText: 'India, Bengaluru', postedOn: 'Posted 30+ Days Ago' },
          { title: 'Systems Engineer', externalPath: '/job/Santa-Clara/Sys_JR3', locationsText: 'US, CA, Santa Clara', postedOn: 'Posted Today' },
        ],
      };
    },
    'https://www.amazon.jobs/en/search.json': () => {
      throw new Error('should not be called');
    },
    'https://unstop.com/api/public/opportunity/search-result': () => ({
      data: {
        last_page: 1,
        data: [
          { id: 1, title: 'Campus Hack', public_url: 'hackathons/campus-hack-1', region: 'offline', address_with_country_logo: { city: 'Chennai', country: { name: 'India' } }, start_date: '2026-11-01T09:00:00+05:30', end_date: '2026-11-02T18:00:00+05:30' },
          { id: 2, title: 'Berlin Hack', public_url: 'hackathons/berlin-2', region: 'offline', address_with_country_logo: { city: 'Berlin', country: { name: 'Germany' } }, start_date: '2026-11-01T09:00:00+01:00' },
          { id: 3, title: 'Old Hack', public_url: 'hackathons/old-3', region: 'online', start_date: '2026-09-01T09:00:00+05:30', end_date: '2026-09-02T09:00:00+05:30' },
        ],
      },
    }),
  };

  it('keeps India-open openings and hackathons online or in India, then publishes and closes stale rows', async () => {
    const store = new MemoryFeedStore();
    // A posting from an earlier run that is no longer listed.
    await store.upsertOpenings([
      { company_slug: 'nvidia', source: 'workday', source_job_id: '/job/Old/JR0', title: 'Old', kind: 'unknown', level: 'unknown', role_family: 'other', location: 'India', remote: false, url: 'https://x.test/0', posted_at: null, last_seen_at: '2026-10-01T00:00:00.000Z', is_active: true },
    ]);
    const { fetchImpl } = stubFetch(routes);
    const report = await runFeedScrape({
      sources: ['companies', 'hackathons'],
      companies: ['nvidia', 'tcs'],
      hackathonSources: ['unstop'],
      region: 'india',
      publish: true,
      store,
      fetchImpl,
      sleep: noSleep,
      clock: () => NOW,
    });

    expect(report.companies).toHaveLength(1);
    expect(report.companies[0]).toMatchObject({ slug: 'nvidia', ok: true, fetched: 3, outOfRegion: 1, kept: 2, internships: 1, entryLevel: 1, newOpenings: 2 });
    expect(report.curatedOnly).toEqual(['tcs']);
    expect(report.snapshots[0]).toMatchObject({ company_slug: 'nvidia', taken_on: '2026-10-07', open_total: 2, baseline: false });
    expect([...store.openings.values()].filter((r) => r.is_active).map((r) => r.source_job_id).sort()).toEqual(['/job/Bengaluru/GPU_JR2', '/job/Pune/Intern_JR1']);
    expect(report.totals.expired.openings).toBe(1);
    expect(store.companies.size).toBe(COMPANIES.length);
    expect(store.companies.get('tcs')?.has_careers_feed).toBe(false);

    const hs = report.hackathonSources[0];
    expect(hs).toMatchObject({ source: 'unstop', fetched: 3, kept: 1, ended: 1, outOfRegion: 1 });
    expect(report.hackathons.map((h) => h.title)).toEqual(['Campus Hack']);
    expect(store.hackathons.size).toBe(1);

    const summary = formatFeedSummary(report);
    expect(summary).toContain('nvidia');
    expect(summary).toContain('No readable listing (curated in Admin): tcs.');
  });

  it('publishes hackathons per source, so one rejected source does not stop the others', async () => {
    class RejectingStore extends MemoryFeedStore {
      async upsertHackathons(rows: Parameters<MemoryFeedStore['upsertHackathons']>[0]) {
        if (rows.some((r) => r.source === 'codeforces')) throw new Error('violates check constraint "hackathons_source_check"');
        return super.upsertHackathons(rows);
      }
    }
    const store = new RejectingStore();
    const start = Math.floor(NOW.getTime() / 1000) + 86_400;
    const { fetchImpl } = stubFetch({
      'https://codeforces.com/api/contest.list': () => ({ status: 'OK', result: [{ id: 7, name: 'Round 7', phase: 'BEFORE', startTimeSeconds: start, durationSeconds: 7200 }] }),
      'https://unstop.com/api/public/opportunity/search-result': () => ({
        data: { data: [{ id: 5, title: 'Online Hack', public_url: 'hackathons/online-hack-5', region: 'online', start_date: '2026-10-20T00:00:00Z', end_date: '2026-10-21T00:00:00Z' }], last_page: 1 },
      }),
    });
    const report = await runFeedScrape({ sources: ['hackathons'], hackathonSources: ['unstop', 'codeforces'], region: 'india', publish: true, store, fetchImpl, sleep: noSleep, clock: () => NOW });
    expect([...store.hackathons.values()].map((h) => h.source)).toEqual(['unstop']);
    expect(report.hackathonSources.find((s) => s.source === 'codeforces')).toMatchObject({ ok: false, error: expect.stringMatching(/publishing failed/) });
    expect(report.hackathonSources.find((s) => s.source === 'unstop')?.ok).toBe(true);
  });

  it('reports a failing company without closing its stored openings', async () => {
    const store = new MemoryFeedStore();
    await store.upsertOpenings([
      { company_slug: 'amazon', source: 'amazon', source_job_id: '1', title: 'SDE', kind: 'unknown', level: 'unknown', role_family: 'software', location: 'India', remote: false, url: 'https://x.test/1', posted_at: null, last_seen_at: '2026-10-01T00:00:00.000Z', is_active: true },
    ]);
    const { fetchImpl } = stubFetch({}, { 'www.amazon.jobs': { status: 200, body: 'User-agent: *\nDisallow: /en/search.json' } });
    const report = await runFeedScrape({ sources: ['companies'], companies: ['amazon'], region: 'india', publish: true, store, fetchImpl, sleep: noSleep, clock: () => NOW });
    expect(report.companies[0]).toMatchObject({ ok: false, blockedByRobots: true });
    expect(store.openings.get('amazon|1')?.is_active).toBe(true);
    expect(formatFeedSummary(report)).toContain('FAILED (robots.txt)');
  });

  it('does not write anything on a dry run', async () => {
    const { fetchImpl } = stubFetch(routes);
    const report = await runFeedScrape({ sources: ['companies'], companies: ['nvidia'], region: 'all', publish: false, fetchImpl, sleep: noSleep, clock: () => NOW });
    expect(report.published).toBe(false);
    expect(report.companies[0]).toMatchObject({ kept: 3, newOpenings: null });
    expect(report.snapshots[0].baseline).toBe(true);
  });

  it('every published opening is valid and has a source link', () => {
    const bad = parseOpening({ companySlug: 'x', source: 'workday', sourceJobId: '1', title: 'T', kind: 'unknown', level: 'unknown', roleFamily: 'other', location: '', remote: false, url: 'not a url', postedAt: null });
    expect(bad.ok).toBe(false);
  });
});
