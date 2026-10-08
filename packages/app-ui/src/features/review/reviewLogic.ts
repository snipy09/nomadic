// In-app review after the trial week: the 10 System Usability Scale statements (asked in this
// order and wording, the score depends on it), a 0-10 recommend question and two open questions.

export const SUS_STATEMENTS = [
  'I think I would like to use Nomadic frequently.',
  'I found Nomadic unnecessarily complex.',
  'I thought Nomadic was easy to use.',
  'I think I would need help from a technical person to use Nomadic.',
  'I found the various functions in Nomadic were well integrated.',
  'I thought there was too much inconsistency in Nomadic.',
  'I imagine most people would learn to use Nomadic very quickly.',
  'I found Nomadic very awkward to use.',
  'I felt very confident using Nomadic.',
  'I needed to learn a lot of things before I could get going with Nomadic.',
] as const;

export const MAX_REVIEW_TEXT = 2_000;
/** "Not now" asks again after this many days. */
export const SNOOZE_DAYS = 3;
/** Wait after the app opens before asking, so the review never interrupts the first thing the user does. */
export const ASK_DELAY_MS = 20_000;

export interface ReviewForm {
  recommend: number | null;
  best: string;
  frustrating: string;
  /** One answer per statement, 1-5, null until answered. */
  sus: (number | null)[];
}

export const EMPTY_REVIEW: ReviewForm = { recommend: null, best: '', frustrating: '', sus: SUS_STATEMENTS.map(() => null) };

/** System Usability Scale score, 0-100: odd statements (a-1), even statements (5-a), summed, times 2.5. */
export function susScore(answers: readonly number[]): number {
  if (answers.length !== 10) throw new Error('SUS needs 10 answers');
  const sum = answers.reduce((acc, a, i) => acc + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

export function firstStepComplete(f: ReviewForm): boolean {
  return f.recommend !== null;
}

export function unansweredStatements(f: ReviewForm): number[] {
  return f.sus.flatMap((a, i) => (a === null ? [i] : []));
}

/** True when the device has not snoozed the review, or the snooze has passed. */
export function snoozeOver(snoozedUntil: string | null, now: Date): boolean {
  if (!snoozedUntil) return true;
  const t = Date.parse(snoozedUntil);
  return Number.isNaN(t) || t <= now.getTime();
}

export function snoozeUntil(now: Date, days = SNOOZE_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}
