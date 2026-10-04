import type { AddressType } from '@job-automator/email-verifier';
import type { ContactKind, ContactSource } from './schema.js';

/**
 * Who an address belongs to, read from the words written next to it. Only what the text
 * says is used: a title is kept when it is written beside the address, a name only when it
 * is written right before the address and matches its local part.
 */

const FOUNDER_RE = /\b(co-?founders?|founders?|ceo|cto|coo|chief (?:executive|technology|technical|operating) officer)\b/i;
const RECRUITER_RE = /\b(recruit(?:er|ers|ing|ment)|talent(?: acquisition| partner| team| lead)?|hr|human resources|people (?:team|ops|operations|partner)|sourcer|hiring partner)\b/i;
const MANAGER_RE = /\b(hiring manager|engineering manager|eng(?:ineering)? lead|team lead|tech lead|head of [a-z]+|director(?: of [a-z]+)?|vp(?: of [a-z]+)?|vice president(?: of [a-z]+)?)\b/i;

export interface KindInput {
  addressType: AddressType;
  /** Text just before and after the address (the same line or sentence). */
  context: string;
  source: ContactSource;
}

export interface KindResult {
  kind: ContactKind;
  /** The title as written next to the address, when there is one. */
  roleTitle: string | null;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

export function classifyContact({ addressType, context, source }: KindInput): KindResult {
  if (addressType === 'role') return { kind: 'team_inbox', roleTitle: null };
  const founder = context.match(FOUNDER_RE);
  if (founder) return { kind: 'founder', roleTitle: titleCase(tidy(founder[1])) };
  const recruiter = context.match(RECRUITER_RE);
  if (recruiter) return { kind: 'recruiter', roleTitle: titleCase(tidy(recruiter[1])) };
  const manager = context.match(MANAGER_RE);
  if (manager) return { kind: 'hiring_manager', roleTitle: titleCase(tidy(manager[1])) };
  // HN rules say posters must work at the hiring company, so a personal address in a post is
  // someone on the inside. Elsewhere the text does not say who the address belongs to.
  return { kind: source === 'hn_whos_hiring' ? 'employee' : 'unknown', roleTitle: null };
}

const ACRONYMS = new Set(['ceo', 'cto', 'coo', 'hr', 'vp']);

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ');
}

const NOT_NAMES = new Set([
  'email', 'e-mail', 'mail', 'contact', 'send', 'apply', 'reach', 'write', 'ping', 'message', 'me', 'us', 'at', 'to',
  'or', 'and', 'the', 'our', 'your', 'please', 'hiring', 'remote', 'onsite', 'hybrid', 'india', 'resume', 'cv',
  'questions', 'interested', 'thanks', 'regards', 'cheers', 'founder', 'cofounder', 'co-founder', 'ceo', 'cto', 'coo',
  'recruiter', 'manager', 'lead', 'head', 'director', 'hr', 'talent', 'engineering', 'team', 'jobs', 'careers', 'dm',
]);

/**
 * "Priya Sharma (priya.sharma@acme.in)", "Contact Priya: priya@acme.in", "Priya Sharma, CTO - ps@acme.in".
 * Returns the capitalised words just before the address when at least one of them
 * (3+ letters) appears in the address's local part. Otherwise null.
 */
export function nameBeforeEmail(textBefore: string, email: string): string | null {
  const local = email.slice(0, email.indexOf('@')).toLowerCase();
  // Drop what sits between the name and the address: "at", a bracketed note and a title
  // ("Neha Gupta (HR) at", "Priya Sharma, CTO -").
  const before = textBefore
    .slice(-80)
    .replace(/\s+(?:at|on|via|is)\s*[:\-–—]?\s*$/i, ' ')
    .replace(/\s*\([^()]{1,40}\)\s*$/, ' ')
    .replace(new RegExp(`[,\\s]+(?:${[FOUNDER_RE, RECRUITER_RE, MANAGER_RE].map((r) => r.source).join('|')})[\\s,:\\-–—(<]*$`, 'i'), ' ');
  const m = before.match(/((?:[A-Z][a-zA-Z'’-]+\s+){0,3}[A-Z][a-zA-Z'’-]+)\s*[:,\-–—(<]*\s*$/);
  if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => !NOT_NAMES.has(w.toLowerCase()));
  // Keep only the trailing run of name-like words.
  if (words.length === 0 || words.length > 3) return null;
  const hit = words.some((w) => {
    const plain = w.toLowerCase().replace(/[^a-z]/g, '');
    return plain.length >= 3 && local.includes(plain);
  });
  return hit ? words.join(' ') : null;
}
