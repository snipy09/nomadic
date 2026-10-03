/** Streaks, heatmap, weekly summary and mastery, all derived from learning_events. */
import { MASTERY_THRESHOLD, type LearningEvent, type MasteryMap } from './types';

/** Local calendar day (YYYY-MM-DD) for a UTC offset in minutes (e.g. IST = 330). */
export function localDay(iso: string, tzOffsetMinutes = 0): string {
  return new Date(Date.parse(iso) + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Days with at least one learning event, and seconds spent. */
export function heatmap(
  events: LearningEvent[],
  tzOffsetMinutes = 0
): Map<string, { events: number; seconds: number }> {
  const map = new Map<string, { events: number; seconds: number }>();
  for (const e of events) {
    if (e.payload.source === 'legacy_import') continue;
    const d = localDay(e.created_at, tzOffsetMinutes);
    const cur = map.get(d) ?? { events: 0, seconds: 0 };
    cur.events += 1;
    cur.seconds += e.duration_s;
    map.set(d, cur);
  }
  return map;
}

export interface Streak {
  current: number;
  longest: number;
  activeToday: boolean;
}

/** Current streak survives until the end of today if yesterday was active. */
export function streak(events: LearningEvent[], now: Date, tzOffsetMinutes = 0): Streak {
  const days = new Set(heatmap(events, tzOffsetMinutes).keys());
  const today = localDay(now.toISOString(), tzOffsetMinutes);
  const activeToday = days.has(today);
  let current = 0;
  for (let d = activeToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++;
  let longest = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue;
    let n = 0;
    while (days.has(addDays(d, n))) n++;
    longest = Math.max(longest, n);
  }
  return { current, longest, activeToday };
}

export function weeklySummary(events: LearningEvent[], now: Date, tzOffsetMinutes = 0) {
  const since = addDays(localDay(now.toISOString(), tzOffsetMinutes), -6);
  const recent = events.filter(
    (e) => localDay(e.created_at, tzOffsetMinutes) >= since && e.payload.source !== 'legacy_import'
  );
  return {
    lessons: recent.filter((e) => e.type === 'lesson_viewed').length,
    quizzesPassed: recent.filter((e) => e.type === 'quiz_passed').length,
    problemsSolved: recent.filter((e) => e.type === 'problem_solved').length,
    reviews: recent.filter((e) => e.type === 'review_done').length,
    minutes: Math.round(recent.reduce((n, e) => n + e.duration_s, 0) / 60),
    activeDays: new Set(recent.map((e) => localDay(e.created_at, tzOffsetMinutes))).size,
  };
}

/**
 * A lesson-level check result: `quiz_passed` with no item and `payload.lesson_id`.
 * Item-level attempts carry `item_id` and feed spaced repetition instead.
 */
export function isLessonCheckPass(e: LearningEvent): boolean {
  return e.type === 'quiz_passed' && !e.item_id && typeof e.payload.lesson_id === 'string';
}

/** Lesson ids whose check the user has passed. */
export function completedLessons(events: LearningEvent[]): Set<string> {
  return new Set(events.filter(isLessonCheckPass).map((e) => e.payload.lesson_id as string));
}

/**
 * Mastery per skill (0..1): a weighted average of graded attempts where later
 * attempts count more, floored by placement / "I know this" results and by
 * passed lesson checks.
 * Viewing a lesson alone never counts as mastery.
 */
export function deriveMastery(events: LearningEvent[]): MasteryMap {
  const attempts = new Map<string, number[]>();
  const floors = new Map<string, number>();
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!e.skill_id) continue;
    if (e.type === 'skill_marked_known') {
      floors.set(e.skill_id, Math.max(floors.get(e.skill_id) ?? 0, e.payload.mastery ?? MASTERY_THRESHOLD));
      continue;
    }
    if (isLessonCheckPass(e)) {
      // Passing a lesson's check completes it: the skill counts as mastered (item attempts still count below).
      floors.set(e.skill_id, Math.max(floors.get(e.skill_id) ?? 0, MASTERY_THRESHOLD));
      continue;
    }
    const score =
      e.payload.score ??
      (e.type === 'quiz_passed' || e.type === 'problem_solved' ? 1 : e.type === 'quiz_failed' ? 0 : undefined) ??
      (e.type === 'review_done' && e.payload.quality !== undefined ? e.payload.quality / 5 : undefined);
    if (score === undefined) continue;
    attempts.set(e.skill_id, [...(attempts.get(e.skill_id) ?? []), score]);
  }
  const out: MasteryMap = {};
  for (const id of new Set([...attempts.keys(), ...floors.keys()])) {
    const xs = attempts.get(id) ?? [];
    let num = 0;
    let den = 0;
    xs.forEach((s, i) => {
      const w = i + 1;
      num += s * w;
      den += w;
    });
    // Few attempts => shrink toward 0 so one lucky answer is not "mastered".
    const confidence = Math.min(1, xs.length / 3);
    const fromAttempts = den ? (num / den) * confidence : 0;
    out[id] = Math.round(Math.max(fromAttempts, floors.get(id) ?? 0) * 1000) / 1000;
  }
  return out;
}
