import { cleanText, decodeEntities } from '../pipeline/normalize.js';
import { mentionsIndia } from '../pipeline/region.js';
import type { PoliteFetcher } from './http.js';
import type { HackathonCandidate, HackathonMode, HackathonSource } from './schema.js';

/**
 * Hackathon listings: Devfolio, Unstop, Devpost and HackerEarth, read from the JSON their own listing pages
 * load. Only open or upcoming events are asked for. Fields the listing does not give stay null.
 * MLH is not read directly: its events are listed on Devpost/Devfolio, and its season page has no stable feed.
 */

export interface HackathonContext {
  http: PoliteFetcher;
  maxPages: number;
  now: Date;
}

export interface HackathonResult {
  hackathons: HackathonCandidate[];
  truncated: boolean;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    const ms = n < 1e12 ? n * 1000 : n;
    return Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) ? new Date(ms).toISOString() : null;
  }
  let s = String(value).trim();
  // "2026-10-10 04:30:00" (HackerEarth, UTC) → ISO.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) ? new Date(ms).toISOString() : null;
}

/**
 * Devpost's "submission_period_dates": "Oct 01 - Nov 15, 2026", "Oct 14 - 15, 2026",
 * "Dec 28, 2026 - Jan 05, 2027". The start is the first day, the end the last day (end of day, UTC).
 */
export function parseDevpostDates(text: unknown): { startsAt: string | null; endsAt: string | null } {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  const none = { startsAt: null, endsAt: null };
  const m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2})(?:, (\d{4}))? - (?:([A-Za-z]{3})[a-z]* )?(\d{1,2}), (\d{4})$/);
  if (!m) return none;
  const [, m1, d1, y1, m2, d2, y2] = m;
  const startMonth = MONTHS[m1.toLowerCase()];
  const endMonth = m2 ? MONTHS[m2.toLowerCase()] : startMonth;
  if (startMonth === undefined || endMonth === undefined) return none;
  const endYear = Number(y2);
  const startYear = y1 ? Number(y1) : startMonth > endMonth ? endYear - 1 : endYear;
  return {
    startsAt: new Date(Date.UTC(startYear, startMonth, Number(d1))).toISOString(),
    endsAt: new Date(Date.UTC(endYear, endMonth, Number(d2), 23, 59, 59)).toISOString(),
  };
}

function place(location: string): { city: string | null; country: string | null; inIndia: boolean } {
  const parts = location
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || /^online$/i.test(location.trim())) return { city: null, country: null, inIndia: false };
  return {
    city: parts.length > 1 ? parts[0] : null,
    country: parts.length > 1 ? parts[parts.length - 1] : null,
    inIndia: mentionsIndia(location),
  };
}

const themesFrom = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((t: any) => cleanText(typeof t === 'string' ? t : t?.name, 80))
    .filter(Boolean)
    .slice(0, 12);

// ── Devfolio ─────────────────────────────────────────────────────────────────

export function normalizeDevfolio(hit: any): HackathonCandidate | null {
  const h = hit?._source ?? hit;
  const slug = typeof h?.slug === 'string' ? h.slug : '';
  const title = cleanText(h?.name);
  if (!slug || !title) return null;
  const online = h?.is_online === true;
  const location = cleanText([h?.city, h?.state, h?.country].filter(Boolean).join(', ') || h?.location);
  const p = place(location);
  const mode: HackathonMode = h?.is_online === true ? 'online' : h?.is_online === false ? 'in_person' : 'unknown';
  return {
    source: 'devfolio',
    sourceId: slug,
    title,
    organiser: cleanText(h?.organization?.name ?? h?.hackathon_setting?.organizer_name) || null,
    url: `https://${slug}.devfolio.co/`,
    mode,
    city: online ? null : p.city ?? (h?.city ? cleanText(h.city) : null),
    country: online ? null : p.country ?? (h?.country ? cleanText(h.country) : null),
    inIndia: !online && (p.inIndia || /india/i.test(String(h?.country ?? ''))),
    startsAt: isoOrNull(h?.starts_at),
    endsAt: isoOrNull(h?.ends_at),
    registrationEndsAt: isoOrNull(h?.hackathon_setting?.reg_ends_at ?? h?.reg_ends_at),
    themes: themesFrom(h?.themes),
    prizeText: null,
  };
}

async function devfolio(ctx: HackathonContext): Promise<HackathonResult> {
  const PAGE = 50;
  const out: HackathonCandidate[] = [];
  for (const type of ['application_open', 'upcoming']) {
    for (let page = 0; page < ctx.maxPages; page++) {
      const data = await ctx.http.json('https://api.devfolio.co/api/search/hackathons', {
        method: 'POST',
        body: { type, from: page * PAGE, size: PAGE },
      });
      const hits: any[] = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
      for (const hit of hits) {
        const h = normalizeDevfolio(hit);
        if (h) out.push(h);
      }
      if (hits.length < PAGE) break;
      if (page === ctx.maxPages - 1) return { hackathons: out, truncated: true };
    }
  }
  return { hackathons: out, truncated: false };
}

// ── Unstop ───────────────────────────────────────────────────────────────────

export function normalizeUnstop(item: any): HackathonCandidate | null {
  const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
  const title = cleanText(item?.title);
  const path = typeof item?.public_url === 'string' ? item.public_url.replace(/^\/+/, '') : '';
  if (!id || !title || !path) return null;
  const region = String(item?.region ?? '').toLowerCase();
  const mode: HackathonMode = region === 'online' ? 'online' : region === 'offline' ? 'in_person' : region === 'hybrid' ? 'hybrid' : 'unknown';
  const addr = item?.address_with_country_logo ?? {};
  const city = cleanText(addr?.city) || null;
  const country = cleanText(addr?.country?.name ?? addr?.country) || null;
  return {
    source: 'unstop',
    sourceId: id,
    title,
    organiser: cleanText(item?.organisation?.name) || null,
    url: path.startsWith('http') ? path : `https://unstop.com/${path}`,
    mode,
    city: mode === 'online' ? null : city,
    country: mode === 'online' ? null : country,
    inIndia: mode !== 'online' && (/india/i.test(country ?? '') || (city ? mentionsIndia(city) : false)),
    startsAt: isoOrNull(item?.start_date),
    endsAt: isoOrNull(item?.end_date),
    registrationEndsAt: isoOrNull(item?.regnRequirements?.end_regn_dt),
    themes: themesFrom((Array.isArray(item?.filters) ? item.filters : []).filter((f: any) => f?.type !== 'eligible')),
    prizeText: null,
  };
}

async function unstop(ctx: HackathonContext): Promise<HackathonResult> {
  const PAGE = 30;
  const out: HackathonCandidate[] = [];
  for (let page = 1; page <= ctx.maxPages; page++) {
    const data = await ctx.http.json(
      `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&per_page=${PAGE}&page=${page}`
    );
    const body = data?.data ?? {};
    const items: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const item of items) {
      const h = normalizeUnstop(item);
      if (h) out.push(h);
    }
    const last = typeof body?.last_page === 'number' ? body.last_page : null;
    if (items.length < PAGE || (last !== null && page >= last)) return { hackathons: out, truncated: false };
  }
  return { hackathons: out, truncated: true };
}

// ── Devpost ──────────────────────────────────────────────────────────────────

export function normalizeDevpost(item: any): HackathonCandidate | null {
  const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
  const title = cleanText(item?.title);
  const url = typeof item?.url === 'string' ? item.url : '';
  if (!id || !title || !url) return null;
  const loc = item?.displayed_location ?? {};
  const location = cleanText(loc?.location);
  const online = loc?.icon === 'globe' || /^online$/i.test(location);
  const p = place(location);
  const { startsAt, endsAt } = parseDevpostDates(item?.submission_period_dates);
  // "$<span data-currency-value>10,000</span>": drop the tags without adding spaces.
  const prize = cleanText(decodeEntities(String(item?.prize_amount ?? '').replace(/<[^>]*>/g, '')), 200);
  return {
    source: 'devpost',
    sourceId: id,
    title,
    organiser: cleanText(item?.organization_name) || null,
    url,
    mode: online ? 'online' : location ? 'in_person' : 'unknown',
    city: online ? null : p.city,
    country: online ? null : p.country,
    inIndia: !online && p.inIndia,
    startsAt,
    endsAt,
    // Devpost's listing gives the submission deadline, not a registration deadline.
    registrationEndsAt: null,
    themes: themesFrom(item?.themes),
    prizeText: prize && /\d/.test(prize) ? `${prize} in prizes` : null,
  };
}

async function devpost(ctx: HackathonContext): Promise<HackathonResult> {
  const out: HackathonCandidate[] = [];
  for (let page = 1; page <= ctx.maxPages; page++) {
    const data = await ctx.http.json(`https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=${page}`);
    const items: any[] = Array.isArray(data?.hackathons) ? data.hackathons : [];
    for (const item of items) {
      const h = normalizeDevpost(item);
      if (h) out.push(h);
    }
    const perPage = Number(data?.meta?.per_page) || 9;
    const total = Number(data?.meta?.total_count);
    if (items.length < perPage || (Number.isFinite(total) && page * perPage >= total)) return { hackathons: out, truncated: false };
  }
  return { hackathons: out, truncated: true };
}

// ── HackerEarth ──────────────────────────────────────────────────────────────

export function normalizeHackerEarth(item: any): HackathonCandidate | null {
  if (String(item?.challenge_type ?? '').toLowerCase() !== 'hackathon') return null;
  const url = typeof item?.url === 'string' ? item.url : '';
  const title = cleanText(item?.title);
  if (!url || !title) return null;
  return {
    source: 'hackerearth',
    sourceId: url.replace(/^https?:\/\/(www\.)?hackerearth\.com/, '').replace(/\/+$/, '') || url,
    title,
    organiser: null,
    url,
    // HackerEarth hackathons run online.
    mode: 'online',
    city: null,
    country: null,
    inIndia: false,
    startsAt: isoOrNull(item?.start_utc_tstamp),
    endsAt: isoOrNull(item?.end_utc_tstamp),
    registrationEndsAt: null,
    themes: [],
    prizeText: null,
  };
}

async function hackerEarth(ctx: HackathonContext): Promise<HackathonResult> {
  const data = await ctx.http.json('https://www.hackerearth.com/chrome-extension/events/');
  const items: any[] = Array.isArray(data?.response) ? data.response : [];
  const out: HackathonCandidate[] = [];
  for (const item of items) {
    if (!/upcoming|ongoing/i.test(String(item?.status ?? ''))) continue;
    const h = normalizeHackerEarth(item);
    if (h) out.push(h);
  }
  return { hackathons: out, truncated: false };
}

export const HACKATHON_FETCHERS: Record<HackathonSource, (ctx: HackathonContext) => Promise<HackathonResult>> = {
  devfolio,
  unstop,
  devpost,
  hackerearth: hackerEarth,
};

/** Same event listed on two sites: same title (letters and digits) starting the same day. */
export function hackathonKey(h: { title: string; startsAt: string | null }): string {
  return `${h.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}|${h.startsAt?.slice(0, 10) ?? ''}`;
}
