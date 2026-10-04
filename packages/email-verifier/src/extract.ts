/**
 * Finds email addresses that people published in text or HTML, including the common
 * spam-shy spellings ("jane [at] acme [dot] com", "jane@acme(dot)com", "&#64;").
 *
 * It never builds an address that is not written in the text: no name patterns, no guessing.
 */

export interface FoundEmail {
  /** Lowercased address. */
  email: string;
  /** Position in the normalised text returned next to it (for snippets). */
  index: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', commat: '@', period: '.', sol: '/', colon: ':',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * HTML to plain text for extraction: mailto targets are kept next to their link text,
 * paragraphs and line breaks become newlines, other tags are dropped, entities decoded.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<a\b[^>]*href\s*=\s*["']mailto:([^"'?#]+)[^"']*["'][^>]*>/gi, (_m, addr: string) => ` ${safeDecodeURI(addr)} `)
      .replace(/<(?:br|\/p|p|\/div|div|\/li|li|\/h\d|h\d|\/tr|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function safeDecodeURI(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const AT_WORD = String.raw`\s*[\[\(\{<]\s*(?:at|@)\s*[\]\)\}>]\s*`;
const DOT_WORD = String.raw`\s*[\[\(\{<]\s*(?:dot|\.)\s*[\]\)\}>]\s*`;

/**
 * Rewrites obfuscated spellings into plain addresses. The bare-word form ("jane at acme dot com")
 * is only rewritten when the domain also uses "dot", so "hiring at acme.com" stays as it is.
 */
export function deobfuscate(text: string): string {
  let t = text.replace(new RegExp(AT_WORD, 'gi'), '@').replace(new RegExp(DOT_WORD, 'gi'), '.');
  t = t.replace(
    /\b([a-z0-9][a-z0-9._%+-]{0,63})\s+(?:at|AT)\s+([a-z0-9][a-z0-9-]{0,62}(?:\s+(?:dot|DOT)\s+[a-z0-9][a-z0-9-]{0,62})+)\b/gi,
    (_m, local: string, domain: string) => `${local}@${domain.replace(/\s+(?:dot|DOT)\s+/g, '.')}`
  );
  // "jane @ acme.com" (spaces around a real @ before a dotted domain).
  t = t.replace(/([a-z0-9._%+-])\s+@\s+([a-z0-9-]+\.[a-z]{2,})/gi, '$1@$2');
  return t;
}

const EMAIL_RE = /(?<![a-z0-9._%+-])[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?![a-z0-9-])/gi;

const FILE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp', 'css', 'js', 'mjs', 'json', 'html', 'htm', 'php', 'pdf', 'zip']);
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.in', 'test.com', 'domain.com', 'email.com', 'yourdomain.com',
  'yourcompany.com', 'company.com', 'acme.com', 'xyz.com', 'abc.com', 'sample.com', 'website.com',
]);
const SKIP_DOMAIN_SUFFIXES = ['sentry.io', 'wixpress.com', 'sentry-next.wixpress.com', 'users.noreply.github.com', 'invalid', 'localhost', 'local', 'test', 'example'];
const NO_REPLY_RE = /^(?:no[-._]?reply|do[-._]?not[-._]?reply|donotreply|mailer[-._]?daemon|postmaster|bounces?|notifications?|alerts?|abuse|unsubscribe)(?:[+._-]|$)/;

/** True when an address found in text is worth keeping (not a file name, placeholder or no-reply). */
export function isPlausibleAddress(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (FILE_TLDS.has(tld)) return false;
  if (PLACEHOLDER_DOMAINS.has(domain)) return false;
  if (SKIP_DOMAIN_SUFFIXES.some((s) => domain === s || domain.endsWith(`.${s}`))) return false;
  if (NO_REPLY_RE.test(local)) return false;
  // Hex blobs (tracking ids, Sentry keys) are not people.
  if (/^[0-9a-f]{20,}$/.test(local)) return false;
  return true;
}

/**
 * Extracts unique plausible addresses from plain text. Returns the normalised text the
 * indexes point into (deobfuscated), so callers can cut a snippet around each address.
 */
export function extractEmails(input: string): { text: string; found: FoundEmail[] } {
  const text = deobfuscate(input);
  const found: FoundEmail[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    if (seen.has(email) || !isPlausibleAddress(email)) continue;
    seen.add(email);
    found.push({ email, index: m.index ?? 0 });
  }
  return { text, found };
}

/** The sentence-ish window around a position, collapsed to one line and capped at `max` characters. */
export function snippetAround(text: string, index: number, max = 240): string {
  const half = Math.floor(max / 2);
  let start = Math.max(0, index - half);
  let end = Math.min(text.length, index + half);
  // Prefer to start and stop on line breaks or sentence ends inside the window.
  const before = text.slice(start, index);
  const breakAt = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('. '));
  if (breakAt >= 0) start += breakAt + 1;
  const after = text.slice(index, end);
  const stopAt = after.search(/\n|\.\s/);
  if (stopAt > 0) end = index + stopAt + 1;
  const out = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}
