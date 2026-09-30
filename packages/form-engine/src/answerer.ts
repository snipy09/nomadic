import type { FieldKey, FormField, FormProfile } from './types.js';

export type Answer =
  | { type: 'text'; text: string }
  | { type: 'option'; text: string; matcher?: RegExp }
  | { type: 'check' }
  | { type: 'file'; path: string }
  | { type: 'none'; status: 'needs_user' | 'skipped'; reason: string };

const DECLINE = /prefer not|decline|(don'?t|do not) (wish|want) to|choose not|not to (say|answer|disclose|identify)|rather not|not specified/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Best option index for a wanted text: exact, then contains, then token overlap. -1 if nothing plausible. */
export function pickOptionIndex(options: string[], want: string, matcher?: RegExp): number {
  const real = options.map((o, i) => ({ o, i })).filter(({ o }) => o.trim() && !/^(select|choose|please select|--)/i.test(o.trim()));
  if (matcher) {
    const m = real.find(({ o }) => matcher.test(o));
    if (m) return m.i;
  }
  const w = norm(want);
  if (!w) return -1;
  const exact = real.find(({ o }) => norm(o) === w);
  if (exact) return exact.i;
  const starts = real.find(({ o }) => norm(o).startsWith(w) || w.startsWith(norm(o)));
  if (starts) return starts.i;
  const contains = real.find(({ o }) => norm(o).includes(w) || (norm(o).length > 2 && w.includes(norm(o))));
  if (contains) return contains.i;
  const wt = new Set(w.split(' ').filter((t) => t.length > 2));
  let best = -1;
  let bestScore = 0;
  for (const { o, i } of real) {
    const ot = norm(o).split(' ');
    const score = ot.filter((t) => wt.has(t)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : -1;
}

function yesNo(yes: boolean): Answer {
  return { type: 'option', text: yes ? 'Yes' : 'No', matcher: yes ? /^\s*yes\b|^true$/i : /^\s*no\b|^false$/i };
}

/** Sponsorship questions come in two polarities; answer truthfully for each. */
function sponsorshipAnswer(label: string, p: FormProfile): Answer {
  const needs = p.needsSponsorship === true;
  const l = label.toLowerCase();
  // "Are you legally authorized to work ... without sponsorship?" -> Yes when no sponsorship is needed.
  const positive = /without (the need for |requiring |needing )?(visa )?sponsorship|not require|do not require|will not require|authori[sz]ed to work/.test(l);
  return yesNo(positive ? !needs : needs);
}

export function answerField(f: FormField, key: FieldKey, p: FormProfile): Answer {
  const custom = p.customAnswers
    ? Object.entries(p.customAnswers).find(([q]) => q.trim() && f.label.toLowerCase().includes(q.trim().toLowerCase()))
    : undefined;
  if (custom) {
    return f.kind === 'text' || f.kind === 'textarea' || f.kind === 'richtext' || f.kind === 'date'
      ? { type: 'text', text: custom[1] }
      : { type: 'option', text: custom[1] };
  }

  const text = (v: string | undefined, reason: string): Answer =>
    v && v.trim() ? { type: 'text', text: v.trim() } : { type: 'none', status: f.required ? 'needs_user' : 'skipped', reason };

  const asField = (v: string | undefined, reason: string): Answer => {
    if (!v || !v.trim()) return { type: 'none', status: f.required ? 'needs_user' : 'skipped', reason };
    return f.kind === 'select' || f.kind === 'radio' || f.kind === 'combobox'
      ? { type: 'option', text: v.trim() }
      : { type: 'text', text: v.trim() };
  };

  const location = p.location || [p.city, p.country].filter(Boolean).join(', ');

  switch (key) {
    case 'firstName': return text(p.firstName, 'No first name in profile');
    case 'lastName': return text(p.lastName, 'No last name in profile');
    case 'fullName': return text(`${p.firstName} ${p.lastName}`, 'No name in profile');
    case 'email': return text(p.email, 'No email in profile');
    case 'phone': return text(p.phone, 'No phone in profile');
    case 'linkedin': return text(p.linkedin, 'No LinkedIn URL in profile');
    case 'github': return text(p.github, 'No GitHub URL in profile');
    case 'twitter': return text(p.twitter, 'No Twitter URL in profile');
    case 'portfolio': return text(p.portfolio || p.github, 'No website/portfolio in profile');
    case 'city': return asField(p.city || location.split(',')[0], 'No city in profile');
    case 'country': return asField(p.country, 'No country in profile');
    case 'location': return asField(location, 'No location in profile');
    case 'address': return text(p.address, 'No street address in profile');
    case 'postalCode': return text(p.postalCode, 'No postal code in profile');
    case 'state': return asField(p.state, 'No state in profile');
    case 'currentSalary': return asField(p.currentSalary, 'No current salary in profile');
    case 'currentCompany': return text(p.currentCompany, 'No current company in profile');
    case 'currentTitle': return text(p.currentTitle, 'No current title in profile');
    case 'yearsExperience': return asField(p.yearsExperience, 'No years of experience in profile');
    case 'salary': return asField(p.salary, 'No salary expectation in profile');
    case 'noticePeriod': return asField(p.noticePeriod, 'No notice period in profile');
    case 'coverLetterText': return text(p.coverLetterText || p.summary, 'No cover letter/summary in profile');
    case 'summary': return text(p.summary || p.coverLetterText, 'No summary in profile');
    case 'pronouns': return { type: 'none', status: 'skipped', reason: 'Pronouns left blank' };
    case 'resume':
      return p.resumeFilePath
        ? { type: 'file', path: p.resumeFilePath }
        : { type: 'none', status: f.required ? 'needs_user' : 'skipped', reason: 'No resume file in profile' };
    case 'coverLetterFile':
      return { type: 'none', status: 'skipped', reason: 'Cover letter upload not provided' };
    case 'consent':
      return { type: 'check' };
    case 'sponsorship':
      return sponsorshipAnswer(f.label, p);
    case 'workAuthorization':
      return yesNo(p.authorizedToWork !== false);
    case 'relocate':
      return yesNo(p.willingToRelocate !== false);
    case 'referral': {
      if (p.referralSource) return { type: 'option', text: p.referralSource };
      // Prefer generic, true-in-spirit sources before naming a specific site.
      const order = ['job board', 'online', 'internet', 'other', 'social', 'linkedin', 'website'];
      const hit = order.map((w) => f.options.findIndex((o) => o.toLowerCase().includes(w))).find((i) => i >= 0);
      return { type: 'option', text: hit !== undefined ? f.options[hit] : 'Other', matcher: /job board|online|internet|other/i };
    }
    case 'eeoGender':
    case 'eeoRace':
    case 'eeoVeteran':
    case 'eeoDisability':
      // Policy: always decline to self-identify; never guess protected-class answers.
      if (f.kind === 'text' || f.kind === 'textarea') return { type: 'none', status: 'skipped', reason: 'EEO free text left blank' };
      return { type: 'option', text: 'Decline', matcher: DECLINE };
    default:
      return { type: 'none', status: f.required ? 'needs_user' : 'skipped', reason: 'No rule or profile value for this question' };
  }
}
