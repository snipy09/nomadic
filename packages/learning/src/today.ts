/** The daily "Today" queue: due reviews first, then the next lesson, within tier limits. */
import { LEARN_LIMITS, type LearnTier } from './gating';
import type { Plan } from './planner';
import { localDay } from './progress';
import { deriveReviewStates, dueReviews } from './sm2';
import { MASTERY_THRESHOLD, type ContentBundle, type LearningEvent, type MasteryMap } from './types';

export type TodayEntry =
  | { kind: 'review'; item_id: string; skill_id: string | null; overdue_days: number }
  | { kind: 'lesson'; lesson_id: string; skill_id: string; estimated_minutes: number };

export interface TodayQueue {
  entries: TodayEntry[];
  practiceUsedToday: number;
  practiceRemaining: number;
  limitReached: boolean;
}

const PRACTICE_TYPES = new Set(['quiz_passed', 'quiz_failed', 'problem_solved', 'review_done']);

export function practiceCountOn(events: LearningEvent[], day: string, tzOffsetMinutes = 0): number {
  return events.filter(
    (e) => PRACTICE_TYPES.has(e.type) && e.item_id && localDay(e.created_at, tzOffsetMinutes) === day
  ).length;
}

export function buildTodayQueue(input: {
  bundle: ContentBundle;
  plan: Plan;
  events: LearningEvent[];
  mastery: MasteryMap;
  tier: LearnTier;
  now: Date;
  tzOffsetMinutes?: number;
  maxReviews?: number;
}): TodayQueue {
  const tz = input.tzOffsetMinutes ?? 0;
  const limit = LEARN_LIMITS[input.tier].practicePerDay;
  const used = practiceCountOn(input.events, localDay(input.now.toISOString(), tz), tz);
  const remaining = Math.max(0, limit - used);

  const reviews = dueReviews(deriveReviewStates(input.events), input.now)
    .slice(0, Math.min(input.maxReviews ?? 20, remaining))
    .map<TodayEntry>((r) => ({
      kind: 'review',
      item_id: r.item_id,
      skill_id: r.skill_id,
      overdue_days: Math.floor((input.now.getTime() - Date.parse(r.due_at)) / 86_400_000),
    }));

  const entries: TodayEntry[] = [...reviews];
  const next = input.plan.skills.find((s) => (input.mastery[s.skill_id] ?? 0) < MASTERY_THRESHOLD);
  if (next) {
    const lesson = input.bundle.lessons.find((l) => l.skill_id === next.skill_id);
    if (lesson && (input.tier !== 'free' || lesson.is_core)) {
      entries.push({
        kind: 'lesson',
        lesson_id: lesson.id,
        skill_id: lesson.skill_id,
        estimated_minutes: lesson.estimated_minutes,
      });
    }
  }
  return {
    entries,
    practiceUsedToday: used,
    practiceRemaining: Number.isFinite(remaining) ? remaining : Number.MAX_SAFE_INTEGER,
    limitReached: remaining === 0,
  };
}
