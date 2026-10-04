/**
 * Quiz helpers shared by Learn and onboarding: grading, recall quality, the
 * events a graded quiz appends, the daily practice allowance and the
 * deterministic shuffle for ordering items.
 */
import {
  LEARN_LIMITS,
  gradeQuizItem,
  localDay,
  practiceCountOn,
  qualityFromGrade,
  randomUuid,
  type GradeResult,
  type LearnTier,
  type LearningEvent,
  type QuizAnswer,
} from '@job-automator/learning';
import type { LearningEventInput } from '../../../shared/ipc';
import type { QuizItem } from './content';

/** Local UTC offset in minutes (IST = 330), for streak days. */
export const tzOffsetMinutes = (now: Date) => -now.getTimezoneOffset();

/** Practice attempts left today. Counted per UTC day, like the server. */
export function practiceLeft(events: LearningEvent[], tier: LearnTier, now: Date): { used: number; remaining: number; limit: number } {
  const limit = LEARN_LIMITS[tier].practicePerDay;
  const used = practiceCountOn(events, localDay(now.toISOString(), 0), 0);
  return { used, remaining: Math.max(0, limit - used), limit };
}

// ── Grading and events ──────────────────────────────────────────────────────

export function gradeAll(items: QuizItem[], answers: Record<string, QuizAnswer>): GradeResult[] {
  return items.map((item) => gradeQuizItem(item, answers[item.id] ?? null));
}

/** SM-2 recall quality: right = 5; any wrong answer stays below 3 so the item comes back tomorrow. */
export const recallQuality = (g: GradeResult) => (g.correct ? 5 : Math.min(2, qualityFromGrade(g)));

const at = (now: Date, offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

function itemEvents(
  items: QuizItem[],
  grades: GradeResult[],
  extra: Record<string, unknown>,
  now: Date
): LearningEventInput[] {
  return items.map((item, i) => ({
    id: randomUuid(),
    type: grades[i].correct ? 'quiz_passed' : 'quiz_failed',
    skill_id: item.skill_id,
    item_id: item.id,
    payload: { ...extra, score: grades[i].score, quality: recallQuality(grades[i]) },
    duration_s: 0,
    created_at: at(now, i),
  }));
}

export function reviewEvents(items: QuizItem[], grades: GradeResult[], trackId: string, now: Date): LearningEventInput[] {
  return items.map((item, i) => ({
    id: randomUuid(),
    type: 'review_done',
    skill_id: item.skill_id,
    item_id: item.id,
    payload: { track_id: trackId, score: grades[i].score, quality: recallQuality(grades[i]) },
    duration_s: 0,
    created_at: at(now, i),
  }));
}

/** Item events for a topic quiz; a pass (80%+) also completes the topic's quiz task. */
export function topicQuizEvents(
  topicId: string,
  items: QuizItem[],
  grades: GradeResult[],
  trackId: string,
  now: Date,
  durationS = 0
): { events: LearningEventInput[]; passed: boolean } {
  const right = grades.filter((g) => g.correct).length;
  const passed = grades.length > 0 && right / grades.length >= 0.8;
  const events = itemEvents(items, grades, { topic_id: topicId, track_id: trackId }, now);
  if (passed) {
    events.push({
      id: randomUuid(),
      type: 'quiz_passed',
      skill_id: items[0]?.skill_id ?? null,
      item_id: null,
      payload: { topic_id: topicId, track_id: trackId, score: right / grades.length },
      duration_s: Math.max(0, Math.min(86_400, Math.round(durationS))),
      created_at: at(now, items.length),
    });
  }
  return { events, passed };
}

// ── Ordering items ──────────────────────────────────────────────────────────

/** Deterministic shuffle (by item id) that never shows the steps already in order. */
export function shuffledSteps(id: string, steps: string[]): string[] {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const out = [...steps];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ i, 16777619) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((s, i) => s === steps[i])) out.push(out.shift()!);
  return out;
}
