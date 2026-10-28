/**
 * The roadmap intake as one question per page. Pure: which pages a mode shows,
 * whether a page can be left, and the plain-language recap on the last page.
 */
import { ROLE_SHARES, STREAMS, endDateForWeeks, formatDay, type Stream } from '@job-automator/learning';
import { roleById } from './content';
import { AIM_OPTIONS, LANGUAGE_OPTIONS, LEVEL_OPTIONS, WEEKDAY_CHIPS, formatMinutes, streamLabel, type IntakeDraft } from './learnModel';

export type IntakeStepId = 'role' | 'aim' | 'duration' | 'schedule' | 'level' | 'language' | 'focus' | 'extras' | 'summary';

export interface IntakeStepDef {
  id: IntakeStepId;
  /** Short name for the progress rail. */
  label: string;
  /** The question the page asks. */
  title: string;
  description: string;
  optional?: boolean;
}

export const INTAKE_STEPS: Record<IntakeStepId, IntakeStepDef> = {
  role: { id: 'role', label: 'Role', title: 'Which role are you preparing for?', description: 'The roadmap picks modules, problems and projects for this role.' },
  aim: { id: 'aim', label: 'Goal', title: 'What are you preparing for?', description: 'Campus drives test aptitude too; off-campus and switching focus on skills and interviews.' },
  duration: { id: 'duration', label: 'Duration', title: 'How long do you have?', description: 'Pick when you want to be ready. You can change it later and the plan moves with you.' },
  schedule: { id: 'schedule', label: 'Schedule', title: 'When can you study?', description: 'Pick your study days and how much time you have on a weekday and on a weekend day.' },
  level: { id: 'level', label: 'Level', title: 'Where are you starting from?', description: 'Be honest: topics you already know get lighter, and nothing is skipped silently.' },
  language: { id: 'language', label: 'Language', title: 'Which language will you use for DSA?', description: 'Your problems, templates and language basics follow this choice.' },
  focus: { id: 'focus', label: 'Focus', title: 'What should the plan cover?', description: 'Keep everything on for a complete preparation, or switch off what you do not need.' },
  extras: { id: 'extras', label: 'Extras', title: 'Anything else the plan should know?', description: 'Exam weeks, trips and target companies. All optional.', optional: true },
  summary: { id: 'summary', label: 'Review', title: 'Your plan at a glance', description: 'Check the details, then build your week-by-week roadmap.' },
};

/** Streams a role's roadmap can hold: a zero share (DSA and Core CS for product and design) is never asked about. */
export function roleStreams(role: IntakeDraft['role']): Stream[] {
  const shares = ROLE_SHARES[role];
  return STREAMS.filter((s) => !shares || (shares[s] ?? 0) > 0);
}

/** Streams the level page asks about: the role's streams, aptitude only for campus drives. */
export function levelStreams(d: Pick<IntakeDraft, 'role' | 'aim'>): Array<'dsa' | 'core_cs' | 'dev' | 'aptitude'> {
  const on = roleStreams(d.role);
  return (['dsa', 'core_cs', 'dev', 'aptitude'] as const).filter((s) => on.includes(s) && (s !== 'aptitude' || d.aim === 'campus'));
}

/** The intake's name for a stream: "Development" reads as product or design skills for those roles. */
export function intakeStreamLabel(s: Stream, role: IntakeDraft['role']): string {
  if (s === 'dev' && role === 'product-manager') return 'Product skills';
  if (s === 'dev' && role === 'design') return 'Design skills';
  return streamLabel(s);
}

/** Pages for Learn (everything) or onboarding (the short version). */
export function intakeSteps(mode: 'full' | 'short', draft: Pick<IntakeDraft, 'role'>): IntakeStepId[] {
  const lang = roleStreams(draft.role).includes('dsa') ? (['language'] as const) : [];
  return mode === 'full'
    ? ['role', 'aim', 'duration', 'schedule', 'level', ...lang, 'focus', 'extras', 'summary']
    : ['role', 'aim', 'duration', 'schedule', 'level', ...lang, 'summary'];
}

/** Why a page cannot be left yet (null when it can). */
export function stepProblem(step: IntakeStepId, d: IntakeDraft, roleChosen = true): string | null {
  switch (step) {
    case 'role':
      return roleChosen ? null : 'Pick the role you are preparing for.';
    case 'schedule': {
      if (!d.studyDays.length) return 'Pick at least one study day.';
      const weekend = d.studyDays.some((x) => x === 0 || x === 6);
      const weekday = d.studyDays.some((x) => x >= 1 && x <= 5);
      if ((weekday && d.weekdayMinutes <= 0) || (weekend && d.weekendMinutes <= 0)) return 'Set how much time you have on your study days.';
      return null;
    }
    case 'duration':
      return d.weeks >= 1 && d.weeks <= 104 ? null : 'Pick a duration between 1 and 104 weeks.';
    case 'focus':
      return roleStreams(d.role).some((s) => d.streams.includes(s)) ? null : 'Keep at least one area on.';
    default:
      return null;
  }
}

/** Study minutes in one week of the draft's schedule. */
export function weeklyMinutes(d: Pick<IntakeDraft, 'studyDays' | 'weekdayMinutes' | 'weekendMinutes'>): number {
  return d.studyDays.reduce((n, day) => n + (day === 0 || day === 6 ? d.weekendMinutes : d.weekdayMinutes), 0);
}

export interface RecapRow {
  step: IntakeStepId;
  label: string;
  value: string;
}

/** The recap on the summary page, one row per answer, each linking back to its page. */
export function intakeRecap(d: IntakeDraft, steps: IntakeStepId[]): RecapRow[] {
  const rows: RecapRow[] = [];
  const has = (s: IntakeStepId) => steps.includes(s);
  if (has('role')) rows.push({ step: 'role', label: 'Role', value: roleById(d.role)?.name ?? d.role });
  if (has('aim')) rows.push({ step: 'aim', label: 'Preparing for', value: AIM_OPTIONS.find((a) => a.value === d.aim)?.label ?? d.aim });
  if (has('duration')) {
    rows.push({ step: 'duration', label: 'Duration', value: `${d.weeks} weeks · ${formatDay(d.startDate, false)} to ${formatDay(endDateForWeeks(d.startDate, d.weeks), false)}` });
  }
  if (has('schedule')) {
    const days = WEEKDAY_CHIPS.filter((c) => d.studyDays.includes(c.day)).map((c) => c.label);
    const weekday = d.studyDays.some((x) => x >= 1 && x <= 5);
    const weekend = d.studyDays.some((x) => x === 0 || x === 6);
    const parts = [
      days.length === 7 ? 'Every day' : days.join(', '),
      weekday ? `${formatMinutes(d.weekdayMinutes)} on weekdays` : null,
      weekend ? `${formatMinutes(d.weekendMinutes)} on weekends` : null,
    ].filter(Boolean);
    rows.push({ step: 'schedule', label: 'Schedule', value: `${parts.join(' · ')} (${formatMinutes(weeklyMinutes(d))} a week)` });
  }
  if (has('level')) {
    const levels = levelStreams(d).map((s) => `${intakeStreamLabel(s, d.role)}: ${LEVEL_OPTIONS.find((l) => l.value === d.levels[s])?.label.toLowerCase()}`);
    rows.push({ step: 'level', label: 'Level', value: levels.join(' · ') });
  }
  if (has('language')) rows.push({ step: 'language', label: 'DSA language', value: LANGUAGE_OPTIONS.find((l) => l.value === d.language)?.label ?? d.language });
  if (has('focus')) {
    const all = roleStreams(d.role);
    const on = all.filter((s) => d.streams.includes(s)).map((s) => intakeStreamLabel(s, d.role));
    rows.push({ step: 'focus', label: 'Covers', value: on.length === all.length ? 'Everything' : on.join(', ') });
  }
  if (has('extras')) {
    const bits = [
      d.blackouts.length ? `${d.blackouts.length} ${d.blackouts.length === 1 ? 'day' : 'days'} off` : null,
      d.companies.length ? `${d.companies.length} target ${d.companies.length === 1 ? 'company' : 'companies'}` : null,
      d.note.trim() ? 'a note for the planner' : null,
    ].filter(Boolean);
    rows.push({ step: 'extras', label: 'Extras', value: bits.length ? bits.join(', ') : 'None' });
  }
  return rows;
}
