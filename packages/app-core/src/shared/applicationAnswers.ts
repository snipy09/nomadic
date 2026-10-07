/**
 * Answers to the questions most application forms ask beyond the basic profile
 * (education, current job, preferences, short "about you" texts). The candidate gives
 * them once (onboarding or the Answers page). They are stored in `custom_answers_json`
 * under reserved keys, so they sync with the account like the other answers, and the
 * main process turns them into form-engine profile facts (`toAutomationFacts`).
 * Empty means "not answered": nothing here is ever filled in for the candidate.
 */
import { COMMON_QUESTIONS } from '@job-automator/form-engine/src/commonQuestions';

export type AppAnswerKind = 'text' | 'yesno' | 'choice' | 'long';
export type AppAnswerGroup = 'education' | 'work' | 'preferences' | 'about' | 'self_id';

export interface AppAnswerDef {
  id: string;
  /** Storage key in custom answers. */
  key: string;
  label: string;
  group: AppAnswerGroup;
  kind: AppAnswerKind;
  hint?: string;
  placeholder?: string;
  options?: string[];
  /** Nomadic AI can draft it from the resume (the candidate edits and confirms). */
  aiDraft?: boolean;
  /** For short facts: the question put to the AI to read the value off the resume. */
  ask?: string;
  maxChars?: number;
}

export const APP_KEY_PREFIX = '__app_';
export const COMMON_KEY_PREFIX = '__common_';

const def = (id: string, group: AppAnswerGroup, label: string, kind: AppAnswerKind, extra: Partial<AppAnswerDef> = {}): AppAnswerDef =>
  ({ id, key: `${APP_KEY_PREFIX}${id}`, group, label, kind, ...extra });
const fact = (q: string) => ({ aiDraft: true, maxChars: 120, ask: `${q} Reply with the value only, not a sentence.` });

export const APP_ANSWERS: readonly AppAnswerDef[] = [
  def('university', 'education', 'College or university', 'text', { placeholder: 'e.g. NIT Trichy', ...fact('Which college or university did you attend most recently (full name)?') }),
  def('degree', 'education', 'Degree', 'text', { placeholder: 'e.g. B.Tech', ...fact('What is your degree (for example B.Tech, B.E., BCA, M.Tech)?') }),
  def('field_of_study', 'education', 'Branch or major', 'text', { placeholder: 'e.g. Computer Science', ...fact('What is your branch, major or field of study?') }),
  def('graduation_year', 'education', 'Graduation year', 'text', { placeholder: 'e.g. 2027', ...fact('In which year did or will you graduate (four digits)?') }),
  def('gpa', 'education', 'CGPA or percentage', 'text', { placeholder: 'e.g. 8.4 / 10', ...fact('What is your CGPA or percentage, with its scale (for example 8.4 / 10)?') }),
  def('current_title', 'work', 'Current job title', 'text', { hint: 'Leave empty if you are a student.', ...fact('What is your current job title? If you are not employed now, there is no answer.') }),
  def('current_company', 'work', 'Current company', 'text', { hint: 'Leave empty if you are a student.', ...fact('Which company do you work at now? If you are not employed now, there is no answer.') }),
  def('start_date', 'work', 'When can you start?', 'text', { placeholder: 'e.g. Immediately, or June 2027' }),
  def('languages', 'work', 'Languages you speak', 'text', { placeholder: 'e.g. English, Hindi', hint: 'Separate with commas.', ...fact('Which spoken languages do you know, comma separated?') }),
  def('relocate', 'preferences', 'Willing to relocate?', 'yesno'),
  def('onsite', 'preferences', 'Comfortable working from the office?', 'yesno'),
  def('hybrid', 'preferences', 'Comfortable with hybrid work?', 'yesno'),
  def('how_heard', 'preferences', 'How you usually hear about jobs', 'choice', {
    options: ['LinkedIn', 'Company website', 'Job board', 'Referral', 'College placement cell', 'Other'],
    hint: 'Used for "How did you hear about us?".',
  }),
  ...COMMON_QUESTIONS.map((q) => ({
    id: q.id, key: `${COMMON_KEY_PREFIX}${q.id}`, group: 'about' as const, label: q.question, kind: 'long' as const, aiDraft: true, maxChars: 1200,
  })),
  def('gender', 'self_id', 'Gender', 'choice', { options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'], hint: 'Optional. Empty means Nomadic declines to self-identify.' }),
  def('pronouns', 'self_id', 'Pronouns', 'text', { placeholder: 'e.g. she/her', hint: 'Optional.' }),
];

export const GROUP_LABEL: Record<AppAnswerGroup, string> = {
  education: 'Education',
  work: 'Work and availability',
  preferences: 'Preferences',
  about: 'About you',
  self_id: 'Self-identification (optional)',
};

export function isReservedAnswerKey(k: string): boolean {
  return k.startsWith(APP_KEY_PREFIX) || k.startsWith(COMMON_KEY_PREFIX);
}

/** Answers by id from a custom-answers map (only non-empty ones). */
export function readAppAnswers(answers: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of APP_ANSWERS) {
    const v = answers?.[d.key];
    if (typeof v === 'string' && v.trim()) out[d.id] = v.trim();
  }
  return out;
}

/** Writes answers by id into a custom-answers map; empty values remove the key. Other keys are kept. */
export function writeAppAnswers(answers: Record<string, string>, values: Record<string, string>): Record<string, string> {
  const out = { ...answers };
  for (const d of APP_ANSWERS) {
    if (!(d.id in values)) continue;
    const v = (values[d.id] ?? '').trim();
    if (v) out[d.key] = d.maxChars ? v.slice(0, d.maxChars) : v;
    else delete out[d.key];
  }
  return out;
}

/** The candidate's own question/answer pairs (everything that is not a reserved key). */
export function ownAnswers(answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([k]) => !isReservedAnswerKey(k) && !k.startsWith('__') && k !== 'work_authorized'));
}

const yes = (v?: string) => (v === 'Yes' ? true : v === 'No' ? false : undefined);

export interface AutomationFacts {
  university?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: string;
  gpa?: string;
  currentTitle?: string;
  currentCompany?: string;
  earliestStartDate?: string;
  languages?: string[];
  willingToRelocate?: boolean;
  openToOnsite?: boolean;
  openToHybrid?: boolean;
  eeo?: { gender?: string; pronouns?: string };
  commonAnswers?: Record<string, string>;
  howHeard?: string;
}

/** Form-engine profile facts from the stored answers. Unanswered stays undefined. */
export function toAutomationFacts(answers: Record<string, string> | null | undefined): AutomationFacts {
  const a = readAppAnswers(answers);
  const common: Record<string, string> = {};
  for (const q of COMMON_QUESTIONS) if (a[q.id]) common[q.id] = a[q.id];
  const gender = a.gender && a.gender !== 'Prefer not to say' ? a.gender : undefined;
  const eeo = gender || a.pronouns ? { gender, pronouns: a.pronouns } : undefined;
  return {
    university: a.university,
    degree: a.degree,
    fieldOfStudy: a.field_of_study,
    graduationYear: a.graduation_year,
    gpa: a.gpa,
    currentTitle: a.current_title,
    currentCompany: a.current_company,
    earliestStartDate: a.start_date,
    languages: a.languages ? a.languages.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    willingToRelocate: yes(a.relocate),
    openToOnsite: yes(a.onsite),
    openToHybrid: yes(a.hybrid),
    eeo,
    commonAnswers: Object.keys(common).length ? common : undefined,
    howHeard: a.how_heard,
  };
}
