/**
 * Pure Learn logic for the renderer: the path (deterministic planner over the
 * skill graph), the Today queue, and the events each action appends. Nothing
 * here stores state; everything is derived from the goal and the event log.
 */
import {
  LEARN_LIMITS,
  MASTERY_THRESHOLD,
  buildSkillGraph,
  buildTodayQueue,
  deriveMastery,
  gradeQuizItem,
  hardPrerequisiteClosure,
  lessonCheckPassed,
  localDay,
  planTrack,
  practiceCountOn,
  qualityFromGrade,
  randomUuid,
  streak,
  topoSort,
  weeklySummary,
  type GradeResult,
  type LearnTier,
  type LearningEvent,
  type Lesson,
  type MasteryMap,
  type Plan,
  type QuizAnswer,
  type RoleFamilyId,
  type Streak,
} from '@job-automator/learning';
import type { LearningEventInput, LearningEventRecord, LearningGoalInput } from '../../../shared/ipc';
import { bundle, lessonForSkill, quizItemById, skillById, type QuizItem } from './content';

export type Pace = LearningGoalInput['daily_hours'];
export type Horizon = LearningGoalInput['horizon_months'];

/** Study days per week the planner assumes (planTrack's default). */
export const STUDY_DAYS_PER_WEEK = 5;
export const DEFAULT_PACE: Pace = 2;
export const DEFAULT_HORIZON: Horizon = 3;

export const PACE_OPTIONS: Array<{ value: Pace; label: string; description: string }> = [
  { value: 1, label: '5 hours a week', description: 'About an hour a day, 5 days a week' },
  { value: 2, label: '10 hours a week', description: 'About 2 hours a day, 5 days a week' },
  { value: 4, label: '20 hours a week', description: 'About 4 hours a day, 5 days a week' },
];

export const HORIZON_OPTIONS: Array<{ value: Horizon; label: string; description: string }> = [
  { value: 1, label: '1 month', description: 'A focused sprint' },
  { value: 3, label: '3 months', description: 'One semester' },
  { value: 6, label: '6 months', description: 'Before placement season' },
];

/** Events from the main process are validated there on the way in. */
export const asEvents = (records: LearningEventRecord[]): LearningEvent[] => records as unknown as LearningEvent[];

const graph = buildSkillGraph(bundle.skills, bundle.prerequisites);

// ── Path ────────────────────────────────────────────────────────────────────

export type SkillState = 'mastered' | 'in_progress' | 'available' | 'locked';

export interface PathStep {
  skillId: string;
  name: string;
  description: string;
  level: number;
  /** Planned week (1-based); 0 for skills already mastered. */
  week: number;
  hours: number;
  state: SkillState;
  mastery: number;
  lessonId: string | null;
  /** Hard prerequisites not yet mastered (why a step is locked). */
  blockedBy: string[];
  prerequisiteOnly: boolean;
}

export interface PathModel {
  role: RoleFamilyId;
  plan: Plan;
  mastery: MasteryMap;
  /** Skills of this goal already mastered (kept visible when the goal or pace changes). */
  done: PathStep[];
  /** Planned skills in study order. */
  steps: PathStep[];
  /** Role skills that do not fit the horizon at this pace. */
  deferred: string[];
  /** The first step that can be studied now. */
  next: PathStep | null;
}

const isMastered = (mastery: MasteryMap, id: string) => (mastery[id] ?? 0) >= MASTERY_THRESHOLD;

/** Skills with any recorded activity (viewed, attempted, self-reported). */
function touchedSkills(events: LearningEvent[]): Set<string> {
  return new Set(events.map((e) => e.skill_id).filter((id): id is string => Boolean(id)));
}

export function planFor(goal: LearningGoalInput, mastery: MasteryMap): Plan {
  return planTrack({
    bundle,
    role: goal.track_id as RoleFamilyId,
    mastery,
    horizonMonths: goal.horizon_months,
    dailyHours: goal.daily_hours,
    daysPerWeek: STUDY_DAYS_PER_WEEK,
  });
}

export function buildPath(goal: LearningGoalInput, events: LearningEvent[]): PathModel {
  const mastery = deriveMastery(events);
  const plan = planFor(goal, mastery);
  const touched = touchedSkills(events);
  const step = (id: string, week: number, hours: number, prerequisiteOnly: boolean): PathStep => {
    const skill = skillById(id);
    const blockedBy = (graph.hard.get(id) ?? []).filter((p) => !isMastered(mastery, p));
    const m = mastery[id] ?? 0;
    const state: SkillState = m >= MASTERY_THRESHOLD
      ? 'mastered'
      : blockedBy.length
        ? 'locked'
        : touched.has(id) ? 'in_progress' : 'available';
    return {
      skillId: id,
      name: skill?.name ?? id,
      description: skill?.description ?? '',
      level: skill?.level ?? 1,
      week,
      hours,
      state,
      mastery: m,
      lessonId: lessonForSkill(id)?.id ?? null,
      blockedBy,
      prerequisiteOnly,
    };
  };

  const roleSkills = bundle.role_skills.filter((r) => r.role_id === goal.track_id).map((r) => r.skill_id);
  const relevant = new Set([...roleSkills, ...hardPrerequisiteClosure(graph, roleSkills)]);
  const planned = new Set(plan.skills.map((s) => s.skill_id));
  const doneIds = topoSort(graph, [...relevant].filter((id) => isMastered(mastery, id) && !planned.has(id)));
  const roleSet = new Set(roleSkills);

  const steps = plan.skills.map((s) => step(s.skill_id, s.week, s.hours, s.prerequisite_only));
  return {
    role: plan.role,
    plan,
    mastery,
    done: doneIds.map((id) => step(id, 0, 0, !roleSet.has(id))),
    steps,
    deferred: plan.deferred,
    next: steps.find((s) => s.state === 'in_progress' || s.state === 'available') ?? null,
  };
}

/** One-line summary of a plan for previews ("12 skills over 13 weeks"). */
export function planSummary(plan: Plan): string {
  const n = plan.skills.length;
  const lastWeek = plan.skills.reduce((w, s) => Math.max(w, s.week), 0);
  return `${n} ${n === 1 ? 'skill' : 'skills'} over ${Math.max(1, lastWeek)} ${lastWeek === 1 ? 'week' : 'weeks'}`;
}

// ── Today ───────────────────────────────────────────────────────────────────

export interface TodayModel {
  reviews: Array<{ item: QuizItem; overdueDays: number }>;
  lesson: Lesson | null;
  streak: Streak;
  week: { activeDays: number; target: number };
  limit: number;
  practiceUsed: number;
  practiceRemaining: number;
  limitReached: boolean;
}

/** Local UTC offset in minutes (IST = 330), for streak days. */
export const tzOffsetMinutes = (now: Date) => -now.getTimezoneOffset();

/** Practice attempts left today. Counted per UTC day, like the server. */
export function practiceLeft(events: LearningEvent[], tier: LearnTier, now: Date): { used: number; remaining: number; limit: number } {
  const limit = LEARN_LIMITS[tier].practicePerDay;
  const used = practiceCountOn(events, localDay(now.toISOString(), 0), 0);
  return { used, remaining: Math.max(0, limit - used), limit };
}

export function buildToday(path: PathModel, events: LearningEvent[], tier: LearnTier, now: Date): TodayModel {
  const queue = buildTodayQueue({ bundle, plan: path.plan, events, mastery: path.mastery, tier, now, tzOffsetMinutes: 0 });
  const reviews = queue.entries
    .filter((e): e is Extract<typeof e, { kind: 'review' }> => e.kind === 'review')
    .map((e) => ({ item: quizItemById(e.item_id), overdueDays: e.overdue_days }))
    .filter((r): r is { item: QuizItem; overdueDays: number } => Boolean(r.item));
  const tz = tzOffsetMinutes(now);
  const left = practiceLeft(events, tier, now);
  return {
    reviews,
    lesson: path.next?.lessonId ? lessonForSkill(path.next.skillId) ?? null : null,
    streak: streak(events, now, tz),
    week: { activeDays: weeklySummary(events, now, tz).activeDays, target: STUDY_DAYS_PER_WEEK },
    limit: left.limit,
    practiceUsed: left.used,
    practiceRemaining: left.remaining,
    limitReached: left.remaining === 0,
  };
}

// ── Grading and events ──────────────────────────────────────────────────────

export function gradeAll(items: QuizItem[], answers: Record<string, QuizAnswer>): GradeResult[] {
  return items.map((item) => gradeQuizItem(item, answers[item.id] ?? null));
}

/** SM-2 recall quality: right = 5; any wrong answer stays below 3 so the item comes back tomorrow. */
export const recallQuality = (g: GradeResult) => (g.correct ? 5 : Math.min(2, qualityFromGrade(g)));

const at = (now: Date, offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

export function lessonViewedEvent(lesson: Lesson, trackId: string, now: Date): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'lesson_viewed',
    skill_id: lesson.skill_id,
    item_id: null,
    payload: { lesson_id: lesson.id, track_id: trackId },
    duration_s: 0,
    created_at: now.toISOString(),
  };
}

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

/**
 * Events for a graded lesson check or placement ("I already know this") check.
 * Each item is recorded (it enters spaced repetition); a pass also records the
 * lesson completion (lesson check) or a mastery floor (placement).
 */
export function checkEvents(
  mode: 'lesson' | 'placement',
  lesson: Lesson,
  items: QuizItem[],
  grades: GradeResult[],
  trackId: string,
  now: Date,
  durationS = 0
): { events: LearningEventInput[]; passed: boolean } {
  const passed = lessonCheckPassed(grades);
  const base = { lesson_id: lesson.id, track_id: trackId, ...(mode === 'placement' ? { source: 'placement' } : {}) };
  const events = itemEvents(items, grades, base, now);
  const score = grades.length ? grades.filter((g) => g.correct).length / grades.length : 0;
  const duration = Math.max(0, Math.min(86_400, Math.round(durationS)));
  if (passed && mode === 'lesson') {
    events.push({
      id: randomUuid(), type: 'quiz_passed', skill_id: lesson.skill_id, item_id: null,
      payload: { lesson_id: lesson.id, track_id: trackId, score }, duration_s: duration, created_at: at(now, items.length),
    });
  } else if (passed) {
    events.push({
      id: randomUuid(), type: 'skill_marked_known', skill_id: lesson.skill_id, item_id: null,
      payload: { source: 'placement', mastery: MASTERY_THRESHOLD, score, track_id: trackId }, duration_s: duration, created_at: at(now, items.length),
    });
  } else if (duration && events.length) {
    events[events.length - 1] = { ...events[events.length - 1], duration_s: duration };
  }
  return { events, passed };
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

/** Self-reported mastery (below the mastered threshold): those skills take less time but still need a check. */
export const SELF_REPORTED_MASTERY = 0.5;

export function selfReportedEvents(skillIds: string[], trackId: string, now: Date): LearningEventInput[] {
  return skillIds.map((skill_id, i) => ({
    id: randomUuid(),
    type: 'skill_marked_known',
    skill_id,
    item_id: null,
    payload: { source: 'onboarding', mastery: SELF_REPORTED_MASTERY, track_id: trackId },
    duration_s: 0,
    created_at: at(now, i),
  }));
}

/** Mastery from self-reported skills only (for the onboarding preview, before anything is saved). */
export const selfReportedMastery = (skillIds: string[]): MasteryMap =>
  Object.fromEntries(skillIds.map((id) => [id, SELF_REPORTED_MASTERY]));

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
