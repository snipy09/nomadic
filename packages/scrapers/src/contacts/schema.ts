import { z } from 'zod';
import { isValidEmailSyntax } from '@job-automator/email-verifier';

/**
 * One public hiring contact, as the contact scraper publishes it to outreach_contacts.
 * Every field comes from the source page; nothing is guessed (unknown stays null).
 */

/** Everyone who can move an application forward, not only HR. */
export const CONTACT_KINDS = ['recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_SOURCES = ['hn_whos_hiring', 'job_description', 'company_page'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const ContactSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).refine(isValidEmailSyntax, 'invalid email'),
  name: optionalText(120),
  company: z.string().trim().min(1).max(200),
  companyDomain: optionalText(253),
  roleTitle: optionalText(200),
  hiringFor: optionalText(300),
  contactKind: z.enum(CONTACT_KINDS),
  addressType: z.enum(['personal', 'role']),
  source: z.enum(CONTACT_SOURCES),
  sourceUrl: httpUrl,
  sourceSnippet: z.string().trim().min(1).max(500),
  jobUrl: httpUrl.nullable(),
  location: optionalText(300),
  remote: z.boolean(),
  postedAt: z.iso.datetime({ offset: true }).nullable(),
  mxOk: z.boolean().nullable().default(null),
});

export type ContactCandidate = z.input<typeof ContactSchema>;
export type Contact = z.output<typeof ContactSchema>;

export type ParseContactResult = { ok: true; contact: Contact } | { ok: false; issues: string[] };

export function parseContact(candidate: unknown): ParseContactResult {
  const result = ContactSchema.safeParse(candidate);
  if (result.success) return { ok: true, contact: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** Clips free text to a schema limit on a word boundary. */
export function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
