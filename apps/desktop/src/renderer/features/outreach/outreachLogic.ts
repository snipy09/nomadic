import type {
  OutreachChannel,
  OutreachContactKind,
  OutreachMessage,
  OutreachMessageStatus,
  OutreachPerson,
  OutreachPurpose,
  OutreachReportReason,
} from '../../../shared/ipc';
import { findPlaceholders, LINKEDIN_NOTE_LIMIT } from '../../../shared/outreachText';

export { findPlaceholders, LINKEDIN_NOTE_LIMIT };

/** Everyone at a company who can refer or pass an application on. Shown on the info screen too. */
export const KIND_INFO: Record<OutreachContactKind, { label: string; why: string }> = {
  recruiter: { label: 'Recruiter / HR', why: 'Owns the hiring pipeline and can move your application forward.' },
  hiring_manager: { label: 'Hiring manager', why: 'Leads the team that is hiring and decides who gets interviewed.' },
  founder: { label: 'Founder', why: 'At startups, founders often hire directly and read every note.' },
  employee: { label: 'Employee', why: 'Engineers and others on the team can submit a referral.' },
  alumni: { label: 'Alumni', why: 'People from your college are the most likely to say yes to a referral.' },
  team_inbox: { label: 'Team inbox', why: 'careers@ or jobs@ addresses the company publishes for applications.' },
  unknown: { label: 'Other', why: 'Someone at the company whose role is not listed.' },
};

/** Kinds offered when adding a person, in the order shown. */
export const PICKABLE_KINDS: OutreachContactKind[] = ['recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown'];

export const PURPOSE_LABELS: Record<OutreachPurpose, string> = {
  referral: 'Ask for a referral',
  application_follow_up: 'Follow up on an application',
  introduction: 'Introduce yourself',
  follow_up: 'Follow up on a message',
};

export const REPORT_REASON_LABELS: Record<OutreachReportReason, string> = {
  bounced: 'Email bounced',
  wrong_person: 'Wrong person or role',
  not_hiring: 'Not hiring',
  asked_to_stop: 'Asked not to be contacted',
  other: 'Something else',
};

export const STATUS_INFO: Record<OutreachMessageStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  ready: { label: 'Reviewed', tone: 'accent' },
  sent: { label: 'Sent', tone: 'success' },
  replied: { label: 'Replied', tone: 'success' },
  no_reply: { label: 'No reply', tone: 'warning' },
  bounced: { label: 'Bounced', tone: 'danger' },
};

/** Facts about the sender the templates may use. Missing facts become `[...]` gaps, never guesses. */
export interface SenderFacts {
  name: string;
  desiredTitle: string;
  skills: string;
}

export function senderFacts(p: { firstName?: string; lastName?: string; preferredName?: string; desiredTitle?: string; techStack?: string }): SenderFacts {
  const name = (p.preferredName?.trim() || [p.firstName, p.lastName].map((s) => s?.trim()).filter(Boolean).join(' ')).trim();
  const skills = (p.techStack ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return { name, desiredTitle: p.desiredTitle?.trim() ?? '', skills };
}

function firstName(person: Pick<OutreachPerson, 'name'>): string {
  return person.name?.trim().split(/\s+/)[0] ?? '';
}

export interface TemplateInput {
  purpose: OutreachPurpose;
  channel: OutreachChannel;
  person: Pick<OutreachPerson, 'name' | 'company' | 'kind'>;
  sender: SenderFacts;
  jobTitle?: string | null;
}

/**
 * A starting draft. Only known facts are filled in; everything else is a visible `[gap]`
 * that the review step refuses to send until the user fills or removes it.
 */
export function templateFor({ purpose, channel, person, sender, jobTitle }: TemplateInput): { subject: string; body: string } {
  const role = jobTitle?.trim() || sender.desiredTitle || '[role]';
  const me = sender.name || '[Your name]';
  const hi = firstName(person) ? `Hi ${firstName(person)},` : 'Hello,';
  const company = person.company.trim() || '[company]';
  const skills = sender.skills ? ` I work with ${sender.skills}.` : '';

  if (channel === 'linkedin') {
    const lines: Record<OutreachPurpose, string> = {
      referral: `${hi} I'm ${me}, applying for the ${role} role at ${company}.${skills} Would you be open to a quick chat or a referral?`,
      application_follow_up: `${hi} I'm ${me}. I applied for the ${role} role at ${company} and would love to connect.`,
      introduction: `${hi} I'm ${me}, interested in ${role} roles at ${company}.${skills} Happy to connect.`,
      follow_up: `${hi} following up on my earlier note about the ${role} role at ${company}. Thanks for your time.`,
    };
    return { subject: '', body: lines[purpose] };
  }

  const subjects: Record<OutreachPurpose, string> = {
    referral: `Referral for the ${role} role at ${company}`,
    application_follow_up: `Following up: ${role} application`,
    introduction: `${me}, interested in ${role} roles at ${company}`,
    follow_up: `Re: ${role} at ${company}`,
  };
  const asks: Record<OutreachPurpose, string> = {
    referral: `I'm applying for the ${role} role at ${company}.${skills} If you think I'd be a fit, would you be open to referring me? I can send my resume and anything else that helps.`,
    application_follow_up: `I applied for the ${role} role at ${company} on [date] and wanted to check whether there is anything else I can share.${skills}`,
    introduction: `I'm interested in ${role} roles at ${company}.${skills} If the team is hiring, I'd be grateful for a few minutes of your time or a pointer to the right person.`,
    follow_up: `I'm following up on my earlier message about the ${role} role at ${company}. I understand you're busy; a short reply either way would help a lot.`,
  };
  const body = `${hi}\n\nI'm ${me}. ${asks[purpose]}\n\nThank you,\n${me}`;
  return { subject: subjects[purpose], body };
}

/** What still blocks review, in the order the user should fix it. Empty when ready to review. */
export function draftProblems(d: { channel: OutreachChannel; subject: string; body: string }, person: Pick<OutreachPerson, 'email' | 'linkedinUrl'> | null): string[] {
  const out: string[] = [];
  if (!person) return ['Pick who this message is for.'];
  if (d.channel === 'email' && !person.email) out.push('This person has no email address. Add one or write a LinkedIn note.');
  if (d.channel === 'linkedin' && !person.linkedinUrl) out.push('This person has no LinkedIn profile link. Add one or write an email.');
  if (d.channel === 'email' && !d.subject.trim()) out.push('Add a subject.');
  if (!d.body.trim()) out.push('Write the message.');
  if (d.channel === 'linkedin' && d.body.length > LINKEDIN_NOTE_LIMIT) out.push(`LinkedIn notes can be at most ${LINKEDIN_NOTE_LIMIT} characters.`);
  const gaps = findPlaceholders(`${d.channel === 'email' ? d.subject : ''}\n${d.body}`);
  if (gaps.length) out.push(`Fill in or remove: ${gaps.slice(0, 3).join(', ')}`);
  return out;
}

/** Messages for one person, newest first. */
export function messagesFor(messages: OutreachMessage[], personId: number): OutreachMessage[] {
  return messages.filter((m) => m.personId === personId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function matchesPerson(query: string, p: OutreachPerson): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.company, p.roleTitle, p.email].some((v) => v?.toLowerCase().includes(q));
}

export function displayName(p: Pick<OutreachPerson, 'name' | 'email' | 'company' | 'kind'>): string {
  return p.name?.trim() || p.email || `${KIND_INFO[p.kind].label} at ${p.company}`;
}
