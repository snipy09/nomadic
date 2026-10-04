/**
 * Intake helpers: defaults, total hours and the deterministic feasibility
 * preview shown before any AI call ("needs ~210 h, you have ~120 h").
 */
import type { CatalogIndex } from './catalog';
import { addDays, daysBetween } from './dates';
import { moduleMinutes } from './expand';
import { selectModules } from './roadmap';
import { buildDays, usableMinutes } from './scheduler';
import { IntakeSchema, type Intake, type IntakeInput } from './types';

export const DURATION_PRESETS_WEEKS = [4, 8, 12, 16, 24, 36, 52] as const;

/** A complete intake from a partial one (start today, 12 weeks, Mon–Sat, 1 h / 2.5 h). */
export function defaultIntake(partial: Partial<IntakeInput> & Pick<IntakeInput, 'role'>, today: string): Intake {
  const start = partial.start_date ?? today;
  return IntakeSchema.parse({
    aim: 'campus',
    start_date: start,
    end_date: addDays(start, 12 * 7 - 1),
    study_days: [1, 2, 3, 4, 5, 6, 0],
    weekday_minutes: 60,
    weekend_minutes: 150,
    streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
    ...partial,
  });
}

/** End date for a duration in weeks from a start date (inclusive range). */
export function endDateForWeeks(start: string, weeks: number): string {
  return addDays(start, weeks * 7 - 1);
}

export function weeksBetween(start: string, end: string): number {
  return Math.max(1, Math.round((daysBetween(start, end) + 1) / 7));
}

/** Minutes per week the student said they have. */
export function weeklyMinutes(intake: Pick<Intake, 'study_days' | 'weekday_minutes' | 'weekend_minutes'>): number {
  return intake.study_days.reduce((n, d) => n + (d === 0 || d === 6 ? intake.weekend_minutes : intake.weekday_minutes), 0);
}

export interface Feasibility {
  /** Minutes the student has in the date range (raw). */
  available_minutes: number;
  /** Minutes left for plan tasks after reviews, revision, mocks and buffers. */
  usable_minutes: number;
  /** Minutes the rules-selected modules need at each emphasis. */
  needed: { light: number; standard: number; deep: number };
  /** full = standard fits; core = only light fits; short = even light does not fit. */
  status: 'full' | 'core' | 'short';
  /** Weeks needed for standard coverage at the current weekly time (null when no time). */
  weeks_for_full: number | null;
  /** Weekly minutes needed for standard coverage within the dates. */
  weekly_minutes_for_full: number | null;
  message: string;
}

const h = (minutes: number) => Math.round(minutes / 60);

export function feasibility(intake: Intake, index: CatalogIndex): Feasibility {
  const modules = selectModules(intake, index);
  const days = buildDays(intake, { dsa: modules.some((m) => m.stream === 'dsa') });
  const available = days.reduce((n, d) => n + d.capacity, 0);
  const usable = usableMinutes(days);
  const needed = { light: 0, standard: 0, deep: 0 };
  for (const m of modules) {
    const mm = moduleMinutes(index, m.id);
    needed.light += mm.light;
    needed.standard += mm.standard;
    needed.deep += mm.deep;
  }
  const status = needed.standard <= usable ? 'full' : needed.light <= usable ? 'core' : 'short';
  const ratio = available > 0 ? usable / available : 0;
  const weekly = weeklyMinutes(intake);
  const weeks = weeksBetween(intake.start_date, intake.end_date);
  const weeks_for_full = weekly > 0 && ratio > 0 ? Math.ceil(needed.standard / (weekly * ratio)) : null;
  const weekly_minutes_for_full = ratio > 0 ? Math.ceil(needed.standard / ratio / weeks / 30) * 30 : null;
  let message: string;
  if (status === 'full') {
    message = `Full coverage needs about ${h(needed.standard)} h. You have about ${h(usable)} h of study time, so it fits.`;
  } else if (status === 'core') {
    message =
      `Full coverage needs about ${h(needed.standard)} h. You have about ${h(usable)} h, so the plan covers the core of every module and leaves out the rest.` +
      (weeks_for_full ? ` For full coverage, pick ${weeks_for_full} weeks or about ${Math.round(((weekly_minutes_for_full ?? 0) / 60) * 10) / 10} h a week.` : '');
  } else {
    message = `Even the core needs about ${h(needed.light)} h and you have about ${h(usable)} h. Add time or a later end date, or some modules will not fit.`;
  }
  return { available_minutes: available, usable_minutes: usable, needed, status, weeks_for_full, weekly_minutes_for_full, message };
}
