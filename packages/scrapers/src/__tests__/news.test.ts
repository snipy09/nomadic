import { describe, expect, it } from 'vitest';
import { eventsFromHtml, mlhSeason, normalizeCodeforces, pageEventToHackathon } from '../feed/hackathons.js';
import { parseHackathon } from '../feed/schema.js';
import { cities, classifyArticle, headcount, matchCompany, period, roles } from '../news/extract.js';
import { NEWS_FEEDS } from '../news/feeds.js';
import { articleFacts, articleFrom, formatNewsSummary, runNewsScrape } from '../news/run.js';
import { parseFeed } from '../news/rss.js';
import { MemoryNewsStore } from '../news/store.js';

const NOW = new Date('2026-10-07T06:00:00Z');
const feed = { id: 'et-jobs', name: 'Economic Times', url: 'https://economictimes.indiatimes.com/jobs/rssfeeds/107115.cms' };

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>
<item><title><![CDATA[Google to hire 1,200 freshers from September to December for SDE and data roles]]></title>
<link>https://economictimes.indiatimes.com/jobs/google-hiring/articleshow/1.cms</link>
<pubDate>Mon, 05 Oct 2026 09:00:00 +0530</pubDate>
<description><![CDATA[<p>The roles are in Bengaluru and Hyderabad.</p>]]></description></item>
<item><title>Sensex ends higher on IT gains</title><link>https://economictimes.indiatimes.com/markets/2.cms</link><pubDate>Mon, 05 Oct 2026 10:00:00 +0530</pubDate></item>
<item><title>TCS plans campus hiring of 40,000 in FY27</title><link>https://economictimes.indiatimes.com/jobs/3.cms</link><pubDate>Sun, 04 Oct 2026 10:00:00 +0530</pubDate></item>
<item><title>Old story: Infosys hires 500</title><link>https://economictimes.indiatimes.com/jobs/4.cms</link><pubDate>Mon, 01 Jun 2026 10:00:00 +0530</pubDate></item>
<item><title>Unknown startup raises $5 million in seed round</title><link>https://economictimes.indiatimes.com/tech/5.cms</link><pubDate>Mon, 05 Oct 2026 10:00:00 +0530</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Razorpay lays off 70 employees</title>
<link rel="alternate" href="https://example.in/a?x=1&amp;y=2"/><link rel="enclosure" href="https://example.in/img.jpg"/>
<updated>2026-10-06T08:00:00Z</updated><summary>Cuts in support teams.</summary></entry></feed>`;

describe('feed parsing', () => {
  it('reads RSS items with CDATA and Atom entries with alternate links', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      title: 'Google to hire 1,200 freshers from September to December for SDE and data roles',
      link: 'https://economictimes.indiatimes.com/jobs/google-hiring/articleshow/1.cms',
      publishedAt: '2026-10-05T03:30:00.000Z',
      summary: 'The roles are in Bengaluru and Hyderabad.',
    });
    expect(parseFeed(ATOM)[0]).toMatchObject({ title: 'Razorpay lays off 70 employees', link: 'https://example.in/a?x=1&y=2' });
    expect(parseFeed('<html>not a feed</html>')).toEqual([]);
  });
});

describe('reading facts', () => {
  it('sorts articles into topics and ignores the rest', () => {
    expect(classifyArticle('Google to hire 1,200 freshers', '')).toBe('hiring');
    expect(classifyArticle('TCS NQT 2026 registration opens', '')).toBe('campus');
    expect(classifyArticle('Ola Electric lays off 500', '')).toBe('layoffs');
    expect(classifyArticle('Zepto raises $350 million', '')).toBe('funding');
    expect(classifyArticle('JPMorgan opens new tech centre in Hyderabad', '')).toBe('expansion');
    expect(classifyArticle('Sensex ends higher on IT gains', 'Markets rallied.')).toBeNull();
  });

  it('drops public-sector recruitment, executive moves and deals that only mention staff', () => {
    expect(classifyArticle('Punjab, Haryana police recruitment 2026: 1,700 constable posts', '')).toBeNull();
    expect(classifyArticle('FSSAI recruitment 2026: apply for 200 posts', '')).toBeNull();
    expect(classifyArticle('OpenAI poaches SpaceX sales lead to run enterprise push', 'OpenAI hires a senior executive.')).toBeNull();
    expect(classifyArticle('OpenAI hires former SpaceX executive as sales chief', '')).toBeNull();
    expect(
      classifyArticle('Accenture to sell its China business to local buyer', 'The buyer will hire all 3,000 employees of the unit.')
    ).toBeNull();
    expect(classifyArticle('Infosys hires 2,000 engineers for its Pune centre', '')).toBe('hiring');
    expect(classifyArticle('Acme opens Pune office', 'The company plans to hire 500 engineers there.')).toBe('hiring');
    expect(classifyArticle('Acme opens Pune office', 'Its staff were hiring cabs all week.')).toBeNull();
  });

  it('finds the company, preferring the longest known name and skipping look-alikes', () => {
    expect(matchCompany('Google to hire 1,200 freshers', '')).toEqual({ slug: 'google', name: 'Google' });
    expect(matchCompany('Ola Electric lays off 500 staff', '')).toEqual({ slug: 'ola-electric', name: 'Ola Electric' });
    expect(matchCompany('Eternal plans 2,000 hires for Blinkit', '')?.slug).toBe('zomato');
    expect(matchCompany('US tightens H-1B visa rules; hiring of Indian techies hit', '')?.slug).not.toBe('visa');
    expect(matchCompany('Target to hire 500 in Bengaluru', '')?.slug).toBe('target');
    expect(matchCompany('Companies target hiring of 500 freshers', '')).toBeNull();
    // Not in the directory: the headline's subject, with no slug.
    expect(matchCompany('Acme Robotics to hire 300 engineers', '')).toEqual({ slug: null, name: 'Acme Robotics' });
    expect(matchCompany('IT firms to hire 2 lakh freshers', '')).toBeNull();
    expect(matchCompany('Festive hiring to rise 20% this year', '')).toBeNull();
    expect(matchCompany('Gig hiring jumps in metros', '')).toBeNull();
    expect(matchCompany('IIT bars firm from campus placements for revoking offers', 'Oracle and others recruited there.')).toBeNull();
    expect(matchCompany('Placement season opens', 'Google, Microsoft and Oracle are among recruiters.')).toBeNull();
    expect(matchCompany('Tech giant to hire 500 in Hyderabad', 'Oracle will add the roles at its campus.')?.slug).toBe('oracle');
  });

  it('reads headcount as written and skips batch years and money', () => {
    expect(headcount('Google to hire 1,200 freshers')).toBe('1,200 freshers');
    expect(headcount('Infosys to add over 20,000 employees')).toBe('over 20,000 employees');
    expect(headcount('Sector to create 2 lakh jobs')).toBe('2 lakh jobs');
    expect(headcount('Hiring 2026 graduates this year')).toBeNull();
    expect(headcount('Raises ₹500 crore')).toBeNull();
  });

  it('reads roles named in the text', () => {
    expect(roles('to hire 1,200 freshers for SDE and data scientist roles')).toEqual(['Freshers', 'Software engineers', 'Data scientists']);
    expect(roles('plans to hire engineers')).toEqual(['Engineers']);
  });

  it('reads hiring periods and dates only when the text pins them', () => {
    expect(period('from September to December', NOW)).toEqual({ text: 'from September to December', startsOn: '2026-09-01', endsOn: '2026-12-31' });
    expect(period('Sept–Dec 2026', NOW)).toEqual({ text: 'Sept–Dec 2026', startsOn: '2026-09-01', endsOn: '2026-12-31' });
    expect(period('between November and February', NOW)).toEqual({ text: 'between November and February', startsOn: '2026-11-01', endsOn: '2027-02-28' });
    expect(period('January to March', NOW)?.startsOn).toBe('2027-01-01');
    expect(period('campus hiring of 40,000 in FY27', NOW)).toEqual({ text: 'FY27', startsOn: '2026-04-01', endsOn: '2027-03-31' });
    expect(period('hire 5,000 by March 2027', NOW)).toEqual({ text: 'by March 2027', startsOn: null, endsOn: '2027-03-31' });
    expect(period('hiring this quarter', NOW)).toEqual({ text: 'this quarter', startsOn: null, endsOn: null });
    expect(period('hiring soon', NOW)).toBeNull();
  });

  it('lists Indian cities by their current names', () => {
    expect(cities('roles in Bangalore, Gurgaon and Hyderabad')).toEqual(['Bengaluru', 'Hyderabad', 'Delhi NCR']);
  });

  it('builds an article with every fact from the text, and drops company news about unknown companies', () => {
    const a = articleFrom(feed, parseFeed(RSS)[0], NOW)!;
    expect(a).toMatchObject({
      kind: 'hiring',
      companySlug: 'google',
      headcountText: '1,200 freshers',
      periodText: 'from September to December',
      startsOn: '2026-09-01',
      endsOn: '2026-12-31',
      locations: ['Bengaluru', 'Hyderabad'],
    });
    expect(articleFacts(a)).toBe('from September to December · 1,200 freshers · Freshers, Software engineers · Bengaluru, Hyderabad');
    expect(articleFrom(feed, parseFeed(RSS)[4], NOW)).toBeNull();
  });
});

describe('news run', () => {
  it('keeps recent on-topic articles once, reports failing feeds, and publishes', async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      if (url === feed.url) return new Response(RSS, { status: 200 });
      if (url === 'https://example.in/feed') return new Response(RSS, { status: 200 });
      return new Response('nope', { status: 500 });
    };
    const store = new MemoryNewsStore();
    const report = await runNewsScrape({
      publish: true,
      store,
      feeds: [feed, { id: 'copy', name: 'Copy', url: 'https://example.in/feed' }, { id: 'down', name: 'Down', url: 'https://down.example/rss' }],
      fetchImpl,
      sleep: async () => undefined,
      clock: () => NOW,
    });
    expect(report.articles.map((a) => a.companySlug)).toEqual(['google', 'tcs']);
    expect(report.duplicates).toBe(2);
    expect(report.feeds.find((f) => f.id === 'down')).toMatchObject({ ok: false, error: 'HTTP 500' });
    expect(report.feeds.find((f) => f.id === 'et-jobs')).toMatchObject({ tooOld: 1, kept: 2 });
    expect(store.rows.size).toBe(2);
    expect(formatNewsSummary(report)).toContain('Google to hire 1,200 freshers');
  });

  it('flags a feed whose items are all older than the window as stale', async () => {
    const old = `<rss><channel><item><title>Infosys hires 500</title><link>https://old.example/1</link><pubDate>Mon, 01 Jun 2026 10:00:00 +0530</pubDate></item>
<item><title>TCS hires 900</title><link>https://old.example/2</link><pubDate>Tue, 02 Jun 2026 10:00:00 +0530</pubDate></item></channel></rss>`;
    const report = await runNewsScrape({
      publish: false,
      feeds: [{ id: 'old', name: 'Old', url: 'https://old.example/rss' }],
      fetchImpl: async (url: string) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response(old, { status: 200 })),
      sleep: async () => undefined,
      clock: () => NOW,
    });
    expect(report.feeds[0]).toMatchObject({ ok: true, kept: 0, tooOld: 2, staleSince: '2026-06-02' });
    expect(formatNewsSummary(report)).toContain('STALE (newest 2026-06-02)');
  });

  it('has unique feed ids', () => {
    const ids = NEWS_FEEDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Events added with the scraper folder: Codeforces contests, MLH and Hack2skill pages ──────────────────────────

describe('more event sources', () => {
  it('keeps Codeforces contests that start within 30 days, as online contests', () => {
    const start = Math.floor(NOW.getTime() / 1000) + 3 * 86_400;
    const c = normalizeCodeforces({ id: 2150, name: 'Codeforces Round 1050 (Div. 2)', phase: 'BEFORE', startTimeSeconds: start, durationSeconds: 7200 }, NOW)!;
    expect(c).toMatchObject({ source: 'codeforces', kind: 'contest', mode: 'online', url: 'https://codeforces.com/contests/2150', organiser: 'Codeforces' });
    expect(Date.parse(c.endsAt!) - Date.parse(c.startsAt!)).toBe(7_200_000);
    expect(parseHackathon(c).ok).toBe(true);
    expect(normalizeCodeforces({ id: 1, name: 'Old', phase: 'FINISHED', startTimeSeconds: start }, NOW)).toBeNull();
    expect(normalizeCodeforces({ id: 2, name: 'Far', phase: 'BEFORE', startTimeSeconds: start + 60 * 86_400 }, NOW)).toBeNull();
  });

  it('reads JSON-LD events with online or Indian venues', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Event', name: 'HackBLR', url: '/event/hackblr', startDate: '2026-11-14', endDate: '2026-11-15', location: { '@type': 'Place', address: { addressLocality: 'Bengaluru', addressCountry: 'India' } }, organizer: { name: 'Acme' } },
        { '@type': 'Event', name: 'Global Hack', url: 'https://x.io/g', startDate: '2026-12-01', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: { '@type': 'VirtualLocation' } },
        { '@type': 'Organization', name: 'Not an event' },
      ],
    })}</script>`;
    const events = eventsFromHtml(html, 'https://hack2skill.com/');
    expect(events.map((e) => e.name)).toEqual(['HackBLR', 'Global Hack']);
    const blr = pageEventToHackathon(events[0], 'hack2skill', 'https://hack2skill.com/')!;
    expect(blr).toMatchObject({ url: 'https://hack2skill.com/event/hackblr', mode: 'in_person', city: 'Bengaluru', inIndia: true, organiser: 'Acme' });
    expect(pageEventToHackathon(events[1], 'hack2skill', 'https://hack2skill.com/')).toMatchObject({ mode: 'online', inIndia: false });
    expect(parseHackathon(blr).ok).toBe(true);
  });

  it('falls back to schema.org microdata (MLH season page)', () => {
    const html = `<div class="event-wrapper"><a class="event-link" href="https://hackx.in/" target="_blank">
      <div class="event" itemscope itemtype="http://schema.org/Event">
        <meta content="HackX" itemprop="name"><meta content="2026-10-24" itemprop="startDate"><meta content="2026-10-25" itemprop="endDate">
        <h3 class="event-name">HackX</h3><div itemprop="location" itemscope itemtype="http://schema.org/Place">
        <span itemprop="city">Delhi</span><span itemprop="state">India</span></div></div></a></div>
      <div class="event-wrapper"><a class="event-link" href="https://remote.dev/"><div itemscope itemtype="http://schema.org/Event">
        <meta content="Remote Jam" itemprop="name"><meta content="2026-11-01" itemprop="startDate"><span>Digital Only</span></div></a></div>`;
    const events = eventsFromHtml(html, 'https://mlh.io/seasons/2027/events');
    expect(events.map((e) => [e.name, e.url, e.place])).toEqual([
      ['HackX', 'https://hackx.in/', 'Delhi, India'],
      ['Remote Jam', 'https://remote.dev/', ''],
    ]);
    expect(pageEventToHackathon(events[0], 'mlh', 'https://mlh.io/')).toMatchObject({ inIndia: true, mode: 'in_person', organiser: 'MLH' });
    expect(pageEventToHackathon(events[1], 'mlh', 'https://mlh.io/')).toMatchObject({ mode: 'online' });
    expect(mlhSeason(NOW)).toBe(2027);
    expect(mlhSeason(new Date('2027-03-01T00:00:00Z'))).toBe(2027);
  });
});
