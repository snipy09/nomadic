import { addressType, baseDomain, emailDomain, extractEmails, isFreeMailDomain, snippetAround } from '@job-automator/email-verifier';
import { classifyContact, nameBeforeEmail } from './classify.js';
import { isJobBoardHost } from './hosts.js';
import { clipText, type ContactCandidate, type ContactSource } from './schema.js';

/** What the source page says around the addresses it holds. */
export interface TextSource {
  /** Plain text (HTML already converted). */
  text: string;
  company: string;
  companyDomain: string | null;
  hiringFor: string | null;
  location: string | null;
  remote: boolean;
  source: ContactSource;
  sourceUrl: string;
  jobUrl: string | null;
  postedAt: string | null;
  /** Put before the snippet, e.g. the HN post header, so the reader sees which post it was. */
  snippetPrefix?: string;
  /** Keep only addresses whose base domain equals this one (company pages). */
  sameDomainAs?: string | null;
}

/**
 * The words on the same line and sentence as an address: up to 80 characters before it
 * and 50 after. Titles and names are only read from here, so a role the company is hiring
 * for elsewhere in the post is not taken as the poster's title.
 */
export function nearText(text: string, index: number, length: number): { before: string; after: string } {
  let before = text.slice(Math.max(0, index - 80), index);
  const cut = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
  if (cut >= 0) before = before.slice(cut + 1);
  let after = text.slice(index + length, index + length + 50);
  const stop = after.search(/\n|[.!?](?:\s|$)/);
  if (stop >= 0) after = after.slice(0, stop);
  return { before, after };
}

/** "We are hiring a Head of Design" or "looking for an engineering manager" is not the poster's title. */
const HIRING_VERB_RE = /\b(?:hiring|looking for|seeking|need|needs|want|wants|join(?:ing)? as|for (?:the|a|an|our)|role of|position of)\s+(?:a|an|the|our)?\s*$/i;

export function contactsFromText(src: TextSource): ContactCandidate[] {
  const { text, found } = extractEmails(src.text);
  const out: ContactCandidate[] = [];
  for (const { email, index } of found) {
    const domain = emailDomain(email);
    if (isJobBoardHost(domain)) continue;
    const base = baseDomain(domain);
    if (src.sameDomainAs && base !== src.sameDomainAs) continue;
    const type = addressType(email);
    const { before, after } = nearText(text, index, email.length);
    const context = titleContext(before, after);
    const { kind, roleTitle } = classifyContact({ addressType: type, context, source: src.source });
    const snippet = snippetAround(text, index, 300);
    out.push({
      email,
      name: type === 'personal' ? nameBeforeEmail(before, email) : null,
      company: clipText(src.company, 200),
      companyDomain: src.companyDomain ?? (isFreeMailDomain(domain) ? null : base),
      roleTitle,
      hiringFor: src.hiringFor ? clipText(src.hiringFor, 300) : null,
      contactKind: kind,
      addressType: type,
      source: src.source,
      sourceUrl: src.sourceUrl,
      sourceSnippet: clipText(src.snippetPrefix ? `${src.snippetPrefix} … ${snippet}` : snippet, 500),
      jobUrl: src.jobUrl,
      location: src.location ? clipText(src.location, 300) : null,
      remote: src.remote,
      postedAt: src.postedAt,
    });
  }
  return out;
}

/** The before/after text with any "hiring a <title>" phrase removed. */
function titleContext(before: string, after: string): string {
  // Drop everything up to and including the last hiring verb phrase in `before`, so
  // "we're hiring a Tech Lead, email jane@" keeps only ", email".
  const words = before.split(/(?<=\s)/);
  for (let i = words.length; i > 0; i--) {
    if (HIRING_VERB_RE.test(words.slice(0, i).join(''))) {
      // The title follows the verb; skip it up to the next punctuation.
      const rest = words.slice(i).join('');
      const punct = rest.search(/[,;:()\-–—]/);
      before = punct >= 0 ? rest.slice(punct) : '';
      break;
    }
  }
  return `${before} ${after}`;
}
