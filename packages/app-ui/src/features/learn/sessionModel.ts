/**
 * Pure models for the way a student works through Learn: a day's tasks as a
 * study session in a fixed order (warm-up review → main lesson → its practice →
 * side topic → project / tests), the lesson content behind a topic (catalogue
 * or AI custom module) cut into short screens, this week's sessions and the
 * plan status. Nothing here stores state.
 */
import {
  partSlice,
  type CatalogIndex,
  type LearnTopic,
  type Path,
  type PathWeek,
  type Roadmap,
  type Schedule,
  type Stream,
} from '@job-automator/learning';
import type { EntryView } from './learnModel';

// ── Lesson content ──────────────────────────────────────────────────────────

/** What a lesson teaches, from the catalogue topic or an AI custom-module topic. */
export interface LessonContent {
  topicId: string;
  title: string;
  moduleTitle: string;
  stream: Stream | null;
  summary: string;
  /** The points to learn, in study order ("Name: what exactly to know"). */
  points: string[];
  /** Short recap lines (only when they are not already the points). */
  recap: string[];
  quizItemIds: string[];
  minutes: number;
  /** The catalogue topic (YouTube / ChatGPT links, problems); null for custom topics. */
  topic: LearnTopic | null;
  /** True for content that is AI-drafted and not reviewed yet. */
  unreviewed: boolean;
}

export function lessonContent(topicId: string, roadmap: Pick<Roadmap, 'modules'> | null, index: CatalogIndex): LessonContent | null {
  const topic = index.topics.get(topicId);
  if (topic) {
    const mod = index.modules.get(topic.module_id);
    const points = topic.learn_items.length ? topic.learn_items : topic.key_points;
    return {
      topicId,
      title: topic.title,
      moduleTitle: mod?.title ?? topic.module_id,
      stream: mod?.stream ?? null,
      summary: topic.summary_md,
      points,
      recap: topic.learn_items.length ? topic.key_points : [],
      quizItemIds: topic.quiz_item_ids,
      minutes: topic.learn_minutes,
      topic,
      unreviewed: topic.ai_drafted && topic.status !== 'published',
    };
  }
  for (const m of roadmap?.modules ?? []) {
    const c = m.custom?.topics.find((t) => `${m.module_id}.${t.key}` === topicId);
    if (!c || !m.custom) continue;
    return {
      topicId,
      title: c.title,
      moduleTitle: m.custom.title,
      stream: m.custom.stream,
      summary: c.summary,
      points: [],
      recap: [],
      quizItemIds: [],
      minutes: c.tasks.reduce((n, t) => n + t.minutes, 0),
      topic: null,
      unreviewed: true,
    };
  }
  return null;
}

export interface LessonPoint {
  /** 1-based number across the whole topic (part 2 continues the numbering). */
  n: number;
  /** The bold name before the colon, when the line has one. */
  name: string | null;
  text: string;
  raw: string;
}

const NAMED = /^([^:]{2,60}):\s+(.+)$/;

export function toPoint(raw: string, n: number): LessonPoint {
  const m = NAMED.exec(raw);
  return m ? { n, name: m[1], text: m[2], raw } : { n, name: null, text: raw, raw };
}

/** The points of one part of a lesson (all of them when the lesson is not split). */
export function lessonPoints(points: string[], part = 1, parts = 1): LessonPoint[] {
  const slice = partSlice(points, part, parts);
  const start = parts > 1 && slice.length ? points.indexOf(slice[0]) : 0;
  return slice.map((raw, i) => toPoint(raw, start + i + 1));
}

/** Points cut into screens of 2–3, as even as possible (8 → 3, 3, 2). */
export function chunkPoints<T>(points: T[], max = 3): T[][] {
  if (!points.length) return [];
  const screens = Math.ceil(points.length / max);
  const base = Math.floor(points.length / screens);
  let extra = points.length % screens;
  const out: T[][] = [];
  let i = 0;
  for (let s = 0; s < screens; s++) {
    const size = base + (extra-- > 0 ? 1 : 0);
    out.push(points.slice(i, i + size));
    i += size;
  }
  return out;
}

export type LessonScreen =
  | { kind: 'intro' }
  | { kind: 'points'; points: LessonPoint[] }
  | { kind: 'recap' }
  | { kind: 'check' }
  | { kind: 'practice' }
  | { kind: 'done' };

/** The screens of a lesson in order; screens with nothing to show are left out. */
export function lessonScreens(input: { points: LessonPoint[]; recap: boolean; check: boolean; practice: boolean }): LessonScreen[] {
  return [
    { kind: 'intro' },
    ...chunkPoints(input.points).map((points) => ({ kind: 'points' as const, points })),
    ...(input.recap ? [{ kind: 'recap' as const }] : []),
    ...(input.check ? [{ kind: 'check' as const }] : []),
    ...(input.practice ? [{ kind: 'practice' as const }] : []),
    { kind: 'done' },
  ];
}

// ── Session ─────────────────────────────────────────────────────────────────

export type StepKind = 'review' | 'lesson' | 'handson' | 'practice' | 'check' | 'project' | 'mock' | 'revision' | 'task';

export const STEP_LABEL: Record<StepKind, string> = {
  review: 'Warm-up review',
  lesson: 'Lesson',
  handson: 'Hands-on',
  practice: 'Practice',
  check: 'Check',
  project: 'Project',
  mock: 'Mock test',
  revision: 'Weekly revision',
  task: 'Task',
};

export interface SessionStep {
  id: string;
  kind: StepKind;
  title: string;
  minutes: number;
  done: boolean;
  /** Entries this step covers (a lesson also covers its same-day quiz). */
  views: EntryView[];
  topicId: string | null;
  /** Part of the day's main focus. */
  main: boolean;
}

export interface TopicGroup {
  topicId: string;
  title: string;
  lessons: EntryView[];
  quiz: EntryView | null;
  handson: EntryView[];
  solves: EntryView[];
}

export interface Session {
  /** The day's main topic (or project / test), e.g. "Prefix sums". */
  focus: string | null;
  /** The second topic of the day, when there is one. */
  side: string | null;
  steps: SessionStep[];
  done: number;
  total: number;
  minutes: number;
  minutesLeft: number;
  next: SessionStep | null;
  groups: Map<string, TopicGroup>;
}

const isLearn = (v: EntryView) => v.task.kind === 'learn' || v.task.kind === 'read';

/** The topics of a day with their entries by role. */
export function topicGroups(views: EntryView[], titleOf: (topicId: string) => string): Map<string, TopicGroup> {
  const groups = new Map<string, TopicGroup>();
  for (const v of views) {
    const id = v.task.topic_id;
    if (!id || v.task.project_id) continue;
    const g = groups.get(id) ?? { topicId: id, title: titleOf(id), lessons: [], quiz: null, handson: [], solves: [] };
    if (isLearn(v)) g.lessons.push(v);
    else if (v.task.kind === 'quiz') g.quiz = v;
    else if (v.task.kind === 'solve') g.solves.push(v);
    else g.handson.push(v);
    groups.set(id, g);
  }
  return groups;
}

const minutesOf = (vs: EntryView[]) => vs.reduce((n, v) => n + v.entry.minutes, 0);

/**
 * A day's entries as an ordered session. The main focus is the topic (or
 * project / test) with the most minutes; its steps come first after the
 * warm-up review. A topic's quiz on the same day is part of its lesson.
 */
export function buildSession(input: {
  views: EntryView[];
  titleOf: (topicId: string) => string;
  projectTitleOf?: (projectId: string) => string;
  reviewsDue: number;
  reviewsDoneToday: number;
}): Session {
  const { views, titleOf } = input;
  const groups = topicGroups(views, titleOf);

  // Units of the day in their first-seen order: a topic, a project or a single special task.
  type Unit = { key: string; title: string; minutes: number; order: number; steps: SessionStep[] };
  const units = new Map<string, Unit>();
  let order = 0;
  const unit = (key: string, title: string): Unit => {
    let u = units.get(key);
    if (!u) units.set(key, (u = { key, title, minutes: 0, order: order++, steps: [] }));
    return u;
  };
  const step = (kind: StepKind, title: string, vs: EntryView[], topicId: string | null): SessionStep => ({
    id: vs.map((v) => v.key).join('+'),
    kind,
    title,
    minutes: minutesOf(vs),
    done: vs.every((v) => v.done),
    views: vs,
    topicId,
    main: false,
  });

  for (const v of views) {
    const t = v.task;
    if (t.topic_id && !t.project_id) {
      const g = groups.get(t.topic_id)!;
      const u = unit(`t:${g.topicId}`, g.title);
      u.minutes += v.entry.minutes;
      continue;
    }
    if (t.project_id) {
      const title = input.projectTitleOf?.(t.project_id) ?? t.title;
      const u = unit(`p:${t.project_id}`, title);
      u.minutes += v.entry.minutes;
      u.steps.push(step('project', t.title, [v], null));
      continue;
    }
    const kind: StepKind = t.kind === 'mock' ? 'mock' : t.kind === 'revise' ? 'revision' : 'task';
    const u = unit(`s:${v.key}`, t.title);
    u.minutes += v.entry.minutes;
    u.steps.push(step(kind, t.title, [v], null));
  }

  for (const g of groups.values()) {
    const u = units.get(`t:${g.topicId}`)!;
    g.lessons.forEach((l, i) => {
      const covers = i === 0 && g.quiz ? [l, g.quiz] : [l];
      u.steps.push(step('lesson', g.lessons.length > 1 ? l.task.title : g.title, covers, g.topicId));
    });
    for (const h of g.handson) u.steps.push(step('handson', h.task.title, [h], g.topicId));
    for (const s of g.solves) u.steps.push(step('practice', s.task.title, [s], g.topicId));
    if (g.quiz && !g.lessons.length) u.steps.push(step('check', g.title, [g.quiz], g.topicId));
  }

  const ranked = [...units.values()].sort((a, b) => b.minutes - a.minutes || a.order - b.order);
  const main = ranked[0] ?? null;
  const rest = [...units.values()].filter((u) => u !== main).sort((a, b) => a.order - b.order);
  const steps: SessionStep[] = [];
  if (input.reviewsDue > 0 || input.reviewsDoneToday > 0) {
    const n = input.reviewsDue || input.reviewsDoneToday;
    steps.push({
      id: 'review',
      kind: 'review',
      title: `${n} to review`,
      minutes: Math.max(2, Math.ceil(Math.min(n, 5) * 0.75)),
      done: input.reviewsDue === 0,
      views: [],
      topicId: null,
      main: false,
    });
  }
  if (main) steps.push(...main.steps.map((s) => ({ ...s, main: true })));
  for (const u of rest) steps.push(...u.steps);

  const counted = steps.filter((s) => s.kind !== 'review');
  const minutes = counted.reduce((n, s) => n + s.minutes, 0);
  return {
    focus: main?.title ?? null,
    side: rest.find((u) => u.key.startsWith('t:'))?.title ?? null,
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    minutes,
    minutesLeft: counted.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0),
    next: steps.find((s) => !s.done) ?? null,
    groups,
  };
}

// ── Week and plan ───────────────────────────────────────────────────────────

export interface WeekSummary {
  week: PathWeek | null;
  sessionsDone: number;
  sessionsTotal: number;
  /** The next reserve (catch-up) day this week that has nothing planned, from today on. */
  reserveDate: string | null;
}

/** This week's sessions (the path week that holds `today`, else the week of the next session). */
export function weekSummary(path: Path, schedule: Pick<Schedule, 'days'>, today: string): WeekSummary {
  const week =
    path.weeks.find((w) => w.start <= today && today <= w.end) ??
    path.weeks.find((w) => w.number === path.current?.week) ??
    null;
  if (!week) return { week: null, sessionsDone: 0, sessionsTotal: 0, reserveDate: null };
  const reserve = schedule.days.find((d) => d.date >= today && d.date >= week.start && d.date <= week.end && d.kind === 'buffer' && !d.tasks.length);
  return {
    week,
    sessionsDone: week.days.filter((d) => d.state === 'done').length,
    sessionsTotal: week.days.length,
    reserveDate: reserve?.date ?? null,
  };
}

export interface PlanStatus {
  endDate: string;
  /** Last date with planned work. */
  finishDate: string | null;
  /** Minutes of work that no longer fit before the end date. */
  leftOutMinutes: number;
}

export function planStatus(schedule: Schedule): PlanStatus {
  let finish: string | null = null;
  for (const d of schedule.days) if (d.tasks.length) finish = d.date;
  return {
    endDate: schedule.end_date,
    finishDate: finish,
    leftOutMinutes: schedule.left_out.filter((l) => l.reason === 'no_time').reduce((n, l) => n + l.minutes, 0),
  };
}
