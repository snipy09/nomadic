import { describe, expect, it, vi } from 'vitest';
import { classifyContact, nameBeforeEmail } from '../contacts/classify.ts';
import { careerLinks, pageSeeds, scrapeCompanyPages } from '../contacts/company-pages.ts';
import { contactsFromText } from '../contacts/from-text.ts';
import { contactsFromPost, parsePostHeader, scrapeHnContacts } from '../contacts/hn.ts';
import { isJobBoardHost } from '../contacts/hosts.ts';
import { contactsFromJobs, type JobDescriptionRow } from '../contacts/job-descriptions.ts';
import { isAllowed, parseRobots, robotsFromResponse } from '../contacts/robots.ts';
import { formatContactSummary, mergeDuplicates, runContactScrape } from '../contacts/run.ts';
import { parseContact, type Contact } from '../contacts/schema.ts';
import { MemoryContactStore, emailHash } from '../contacts/store.ts';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const html = (body: string, url?: string) => {
  const res = new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

const base = {
  company: 'Acme',
  companyDomain: null,
  hiringFor: null,
  location: 'Bengaluru',
  remote: false,
  source: 'hn_whos_hiring' as const,
  sourceUrl: 'https://news.ycombinator.com/item?id=1',
  jobUrl: null,
  postedAt: null,
};

describe('classifyContact', () => {
  it('reads the kind and title written next to the address', () => {
    expect(classifyContact({ addressType: 'role', context: 'CTO', source: 'hn_whos_hiring' })).toEqual({ kind: 'team_inbox', roleTitle: null });
    expect(classifyContact({ addressType: 'personal', context: 'I am the co-founder,', source: 'company_page' })).toEqual({ kind: 'founder', roleTitle: 'Co-founder' });
    expect(classifyContact({ addressType: 'personal', context: 'our Talent Acquisition lead', source: 'job_description' }).kind).toBe('recruiter');
    expect(classifyContact({ addressType: 'personal', context: '(Engineering Manager)', source: 'job_description' })).toEqual({ kind: 'hiring_manager', roleTitle: 'Engineering manager' });
    expect(classifyContact({ addressType: 'personal', context: 'email me', source: 'hn_whos_hiring' }).kind).toBe('employee');
    expect(classifyContact({ addressType: 'personal', context: 'email me', source: 'company_page' }).kind).toBe('unknown');
  });
});

describe('nameBeforeEmail', () => {
  it('keeps a name written before the address only when it matches the address', () => {
    expect(nameBeforeEmail('Questions? Priya Sharma (', 'priya.sharma@acme.in')).toBe('Priya Sharma');
    expect(nameBeforeEmail('Contact Priya: ', 'priya@acme.in')).toBe('Priya');
    expect(nameBeforeEmail('Priya Sharma, CTO - ', 'psharma@acme.in')).toBe('Priya Sharma');
    expect(nameBeforeEmail('or to Neha Gupta (HR) at ', 'neha.gupta@acme.in')).toBe('Neha Gupta');
    expect(nameBeforeEmail('Talk to me at ', 'priya@acme.in')).toBeNull();
    expect(nameBeforeEmail('Contact Rahul: ', 'priya@acme.in')).toBeNull();
    expect(nameBeforeEmail('send your resume to ', 'priya@acme.in')).toBeNull();
    expect(nameBeforeEmail('Email Us: ', 'hello@acme.in')).toBeNull();
  });
});

describe('contactsFromText', () => {
  it('does not take a role being hired for as the poster title', () => {
    const [c] = contactsFromText({ ...base, text: "We're hiring a Tech Lead, email jane@acme.in to apply." });
    expect(c).toMatchObject({ email: 'jane@acme.in', contactKind: 'employee', roleTitle: null, companyDomain: 'acme.in' });
  });

  it('keeps titles beside the address and skips job-board domains', () => {
    const found = contactsFromText({ ...base, text: 'Ravi Kumar, Head of Engineering - ravi@acme.in\nOr apply at jobs@greenhouse.io' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: 'Ravi Kumar', contactKind: 'hiring_manager', roleTitle: 'Head of engineering' });
  });

  it('keeps only same-domain addresses for company pages and marks role inboxes', () => {
    const found = contactsFromText({ ...base, source: 'company_page', text: 'careers@acme.in or ping friend@gmail.com, partner@other.io', sameDomainAs: 'acme.in' });
    expect(found.map((c) => [c.email, c.contactKind, c.addressType])).toEqual([['careers@acme.in', 'team_inbox', 'role']]);
  });

  it('leaves the company domain empty for free mail', () => {
    const [c] = contactsFromText({ ...base, text: 'Write to founder.acme@gmail.com' });
    expect(c.companyDomain).toBeNull();
  });
});

describe('hosts', () => {
  it('knows job boards and ATS hosts', () => {
    expect(isJobBoardHost('boards.greenhouse.io')).toBe(true);
    expect(isJobBoardHost('jobs.lever.co')).toBe(true);
    expect(isJobBoardHost('www.linkedin.com')).toBe(true);
    expect(isJobBoardHost('careers.acme.in')).toBe(false);
  });
});

describe('parsePostHeader', () => {
  it('splits company, roles, places and drops salary/type parts', () => {
    const h = parsePostHeader(
      'Acme (<a href="https:&#x2F;&#x2F;acme.in" rel="nofollow">acme.in</a>) | Backend Engineer, Frontend Engineer | Bengaluru, India | Full-time | ₹30-45 LPA<p>We build payments.'
    );
    expect(h).toMatchObject({
      company: 'Acme',
      companyUrl: 'https://acme.in',
      hiringFor: 'Backend Engineer, Frontend Engineer',
      location: 'Bengaluru, India',
      remote: false,
    });
  });

  it('notes remote, falls back to other separators and refuses plain prose', () => {
    expect(parsePostHeader('Beta Labs - Senior SRE - REMOTE<p>x')).toMatchObject({ company: 'Beta Labs', hiringFor: 'Senior SRE', location: 'REMOTE', remote: true });
    expect(parsePostHeader('We are a small team building tools.<p>x')).toBeNull();
  });
});

describe('contactsFromPost', () => {
  const post = (body: string) => ({ id: 42, created_at: '2026-10-01T10:00:00Z', text: body });

  it('builds contacts from an India-open post', () => {
    const r = contactsFromPost(
      post('Acme | ML Engineer | Remote (India)<p>Hi, I am Priya Sharma (CTO). Email priya [at] acme [dot] in. Apply: <a href="https:&#x2F;&#x2F;acme.in&#x2F;careers">careers</a>'),
      'india'
    );
    expect(r.outOfRegion).toBe(false);
    expect(r.contacts).toHaveLength(1);
    const parsed = parseContact(r.contacts[0]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.contact).toMatchObject({
      email: 'priya@acme.in',
      company: 'Acme',
      companyDomain: 'acme.in',
      hiringFor: 'ML Engineer',
      remote: true,
      source: 'hn_whos_hiring',
      sourceUrl: 'https://news.ycombinator.com/item?id=42',
      jobUrl: 'https://acme.in/careers',
      postedAt: '2026-10-01T10:00:00.000Z',
    });
    expect(parsed.contact.sourceSnippet).toContain('Acme | ML Engineer | Remote (India)');
  });

  it('skips posts not open to India unless the text mentions India', () => {
    expect(contactsFromPost(post('Gamma | SWE | Remote (US only)<p>jane@gamma.io'), 'india')).toMatchObject({ outOfRegion: true, contacts: [] });
    expect(contactsFromPost(post('Gamma | SWE | Remote (US only)<p>jane@gamma.io'), 'all').contacts).toHaveLength(1);
    expect(contactsFromPost(post('Delta | SWE | London<p>We also hire in Pune. raj@delta.io'), 'india').contacts).toHaveLength(1);
  });
});

describe('scrapeHnContacts', () => {
  it('reads the latest threads through Algolia', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('search_by_date')) {
        return json({
          hits: [
            { objectID: '300', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01T15:00:00Z' },
            { objectID: '301', title: 'Ask HN: Who wants to be hired? (October 2026)', created_at: '2026-10-01T15:00:00Z' },
            { objectID: '200', title: 'Ask HN: Who is hiring? (September 2026)', created_at: '2026-09-01T15:00:00Z' },
          ],
        });
      }
      if (url.endsWith('/items/300')) {
        return json({
          children: [
            { id: 1, created_at: '2026-10-01T16:00:00Z', text: 'Acme | SWE | Bengaluru<p>Email jane@acme.in' },
            { id: 2, created_at: '2026-10-01T16:00:00Z', text: 'Zeta | SWE | NYC<p>bob@zeta.io' },
            { id: 3, text: null },
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const r = await scrapeHnContacts({ fetchImpl, months: 1 });
    expect(r.threads.map((t) => t.id)).toEqual(['300']);
    expect(r.posts).toBe(2);
    expect(r.outOfRegion).toBe(1);
    expect(r.contacts.map((c) => c.email)).toEqual(['jane@acme.in']);
  });
});

describe('contactsFromJobs', () => {
  const job = (over: Partial<JobDescriptionRow>): JobDescriptionRow => ({
    id: 1,
    title: 'Data Analyst Intern',
    company: 'Acme',
    location: 'Pune',
    remote: false,
    description: 'Send your CV to hiring.team@acme.in or to Neha Gupta (HR) at neha.gupta@acme.in.',
    apply_url: 'https://acme.in/jobs/1',
    canonical_url: 'https://acme.in/jobs/1',
    posted_at: '2026-10-02T00:00:00Z',
    ...over,
  });

  it('uses the job for company, role and place', () => {
    const r = contactsFromJobs([job({}), job({ id: 2, description: 'No contact here' }), job({ id: 3, location: 'Berlin' })], 'india');
    expect(r.jobsRead).toBe(3);
    expect(r.outOfRegion).toBe(1);
    expect(r.contacts.map((c) => [c.email, c.contactKind, c.name])).toEqual([
      ['hiring.team@acme.in', 'team_inbox', null],
      ['neha.gupta@acme.in', 'recruiter', 'Neha Gupta'],
    ]);
    expect(r.contacts[1]).toMatchObject({ hiringFor: 'Data Analyst Intern', location: 'Pune', jobUrl: 'https://acme.in/jobs/1', source: 'job_description' });
  });
});

describe('robots', () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/careers
Disallow: /*.pdf$

User-agent: BadBot
Disallow: /
`);

  it('applies the longest match, Allow on ties, wildcards and end anchors', () => {
    expect(isAllowed(robots, '/careers')).toBe(true);
    expect(isAllowed(robots, '/private/team')).toBe(false);
    expect(isAllowed(robots, '/private/careers')).toBe(true);
    expect(isAllowed(robots, '/files/jd.pdf')).toBe(false);
    expect(isAllowed(robots, '/files/jd.pdf?x=1')).toBe(true);
  });

  it('uses our own group when present', () => {
    const r = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: NomadicContactBot\nDisallow: /\n');
    expect(isAllowed(r, '/careers')).toBe(false);
  });

  it('allows on 404 and refuses on 401/403/5xx', () => {
    expect(isAllowed(robotsFromResponse(404, ''), '/x')).toBe(true);
    expect(isAllowed(robotsFromResponse(403, ''), '/x')).toBe(false);
    expect(isAllowed(robotsFromResponse(503, ''), '/x')).toBe(false);
  });
});

describe('company pages', () => {
  it('picks one own-site page per company and skips job boards', () => {
    const jobs = [
      { id: 1, title: 'SWE', company: 'Acme', location: 'Pune', remote: false, description: '', apply_url: 'https://acme.in/careers/swe', canonical_url: null, posted_at: null },
      { id: 2, title: 'SWE 2', company: 'Acme', location: 'Pune', remote: false, description: '', apply_url: 'https://www.acme.in/careers/swe2', canonical_url: null, posted_at: null },
      { id: 3, title: 'SWE', company: 'Beta', location: 'Pune', remote: false, description: '', apply_url: 'https://boards.greenhouse.io/beta/1', canonical_url: null, posted_at: null },
      { id: 4, title: 'SWE', company: 'Far', location: 'Paris', remote: false, description: '', apply_url: 'https://far.fr/jobs', canonical_url: null, posted_at: null },
    ];
    expect(pageSeeds(jobs, [{ company: 'Gamma', url: 'https://gamma.io' }], 'india')).toEqual([
      { url: 'https://acme.in/careers/swe', company: 'Acme' },
      { url: 'https://gamma.io', company: 'Gamma' },
    ]);
  });

  it('finds same-site careers and contact links', () => {
    const links = careerLinks(
      '<a href="/careers">Jobs</a><a href="https://blog.acme.in/post">Blog</a><a href="https://other.io/careers">x</a><a href="/about">Meet the team</a><a href="mailto:a@acme.in">mail</a>',
      'https://acme.in/',
      5
    );
    expect(links).toEqual(['https://acme.in/careers', 'https://acme.in/about']);
  });

  it('obeys robots, keeps same-domain addresses and ignores redirects to an ATS', async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      requested.push(url);
      switch (url) {
        case 'https://acme.in/robots.txt':
          return text('User-agent: *\nDisallow: /contact\n');
        case 'https://acme.in/':
          return html('<a href="/careers">Careers</a><a href="/contact">Contact</a> Write to hello@acme.in', 'https://acme.in/');
        case 'https://acme.in/careers':
          return html('Talent team: talent@acme.in. Our partner: hr@agency.io', 'https://acme.in/careers');
        case 'https://beta.io/robots.txt':
          return text('', 404);
        case 'https://beta.io/jobs':
          return html('jobs@greenhouse.io apply', 'https://boards.greenhouse.io/beta');
        default:
          throw new Error(`unexpected ${url}`);
      }
    });
    const r = await scrapeCompanyPages(
      [
        { url: 'https://acme.in/', company: 'Acme' },
        { url: 'https://beta.io/jobs', company: 'Beta' },
      ],
      { fetchImpl, sleep: async () => undefined, concurrency: 1 }
    );
    expect(requested).not.toContain('https://acme.in/contact');
    expect(r.blockedByRobots).toBe(1);
    expect(r.pagesFetched).toBe(2);
    expect(r.contacts.map((c) => [c.email, c.source, c.companyDomain])).toEqual([
      ['hello@acme.in', 'company_page', 'acme.in'],
      ['talent@acme.in', 'company_page', 'acme.in'],
    ]);
  });

  it('stops at the page budget and skips hosts whose robots.txt cannot be read', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://a.in/robots.txt') return text('', 404);
      if (url === 'https://b.in/robots.txt') return text('', 500);
      return html('x@a.in <a href="/careers">c</a> <a href="/jobs">j</a>', url);
    });
    const r = await scrapeCompanyPages(
      [
        { url: 'https://b.in/', company: 'B' },
        { url: 'https://a.in/', company: 'A' },
      ],
      { fetchImpl, sleep: async () => undefined, concurrency: 1, maxPages: 2 }
    );
    expect(r.blockedByRobots).toBe(1);
    expect(r.pagesFetched).toBe(2);
  });
});

const contact = (over: Partial<Contact>): Contact => ({
  email: 'jane@acme.in',
  name: null,
  company: 'Acme',
  companyDomain: 'acme.in',
  roleTitle: null,
  hiringFor: null,
  contactKind: 'employee',
  addressType: 'personal',
  source: 'hn_whos_hiring',
  sourceUrl: 'https://news.ycombinator.com/item?id=1',
  sourceSnippet: 'x',
  jobUrl: null,
  location: null,
  remote: false,
  postedAt: null,
  mxOk: null,
  ...over,
});

describe('mergeDuplicates', () => {
  it('keeps the richer row for the same address', () => {
    const { unique, duplicates } = mergeDuplicates([contact({}), contact({ name: 'Jane', source: 'company_page' }), contact({ email: 'raj@acme.in' })]);
    expect(duplicates).toBe(1);
    expect(unique.find((c) => c.email === 'jane@acme.in')?.name).toBe('Jane');
  });
});

describe('runContactScrape', () => {
  const jobs: JobDescriptionRow[] = [
    { id: 1, title: 'SWE', company: 'Acme', location: 'Pune', remote: false, description: 'Mail jane@acme.in or ops@nomail.in', apply_url: 'https://boards.greenhouse.io/acme/1', canonical_url: null, posted_at: null },
    { id: 2, title: 'SWE', company: 'Acme', location: 'Pune', remote: false, description: 'Contact Gone Person: gone@acme.in', apply_url: 'https://boards.greenhouse.io/acme/2', canonical_url: null, posted_at: null },
  ];
  const resolveMx = async (domain: string) => {
    if (domain === 'nomail.in') throw Object.assign(new Error('x'), { code: 'ENOTFOUND' });
    return [{ exchange: `mx.${domain}`, priority: 1 }];
  };

  it('validates, checks mail servers, honours opt-outs and publishes', async () => {
    const store = new MemoryContactStore();
    store.suppressed.add(emailHash('Gone@acme.in'));
    const clock = () => new Date('2026-10-04T00:00:00Z');
    await store.upsert([{ ...(await import('../contacts/store.ts')).toContactRow(contact({ email: 'old@acme.in' }), '2026-01-01T00:00:00.000Z') }]);
    const report = await runContactScrape({
      sources: ['jobs'],
      region: 'india',
      publish: true,
      store,
      readJobs: async () => jobs,
      mx: { resolveMx },
      clock,
    });
    expect(report.totals).toMatchObject({ found: 3, noMailServer: 1, suppressed: 1, kept: 1, upserted: 1, expired: 1 });
    expect(store.rows.get('jane@acme.in')).toMatchObject({ is_active: true, mx_ok: true, source: 'job_description' });
    expect(store.rows.get('old@acme.in')?.is_active).toBe(false);
    expect(store.rows.has('gone@acme.in')).toBe(false);
    expect(formatContactSummary(report)).toContain('Kept 1 contacts');
  });

  it('dry runs write nothing and a failing source does not hide old rows', async () => {
    const report = await runContactScrape({
      sources: ['jobs', 'hn'],
      region: 'india',
      publish: false,
      readJobs: async () => jobs,
      fetchImpl: async () => {
        throw new Error('offline');
      },
      mx: { resolveMx },
    });
    expect(report.published).toBe(false);
    expect(report.sources.find((s) => s.source === 'hn')).toMatchObject({ ok: false, error: 'offline' });
    expect(report.totals.kept).toBe(2);
    expect(formatContactSummary(report)).toContain('Dry run');
  });
});
