import { createHash } from 'crypto';
import { validateCanonicalJobUrl } from '../canonical-link-guard.js';
import type { EmploymentType, SalaryPeriod, WorkplaceType } from '../job-schema.js';

/** Pure helpers that turn messy source fields into the normalized Job fields. */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Strips tags (after decoding, so escaped HTML from Greenhouse is handled) and collapses whitespace. */
export function htmlToText(html: string | null | undefined, maxLength = 20000): string {
  if (!html) return '';
  const decoded = decodeEntities(decodeEntities(String(html)));
  return decoded
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, maxLength);
}

export function cleanText(value: unknown, maxLength = 300): string {
  if (value === null || value === undefined) return '';
  return decodeEntities(String(value)).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

const TRACKING_PARAMS = /^(utm_[a-z]+|ref|source|src|gh_src|lever-source|lever-origin|from|view|trk|fbclid|gclid)$/i;

/**
 * Canonical form of a job URL used for dedupe: known ATS URLs collapse to their
 * posting URL (via canonical-link-guard); others lose tracking params, hash and trailing slash.
 */
export function canonicalizeUrl(rawUrl: string): string {
  const guard = validateCanonicalJobUrl(rawUrl);
  const base = guard.isValid ? guard.cleanUrl : rawUrl.trim();
  try {
    const url = new URL(base);
    url.hash = '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return base;
  }
}

/** Stable id for sources without native ids: hash of the canonical URL. */
export function stableIdFromUrl(url: string): string {
  return createHash('sha1').update(canonicalizeUrl(url)).digest('hex').slice(0, 24);
}

const REMOTE_PATTERN = /\b(remote|work from home|wfh|anywhere|distributed)\b/i;
const HYBRID_PATTERN = /\bhybrid\b/i;

export function detectWorkplace(
  hint: string | null | undefined,
  location: string,
  title: string
): { workplaceType: WorkplaceType; remote: boolean } {
  const h = (hint ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (h === 'remote' || h === 'fullyremote') return { workplaceType: 'remote', remote: true };
  if (h === 'hybrid') return { workplaceType: 'hybrid', remote: false };
  if (h === 'onsite' || h === 'inoffice' || h === 'office') return { workplaceType: 'onsite', remote: false };

  const text = `${location} ${title}`;
  if (HYBRID_PATTERN.test(text)) return { workplaceType: 'hybrid', remote: false };
  if (REMOTE_PATTERN.test(text)) return { workplaceType: 'remote', remote: true };
  return { workplaceType: 'unknown', remote: false };
}

export function normalizeEmploymentType(hint: string | null | undefined, title = ''): EmploymentType {
  const h = (hint ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (/intern|trainee|apprentice/.test(h)) return 'internship';
  if (/parttime/.test(h)) return 'part_time';
  if (/contract|freelance|temporary|temp$|consult/.test(h)) return 'contract';
  if (/fulltime|permanent|regular/.test(h)) return 'full_time';

  const t = title.toLowerCase();
  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) return 'internship';
  if (/\b(contract|contractor|freelance)\b/.test(t)) return 'contract';
  if (/\bpart[\s-]?time\b/.test(t)) return 'part_time';
  return 'unknown';
}

/**
 * Accepts ISO strings, RFC 2822 strings (RSS) and epoch milliseconds/seconds.
 * Returns null for unparseable dates and dates more than a day in the future.
 */
export function toIsoDate(value: unknown, now: Date = new Date()): string | null {
  if (value === null || value === undefined || value === '') return null;
  let ms: number;
  if (typeof value === 'number') {
    ms = value < 1e12 ? value * 1000 : value;
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else {
    const str = String(value).trim();
    ms = /^\d{10,13}$/.test(str) ? Number(str) * (str.length === 10 ? 1000 : 1) : Date.parse(str);
  }
  if (!Number.isFinite(ms)) return null;
  if (ms > now.getTime() + 24 * 3600 * 1000) return null;
  if (ms < Date.UTC(2000, 0, 1)) return null;
  return new Date(ms).toISOString();
}

export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

const EMPTY_SALARY: ParsedSalary = { min: null, max: null, currency: null, period: null };

const CURRENCY_SYMBOLS: Array<[RegExp, string]> = [
  [/₹|\binr\b|\brs\.?(?=\s|\d)/i, 'INR'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
  [/\bcad\b|c\$/i, 'CAD'],
  [/\baud\b|a\$/i, 'AUD'],
  [/\bsgd\b|s\$/i, 'SGD'],
  [/\$|\busd\b/i, 'USD'],
];

/**
 * Parses free-text salary strings such as "₹30,000 /month", "$90k - $120k",
 * "₹18 LPA - ₹34 LPA" or "USD 90000 - 120000 /yr". Anything it can't read
 * confidently returns nulls rather than a guess.
 */
export function parseSalaryText(text: string | null | undefined): ParsedSalary {
  if (!text) return EMPTY_SALARY;
  const raw = String(text).trim();
  if (!raw || /competitive|negotiable|not disclosed|unpaid|market rate/i.test(raw)) return EMPTY_SALARY;

  let currency: string | null = null;
  for (const [pattern, code] of CURRENCY_SYMBOLS) {
    if (pattern.test(raw)) {
      currency = code;
      break;
    }
  }

  const lower = raw.toLowerCase();
  const isLpa = /\blpa\b|lakhs?\s*(per\s*annum|\/\s*(yr|year|annum))?/.test(lower);
  const numbers = [...lower.matchAll(/(\d+(?:[.,]\d+)*)\s*(k|lpa|lakhs?|l\b|cr|m\b)?/g)]
    .map((match) => {
      const n = Number(match[1].replace(/,/g, ''));
      if (!Number.isFinite(n)) return null;
      const unit = match[2] ?? (isLpa ? 'lpa' : '');
      if (unit === 'k') return n * 1_000;
      if (unit === 'lpa' || unit.startsWith('lakh') || unit === 'l') return n * 100_000;
      if (unit === 'cr') return n * 10_000_000;
      if (unit === 'm') return n * 1_000_000;
      return n;
    })
    .filter((n): n is number => n !== null && n > 0);

  if (numbers.length === 0) return EMPTY_SALARY;

  let period: SalaryPeriod | null = null;
  if (/\/\s*(hr|hour)|per\s*hour|hourly/.test(lower)) period = 'hour';
  else if (/\/\s*(mo|month)|per\s*month|monthly|\bpm\b/.test(lower)) period = 'month';
  else if (/\/\s*(yr|year|annum)|per\s*(year|annum)|annual|yearly|\blpa\b|\bpa\b|lakhs?/.test(lower)) period = 'year';

  const min = Math.min(numbers[0], numbers[1] ?? numbers[0]);
  const max = Math.max(numbers[0], numbers[1] ?? numbers[0]);

  // Bare numbers without a currency or period are too ambiguous to keep.
  if (!currency && !period) return EMPTY_SALARY;

  return { min, max, currency, period };
}

/** Maps API interval strings ("per-year-salary", "1 YEAR", "monthly") to a SalaryPeriod. */
export function normalizeSalaryPeriod(interval: string | null | undefined): SalaryPeriod | null {
  const s = (interval ?? '').toLowerCase();
  if (/hour/.test(s)) return 'hour';
  if (/month/.test(s)) return 'month';
  if (/year|annual|annum/.test(s)) return 'year';
  return null;
}

export function normalizeCurrency(code: unknown): string | null {
  const s = String(code ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|pvt|private|corp|corporation|co|gmbh|plc|technologies|technology|labs?|india)\b\.?/g;

export function normalizeForKey(value: string): string {
  return decodeEntities(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeCompanyKey(company: string): string {
  return normalizeForKey(company).replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeLocationKey(location: string, remote: boolean): string {
  const key = normalizeForKey(location)
    .replace(/\b(bengaluru)\b/g, 'bangalore')
    .replace(/\b(gurugram)\b/g, 'gurgaon')
    .replace(/\b(remote|anywhere|worldwide|global|unspecified|work from home|wfh)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return key || (remote ? 'remote' : '');
}

export function dedupeKeyFor(job: { company: string; title: string; location: string; remote: boolean }): string {
  return [
    normalizeCompanyKey(job.company),
    normalizeForKey(job.title),
    normalizeLocationKey(job.location, job.remote),
  ].join('|');
}
