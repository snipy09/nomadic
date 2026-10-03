/** SM-2 spaced repetition (SuperMemo 2), with review state derived from events. */
import type { LearningEvent } from './types';

export interface ReviewState {
  item_id: string;
  skill_id: string | null;
  repetitions: number;
  interval_days: number;
  ease: number;
  due_at: string;
  last_quality: number;
}

const DAY = 86_400_000;

export function sm2Step(prev: Pick<ReviewState, 'repetitions' | 'interval_days' | 'ease'> | null, quality: number) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { repetitions, interval_days, ease } = prev ?? { repetitions: 0, interval_days: 0, ease: 2.5 };
  if (q < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    interval_days = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval_days * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { repetitions, interval_days, ease: Math.round(ease * 100) / 100 };
}

const DEFAULT_QUALITY: Partial<Record<LearningEvent['type'], number>> = {
  quiz_passed: 4,
  problem_solved: 4,
  quiz_failed: 1,
};

/** Replays item-level events in time order into one review state per item. */
export function deriveReviewStates(events: LearningEvent[]): Map<string, ReviewState> {
  const states = new Map<string, ReviewState>();
  const sorted = [...events].filter((e) => e.item_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of sorted) {
    const quality = e.payload.quality ?? DEFAULT_QUALITY[e.type];
    if (quality === undefined) continue;
    const prev = states.get(e.item_id!) ?? null;
    const next = sm2Step(prev, quality);
    states.set(e.item_id!, {
      item_id: e.item_id!,
      skill_id: e.skill_id,
      ...next,
      due_at: new Date(Date.parse(e.created_at) + next.interval_days * DAY).toISOString(),
      last_quality: quality,
    });
  }
  return states;
}

export function dueReviews(states: Map<string, ReviewState>, now: Date): ReviewState[] {
  return [...states.values()]
    .filter((s) => Date.parse(s.due_at) <= now.getTime())
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.item_id.localeCompare(b.item_id));
}
