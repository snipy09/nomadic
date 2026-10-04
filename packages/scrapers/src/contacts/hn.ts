import { baseDomain, decodeEntities, emailDomain, extractEmails, htmlToText, isFreeMailDomain } from '@job-automator/email-verifier';
import { isIndiaEligible, mentionsIndia, type Region } from '../pipeline/region.js';
import type { FetchLike } from '../sources/ats.js';
import { contactsFromText } from './from-text.js';
import { hostOf, isJobBoardHost } from './hosts.js';
import type { ContactCandidate } from './schema.js';

/**
 * Hacker News "Ask HN: Who is hiring?" threads. People who work at the hiring company post
 * one comment each, usually "Company | Role | Location | Remote" and then how to reach them,
 * often with their own work address. These are public and posted to be contacted about jobs.
 * Read through the Algolia HN API (no scraping of news.ycombinator.com pages).
 */

const ALGOLIA = 'https://hn.algolia.com/api/v1';
const HEADERS = { Accept: 'application/json', 'User-Agent': 'NomadicContactBot/1.0 (+https://github.com/snipy09/nomadic)' };
const THREAD_RE = /^Ask HN: Who is hiring\?/i;

export interface HnThread {
  id: string;
  title: string;
  createdAt: string;
}

export interface HnComment {
  id: number | string;
  created_at?: string;
  author?: string | null;
  text?: string | null;
}

/** A company's site named in a post header, for the company-page source. */
export interface HnCompanySite {
  company: string;
  url: string;
}

export interface HnResult {
  contacts: ContactCandidate[];
  /** Posts read (top-level comments with text). */
  posts: number;
  /** Posts skipped because the job is not open to someone in India. */
  outOfRegion: number;
  sites: HnCompanySite[];
  threads: HnThread[];
  warnings: string[];
}

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<any> {
  const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** The latest `months` monthly threads, newest first. */
export async function findHiringThreads(fetchImpl: FetchLike, months: number): Promise<HnThread[]> {
  const data = await getJson(fetchImpl, `${ALGOLIA}/search_by_date?tags=story,author_whoishiring&hitsPerPage=30`, 20000);
  const hits: any[] = Array.isArray(data?.hits) ? data.hits : [];
  return hits
    .filter((h) => typeof h?.title === 'string' && THREAD_RE.test(h.title) && h.objectID)
    .map((h) => ({ id: String(h.objectID), title: h.title as string, createdAt: String(h.created_at ?? '') }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, months));
}

const ROLE_RE =
  /\b(engineers?|engineering|developers?|scientists?|designers?|analysts?|interns?|internships?|sre|devops|managers?|leads?|architects?|researchers?|product|frontend|front-end|backend|back-end|full[- ]?stack|ml|ai|data|mobile|ios|android|qa|sdet|sde|swe|programmers?|founding|staff|principal|senior|junior|graduate|new grad|platform|infrastructure|security|support)\b/i;
const SALARY_RE = /[$€£₹]|\b\d+(?:\.\d+)?\s?k\b|\blpa\b|\bequity\b|\bsalary\b|\bcompensation\b|\bctc\b/i;
const EMPLOYMENT_RE = /^(?:full[- ]?time|part[- ]?time|contract(?:or)?|freelance|permanent|temporary|ft|pt|visa(?: sponsorship)?(?: available| provided)?|no visa(?: sponsorship)?|.*\bvisa\b.*)$/i;
const URL_PART_RE = /^(?:https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?)$/i;
const LOCATION_WORD_RE = /\b(remote|onsite|on-site|hybrid|in[- ]office|wfh|anywhere|worldwide|global|usa?|uk|eu|europe|emea|apac|asia|americas|canada|germany|france|london|berlin|amsterdam|singapore|dubai|tokyo|sydney|toronto|new york|nyc|sf|bay area|san francisco|seattle|boston|austin|chicago|los angeles|la)\b/i;

export interface PostHeader {
  company: string;
  companyUrl: string | null;
  hiringFor: string | null;
  location: string | null;
  remote: boolean;
  /** The header as written, one line. */
  line: string;
}

/** Splits "Acme (acme.com) | Backend Engineer | Bengaluru or Remote | Full-time" into its parts. */
export function parsePostHeader(html: string): PostHeader | null {
  const first = html.split(/<p>/i)[0] ?? '';
  const hrefs = [...first.matchAll(/href\s*=\s*"([^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const line = htmlToText(first).replace(/\s+/g, ' ').trim();
  if (!line || line.length > 400) return null;
  let parts = line.split('|');
  if (parts.length < 2) {
    for (const sep of [' - ', ' – ', ' — ', ' • ', ' / ']) {
      if (line.includes(sep)) {
        parts = line.split(sep);
        break;
      }
    }
  }
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const urls = [...hrefs, ...parts.filter((p) => URL_PART_RE.test(p)), ...(parts[0].match(/\(([^)]+)\)/)?.slice(1) ?? [])];
  const companyUrl = urls.map(toUrl).find((u): u is string => Boolean(u && !isJobBoardHost(hostOf(u) ?? ''))) ?? null;

  let company = parts[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!company || URL_PART_RE.test(company)) {
    const host = hostOf(toUrl(parts[0]) ?? '');
    company = host ? host.replace(/^www\./, '') : company;
  }
  if (!company) return null;

  const roles: string[] = [];
  const places: string[] = [];
  for (const part of parts.slice(1)) {
    if (URL_PART_RE.test(part) || SALARY_RE.test(part) || EMPLOYMENT_RE.test(part)) continue;
    if (ROLE_RE.test(part) && !(LOCATION_WORD_RE.test(part) && part.split(/\s+/).length <= 2)) roles.push(part);
    else places.push(part);
  }
  return {
    company,
    companyUrl,
    hiringFor: roles.length ? roles.join(', ') : null,
    location: places.length ? places.join(' | ') : null,
    remote: /\bremote\b/i.test(line),
    line,
  };
}

function toUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i.test(v) ? `https://${v}` : null;
  if (!withScheme) return null;
  return hostOf(withScheme) ? withScheme : null;
}

const JOB_LINK_RE = /\b(jobs?|careers?|apply|hiring|join|openings|positions|greenhouse|lever\.co|ashbyhq|workable|wellfound|recruitee|breezy|smartrecruiters)\b/i;

/** The first link in the post that looks like a job page. */
export function jobLinkIn(html: string): string | null {
  for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
    const url = decodeEntities(m[1]);
    if (/^https?:\/\//i.test(url) && JOB_LINK_RE.test(url) && !/news\.ycombinator\.com/i.test(url)) return url;
  }
  return null;
}

export interface PostResult {
  contacts: ContactCandidate[];
  site: HnCompanySite | null;
  outOfRegion: boolean;
}

/** Contacts in one top-level comment of a hiring thread. */
export function contactsFromPost(comment: HnComment, region: Region): PostResult {
  const none: PostResult = { contacts: [], site: null, outOfRegion: false };
  const html = comment.text ?? '';
  const header = html ? parsePostHeader(html) : null;
  if (!header) return none;
  const text = htmlToText(html);
  if (region === 'india' && !isIndiaEligible({ location: header.location ?? '', remote: header.remote }) && !mentionsIndia(text)) {
    return { ...none, outOfRegion: true };
  }
  // A post without an address can still name the company's site for the company-page source.
  const site = header.companyUrl ? { company: header.company, url: header.companyUrl } : null;
  const companyDomain = header.companyUrl ? baseDomain(hostOf(header.companyUrl) ?? '') : firstCompanyDomain(text);
  const contacts = contactsFromText({
    text,
    company: header.company,
    companyDomain: companyDomain || null,
    hiringFor: header.hiringFor,
    location: header.location,
    remote: header.remote,
    source: 'hn_whos_hiring',
    sourceUrl: `https://news.ycombinator.com/item?id=${comment.id}`,
    jobUrl: jobLinkIn(html),
    postedAt: toIso(comment.created_at),
    snippetPrefix: header.line.length > 160 ? `${header.line.slice(0, 159)}…` : header.line,
  });
  return { contacts, site, outOfRegion: false };
}

function firstCompanyDomain(text: string): string | null {
  for (const { email } of extractEmails(text).found) {
    const domain = emailDomain(email);
    if (!isFreeMailDomain(domain) && !isJobBoardHost(domain)) return baseDomain(domain);
  }
  return null;
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface HnOptions {
  fetchImpl?: FetchLike;
  months?: number;
  region?: Region;
}

export async function scrapeHnContacts(options: HnOptions = {}): Promise<HnResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const region = options.region ?? 'india';
  const threads = await findHiringThreads(fetchImpl, options.months ?? 2);
  const result: HnResult = { contacts: [], posts: 0, outOfRegion: 0, sites: [], threads, warnings: [] };
  if (threads.length === 0) result.warnings.push('no "Who is hiring?" thread found');
  for (const thread of threads) {
    let item: any;
    try {
      item = await getJson(fetchImpl, `${ALGOLIA}/items/${thread.id}`, 60000);
    } catch (err) {
      result.warnings.push(`thread ${thread.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const children: HnComment[] = Array.isArray(item?.children) ? item.children : [];
    for (const comment of children) {
      if (!comment?.text) continue;
      result.posts++;
      const post = contactsFromPost(comment, region);
      if (post.outOfRegion) result.outOfRegion++;
      result.contacts.push(...post.contacts);
      if (post.site) result.sites.push(post.site);
    }
  }
  return result;
}
