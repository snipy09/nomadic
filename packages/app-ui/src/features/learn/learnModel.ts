/**
 * Pure Learn v2 logic for the renderer: the intake draft, the Today, Week,
 * Roadmap-tree and Progress models, and the events each action appends.
 * Nothing here stores state; everything derives from the roadmap, the schedule
 * and the append-only event log.
 */
import {
  DURATION_PRESETS_WEEKS,
  IntakeSchema,
  STREAMS,
  STREAM_LABELS,
  deriveReviewStates,
  doneEntries,
  doneTaskIds,
  dueReviews,
  endDateForWeeks,
  entryKey,
  expandRoadmap,
  feasibility,
  forecast,
  localDay,
  localToday,
  moduleProgress,
  planStreak,
  problemStats,
  randomUuid,
  resolveReviews,
  streamProgress,
  weeksBetween,
  type Aim,
  type CatalogIndex,
  type DsaLanguage,
  type Feasibility,
  type Forecast,
  type Intake,
  type IntakeInput,
  type LearningEvent,
  type Level,
  type ModuleProgress,
  type PlanTask,
  type ProblemStats,
  type RoleFamilyId,
  type Roadmap,
  type Schedule,
  type ScheduleDay,
  type ScheduleEntry,
  type Stream,
  type Streak,
  type TaskKind,
} from '@job-automator/learning';
import type { LearningEventInput } from '@nomadic/app-core/shared/ipc';
import { quizItemById, type QuizItem } from './content';
import { tzOffsetMinutes } from './quizLogic';

/** Today's local calendar day. */
export const todayOf = (now: Date): string => localToday(now, tzOffsetMinutes(now));

export function formatMinutes(m: number): string {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (!h) return `${min} min`;
  return min ? `${h} h ${min} min` : `${h} h`;
}

export const KIND_LABEL: Record<TaskKind, string> = {
  learn: 'Learn',
  read: 'Read',
  solve: 'Solve',
  quiz: 'Quiz',
  build: 'Build',
  practice: 'Practise',
  revise: 'Revise',
  mock: 'Mock',
};

export const streamLabel = (s: Stream) => STREAM_LABELS[s];

// ── Intake ──────────────────────────────────────────────────────────────────

export interface IntakeDraft {
  role: RoleFamilyId;
  aim: Aim;
  startDate: string;
  weeks: number;
  studyDays: number[];
  weekdayMinutes: number;
  weekendMinutes: number;
  blackouts: string[];
  levels: Record<'dsa' | 'core_cs' | 'dev' | 'aptitude', Level>;
  language: DsaLanguage;
  knownSkillIds: string[];
  companies: string[];
  note: string;
  streams: Stream[];
}

export const WEEK_PRESETS = DURATION_PRESETS_WEEKS;
export const MINUTE_STEPS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480] as const;
export const WEEKDAY_CHIPS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
] as const;

export const AIM_OPTIONS: Array<{ value: Aim; label: string }> = [
  { value: 'campus', label: 'Campus placement' },
  { value: 'internship', label: 'Internship' },
  { value: 'offcampus', label: 'Off-campus job' },
  { value: 'switch', label: 'Switching roles' },
];

export const LEVEL_OPTIONS: Array<{ value: Level; label: string }> = [
  { value: 'new', label: 'New to it' },
  { value: 'some', label: 'Know some' },
  { value: 'comfortable', label: 'Comfortable' },
];

export const LANGUAGE_OPTIONS: Array<{ value: DsaLanguage; label: string }> = [
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
];

export function defaultIntakeDraft(role: RoleFamilyId, today: string): IntakeDraft {
  return {
    role,
    aim: 'campus',
    startDate: today,
    weeks: 12,
    studyDays: [1, 2, 3, 4, 5, 6, 0],
    weekdayMinutes: 60,
    weekendMinutes: 150,
    blackouts: [],
    levels: { dsa: 'new', core_cs: 'new', dev: 'new', aptitude: 'new' },
    language: 'cpp',
    knownSkillIds: [],
    companies: [],
    note: '',
    streams: [...STREAMS],
  };
}

export function draftToIntake(d: IntakeDraft): IntakeInput {
  return {
    role: d.role,
    aim: d.aim,
    start_date: d.startDate,
    end_date: endDateForWeeks(d.startDate, d.weeks),
    study_days: [...d.studyDays].sort(),
    weekday_minutes: d.weekdayMinutes,
    weekend_minutes: d.weekendMinutes,
    blackouts: d.blackouts.filter((b) => b >= d.startDate).slice(0, 60),
    streams: d.streams.length ? d.streams : [...STREAMS],
    levels: d.levels,
    language: d.language,
    known_skill_ids: d.knownSkillIds.slice(0, 150),
    companies: d.companies.slice(0, 10),
    note: d.note.trim().slice(0, 500),
  };
}

export function intakeToDraft(i: Intake): IntakeDraft {
  return {
    role: i.role,
    aim: i.aim,
    startDate: i.start_date,
    weeks: weeksBetween(i.start_date, i.end_date),
    studyDays: i.study_days,
    weekdayMinutes: i.weekday_minutes,
    weekendMinutes: i.weekend_minutes,
    blackouts: i.blackouts,
    levels: i.levels,
    language: i.language,
    knownSkillIds: i.known_skill_ids,
    companies: i.companies,
    note: i.note,
    streams: i.streams,
  };
}

/** The first problem with a draft, or null when it can be used. */
export function draftProblem(d: IntakeDraft): string | null {
  if (!d.studyDays.length) return 'Pick at least one study day.';
  const weekend = d.studyDays.some((x) => x === 0 || x === 6);
  const weekday = d.studyDays.some((x) => x >= 1 && x <= 5);
  if ((weekday && d.weekdayMinutes <= 0) || (weekend && d.weekendMinutes <= 0) || (!weekday && !weekend)) {
    return 'Set how much time you have on your study days.';
  }
  if (d.weeks < 1 || d.weeks > 104) return 'Pick a duration between 1 and 104 weeks.';
  return IntakeSchema.safeParse(draftToIntake(d)).success ? null : 'Some plan details are not valid.';
}

export function feasibilityOf(d: IntakeDraft, index: CatalogIndex): Feasibility | null {
  if (draftProblem(d)) return null;
  return feasibility(IntakeSchema.parse(draftToIntake(d)), index);
}

// ── Tasks and entries ───────────────────────────────────────────────────────

/** Tasks the scheduler adds itself (weekly revision, OA mocks). */
function specialTask(id: string, stream: Stream): PlanTask | null {
  if (id.startsWith('revise/week/')) {
    return { id, kind: 'revise', title: `Weekly revision (week ${id.slice(12)})`, minutes: 0, stream, module_id: 'revision', topic_id: null, optional: false, splittable: false };
  }
  if (id.startsWith('mock/oa/')) {
    return { id, kind: 'mock', title: `Online assessment mock ${id.slice(8)}`, minutes: 0, stream: 'dsa', module_id: 'mock', topic_id: null, optional: false, splittable: false };
  }
  return null;
}

export interface EntryView {
  key: string;
  entry: ScheduleEntry;
  task: PlanTask;
  done: boolean;
}

export interface Progress {
  tasks: PlanTask[];
  byId: Map<string, PlanTask>;
  /** Done entry keys and task ids. */
  done: Set<string>;
  doneTasks: Set<string>;
}

export function progressOf(roadmap: Roadmap, schedule: Schedule | null, events: LearningEvent[], index: CatalogIndex): Progress {
  const tasks = expandRoadmap(roadmap, index);
  const done = doneEntries(events);
  return { tasks, byId: new Map(tasks.map((t) => [t.id, t])), done, doneTasks: doneTaskIds(done, schedule) };
}

export function entryViews(day: ScheduleDay | null | undefined, p: Progress): EntryView[] {
  if (!day) return [];
  return day.tasks.flatMap((entry) => {
    const task = p.byId.get(entry.task_id) ?? specialTask(entry.task_id, entry.stream);
    if (!task) return [];
    const key = entryKey(entry);
    return [{ key, entry, task, done: p.done.has(key) || p.done.has(entry.task_id) }];
  });
}

// ── Today ───────────────────────────────────────────────────────────────────

export interface TodayModel {
  date: string;
  day: ScheduleDay | null;
  dayIndex: number;
  dayCount: number;
  entries: EntryView[];
  minutesPlanned: number;
  minutesDone: number;
  /** Planned entries before today that are not done. */
  missed: number;
  forecast: Forecast;
  streak: Streak;
  reviews: QuizItem[];
  /** Review answers recorded today (the warm-up shows as done once the due ones are answered). */
  reviewsDoneToday: number;
  /** Problems due for a re-solve (refs). */
  resolveDue: string[];
  /** The next date with planned work after today (null when none). */
  nextStudyDate: string | null;
  beforeStart: boolean;
  afterEnd: boolean;
}

export function buildTodayModel(input: {
  schedule: Schedule;
  progress: Progress;
  events: LearningEvent[];
  now: Date;
  maxReviews?: number;
}): TodayModel {
  const { schedule, progress, events, now } = input;
  const date = todayOf(now);
  const day = schedule.days.find((d) => d.date === date) ?? null;
  const entries = entryViews(day, progress);
  let missed = 0;
  for (const d of schedule.days) {
    if (d.date >= date) break;
    for (const e of d.tasks) if (!progress.done.has(entryKey(e)) && !progress.done.has(e.task_id)) missed++;
  }
  const reviews = dueReviews(deriveReviewStates(events), now)
    .map((r) => quizItemById(r.item_id))
    .filter((x): x is QuizItem => !!x)
    .slice(0, input.maxReviews ?? 10);
  const resolveDue = [...resolveReviews(events).values()]
    .filter((s) => Date.parse(s.due_at) <= now.getTime())
    .map((s) => s.item_id)
    .slice(0, 5);
  const next = schedule.days.find((d) => d.date > date && d.tasks.length);
  return {
    date,
    day,
    dayIndex: Math.max(0, schedule.days.findIndex((d) => d.date === date)) + 1,
    dayCount: schedule.days.length,
    entries,
    minutesPlanned: entries.reduce((n, e) => n + e.entry.minutes, 0) + (day?.review_minutes ?? 0),
    minutesDone: entries.filter((e) => e.done).reduce((n, e) => n + e.entry.minutes, 0),
    missed,
    forecast: forecast(schedule, progress.done, date),
    streak: planStreak(events, schedule, now, tzOffsetMinutes(now)),
    reviews,
    reviewsDoneToday: events.filter((e) => e.type === 'review_done' && localDay(e.created_at, tzOffsetMinutes(now)) === date).length,
    resolveDue,
    nextStudyDate: next?.date ?? null,
    beforeStart: date < schedule.start_date,
    afterEnd: date > schedule.end_date,
  };
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface ProgressModel {
  streams: ReturnType<typeof streamProgress>;
  modules: ModuleProgress[];
  problems: ProblemStats;
  minutesDone: number;
  minutesPlannedToDate: number;
}

export function progressModel(schedule: Schedule, p: Progress, index: CatalogIndex, today: string): ProgressModel {
  const modules = moduleProgress(p.tasks, p.doneTasks, schedule);
  let plannedToDate = 0;
  let doneMinutes = 0;
  for (const d of schedule.days) {
    for (const e of d.tasks) {
      const done = p.done.has(entryKey(e)) || p.done.has(e.task_id);
      if (d.date <= today) plannedToDate += e.minutes;
      if (done) doneMinutes += e.minutes;
    }
  }
  return {
    streams: streamProgress(modules),
    modules,
    problems: problemStats(p.tasks, p.doneTasks, index),
    minutesDone: doneMinutes,
    minutesPlannedToDate: plannedToDate,
  };
}

// ── Events ──────────────────────────────────────────────────────────────────

function skillOf(task: PlanTask, index: CatalogIndex): string | null {
  const topic = task.topic_id ? index.topics.get(task.topic_id) : undefined;
  return topic?.skill_ids[0] ?? index.modules.get(task.module_id)?.skill_ids[0] ?? null;
}

/** Ticks a task (or one part of it). `durationS` is the time the student spent, when known. */
export function taskDoneEvent(
  task: PlanTask,
  key: string,
  plannedMinutes: number,
  durationS: number,
  trackId: string,
  index: CatalogIndex,
  now: Date,
  extra: Record<string, unknown> = {}
): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'task_done',
    skill_id: skillOf(task, index),
    item_id: key,
    payload: {
      planned_minutes: plannedMinutes,
      task_kind: task.kind,
      topic_id: task.topic_id ?? undefined,
      module_id: task.module_id,
      stream: task.stream,
      track_id: trackId,
      ...(task.problem_ref ? { problem_ref: task.problem_ref } : {}),
      ...extra,
    },
    duration_s: Math.max(0, Math.min(86_400, Math.round(durationS))),
    created_at: now.toISOString(),
  };
}

/** Unticks a task: the latest event per item wins. */
export function untickEvent(task: PlanTask, key: string, trackId: string, index: CatalogIndex, now: Date): LearningEventInput {
  return { ...taskDoneEvent(task, key, 0, 0, trackId, index, now), payload: { undone: true, track_id: trackId } };
}

/** A solved problem of the plan: ticks its task and feeds re-solve reviews (quality 4, or 3 with a hint). */
export function solvedEvent(task: PlanTask, key: string, durationS: number, hint: boolean, trackId: string, index: CatalogIndex, now: Date): LearningEventInput {
  return taskDoneEvent(task, key, task.minutes, durationS, trackId, index, now, { hint, quality: hint ? 3 : 4 });
}

/** Problem refs the student has solved: ticked solve tasks and attempts recorded outside the plan. */
export function solvedRefs(done: Set<string>, events: LearningEvent[]): Set<string> {
  const out = new Set<string>();
  for (const k of done) {
    const m = /\/solve\/([a-z0-9-]+)(?:@\d+)?$/.exec(k);
    if (m) out.add(`lc:${m[1]}`);
  }
  for (const e of events) if (e.type === 'problem_attempted' && e.item_id?.startsWith('lc:')) out.add(e.item_id);
  return out;
}

/** A problem attempt outside the plan ("solved", "needed a hint"). */
export function problemAttemptedEvent(ref: string, hint: boolean, trackId: string, now: Date): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'problem_attempted',
    skill_id: 'dsa',
    item_id: ref,
    payload: { hint, quality: hint ? 3 : 4, track_id: trackId },
    duration_s: 0,
    created_at: now.toISOString(),
  };
}

/** "I already know this": marks the topic's learn task done. */
export function knowThisEvent(topicId: string, skillId: string | null, trackId: string, now: Date): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'task_done',
    skill_id: skillId,
    item_id: `${topicId}/learn`,
    payload: { source: 'placement', topic_id: topicId, track_id: trackId },
    duration_s: 0,
    created_at: now.toISOString(),
  };
}

/** Problem refs of a topic as rows for the problem table (curated tiers and company boosts). */
export function topicProblems(
  topicId: string,
  roadmap: Roadmap | null,
  index: CatalogIndex
): Array<{ ref: string; tier: 'must' | 'good' | 'stretch' | 'company'; company?: string }> {
  const topic = index.topics.get(topicId);
  if (!topic) return [];
  const rows: Array<{ ref: string; tier: 'must' | 'good' | 'stretch' | 'company'; company?: string }> = [
    ...topic.problems.must.map((ref) => ({ ref, tier: 'must' as const })),
    ...topic.problems.good.map((ref) => ({ ref, tier: 'good' as const })),
    ...topic.problems.stretch.map((ref) => ({ ref, tier: 'stretch' as const })),
  ];
  const boost = roadmap?.boosts.find((b) => b.topic_id === topicId);
  for (const p of boost?.problems ?? []) rows.push({ ref: p.ref, tier: 'company', company: boost?.companies[p.ref] });
  return rows;
}

export const isTopicTask = (t: PlanTask) => !!t.topic_id;
