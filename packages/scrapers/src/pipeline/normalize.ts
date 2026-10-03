import type { EmploymentType, SalaryPeriod, WorkplaceType } from './schema.ts';

/** Shared normalization helpers used by every source adapter. */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', hellip: '...', rupee: '₹', euro: '€', pound: '£',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? match;
  });
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Some APIs (Greenhouse) return entity-encoded HTML, so decode before stripping.
  const decoded = /&lt;\w/.test(html) ? decodeEntities(html) : html;
  return decodeEntities(
    decoded
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanText(value: unknown, max = 300): string {
  if (value === null || value === undefined) return '';
  return decodeEntities(String(value)).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Parses many date shapes (ISO, epoch ms/s, `YYYY-MM-DD HH:mm:ss`) into ISO-8601. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let date: Date;
  if (typeof value === 'number') {
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    const text = String(value).trim();
    if (/^\d{10,13}$/.test(text)) return toIsoDate(Number(text));
    // `2026-09-29 08:15:00` (no zone) -> treat as UTC
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
    date = new Date(normalized);
  }
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  // Reject absurd values (before 2000 or more than 2 days in the future).
  if (time < Date.UTC(2000, 0, 1) || time > Date.now() + 2 * 86400000) return null;
  return date.toISOString();
}

const REMOTE_RE = /\b(remote|work from home|wfh|anywhere|distributed|telecommut\w*)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[- ]?site|in[- ]office|on[- ]premises?)\b/i;

export function detectWorkplace(...texts: Array<string | null | undefined>): WorkplaceType {
  const text = texts.filter(Boolean).join(' | ');
  if (HYBRID_RE.test(text)) return 'hybrid';
  if (REMOTE_RE.test(text)) return 'remote';
  if (ONSITE_RE.test(text)) return 'onsite';
  return 'unknown';
}

export function mapWorkplace(value: unknown): WorkplaceType | null {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'remote' || v === 'fullyremote') return 'remote';
  if (v === 'hybrid') return 'hybrid';
  if (v === 'onsite' || v === 'inoffice' || v === 'office') return 'onsite';
  return null;
}

export function parseEmploymentType(...values: Array<unknown>): EmploymentType {
  const text = values
    .flat()
    .filter(v => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (!text) return 'unknown';
  if (/\b(intern|internship|trainee|apprentice\w*)\b/.test(text)) return 'internship';
  if (/\b(contract|contractor|freelance|consultant)\b/.test(text)) return 'contract';
  if (/\b(part[\s_-]?time)\b/.test(text)) return 'part_time';
  if (/\b(temporary|temp|seasonal|fixed[\s_-]?term)\b/.test(text)) return 'temporary';
  if (/\b(full[\s_-]?time|permanent|fulltime|regular)\b/.test(text)) return 'full_time';
  return 'unknown';
}

export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

const CURRENCY_SYMBOLS: Array<[RegExp, string]> = [
  [/₹|\brs\.?(?=\s|\d)|\binr\b|\blpa\b|\blakh/i, 'INR'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
  [/\bcad\b|c\$/i, 'CAD'],
  [/\baud\b|a\$/i, 'AUD'],
  [/\bsgd\b|s\$/i, 'SGD'],
  [/\$|\busd\b/i, 'USD'],
];

/**
 * Parses free-text salary strings such as `$120,000 - $150,000`, `₹18 LPA - ₹34 LPA`,
 * `₹ 10,000 - 12,000 /month`, `€50k-70k`. Returns nulls when nothing usable is found.
 */
export function parseSalary(text: string | null | undefined): ParsedSalary {
  const empty: ParsedSalary = { min: null, max: null, currency: null, period: null };
  if (!text) return empty;
  const raw = String(text);
  const lower = raw.toLowerCase();
  if (/unpaid|competitive|not disclosed|negotiable|market rate/.test(lower) && !/\d/.test(lower)) return empty;

  let currency: string | null = null;
  for (const [re, code] of CURRENCY_SYMBOLS) {
    if (re.test(raw)) {
      currency = code;
      break;
    }
  }

  const isLakh = /\blpa\b|\blakhs?\b|\blac\b/.test(lower);
  const numbers: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|l)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] || '').toLowerCase();
    if (suffix === 'k') n *= 1_000;
    else if (suffix === 'm') n *= 1_000_000;
    else if (suffix === 'l' || isLakh) n *= 100_000;
    numbers.push(n);
  }
  const usable = numbers.filter(n => n > 0);
  if (usable.length === 0) return empty;

  let period: SalaryPeriod | null = null;
  if (/\/\s*(hr|hour)|per hour|hourly|\/h\b/.test(lower)) period = 'hour';
  else if (/\/\s*day|per day|daily/.test(lower)) period = 'day';
  else if (/\/\s*week|per week|weekly/.test(lower)) period = 'week';
  else if (/\/\s*(month|mo)\b|per month|monthly|\bpm\b/.test(lower)) period = 'month';
  else if (/\/\s*(year|yr|annum)|per year|annual|yearly|\bpa\b|\blpa\b|ctc/.test(lower)) period = 'year';

  const min = Math.min(usable[0], usable[1] ?? usable[0]);
  const max = Math.max(usable[0], usable[1] ?? usable[0]);
  if (!period) period = max >= 20_000 ? 'year' : null;
  return { min, max, currency, period };
}

/** Builds the legacy free-text `salary_range` from structured salary fields. */
export function formatSalary(job: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: SalaryPeriod | null }): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const cur = job.salaryCurrency ? `${job.salaryCurrency} ` : '';
  const range = job.salaryMin !== null && job.salaryMax !== null && job.salaryMin !== job.salaryMax
    ? `${fmt(job.salaryMin)} - ${fmt(job.salaryMax)}`
    : fmt((job.salaryMin ?? job.salaryMax) as number);
  return `${cur}${range}${job.salaryPeriod ? ` /${job.salaryPeriod}` : ''}`;
}

const TITLE_CASE_SMALL = new Set(['and', 'or', 'of', 'in', 'at', 'for', 'the', 'a', 'to']);

/** Turns a URL slug fragment (`full-stack-development`) into a title. */
export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && TITLE_CASE_SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
