/**
 * Learn v2 progress from the event log: done tasks, module and stream
 * progress, the on-track forecast, problem stats, re-solve reviews and skill
 * mastery from completed topics and projects.
 */
import { heatmap, localDay, type Streak } from '../progress';
import { sm2Step, type ReviewState } from '../sm2';
import type { LearningEvent, MasteryMap } from '../types';
import { slugOfRef, type CatalogIndex } from './catalog';
import { addDays, daysBetween } from './dates';
import { moduleTasks } from './expand';
import { entryKey } from './scheduler';
import type { PlanTask, ProblemDifficulty, Schedule, Stream } from './types';

/**
 * Done keys (task ids and `task@part` entry keys). The latest `task_done` per
 * item wins and `payload.undone` unticks; a topic-level `quiz_passed`
 * (`payload.topic_id`, no item) completes `${topic}/quiz`.
 */
export function doneEntries(events: LearningEvent[]): Set<string> {
  const latest = new Map<string, LearningEvent>();
  const out = new Set<string>();
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.type === 'task_done' && e.item_id) latest.set(e.item_id, e);
    if (e.type === 'quiz_passed' && !e.item_id && typeof e.payload.topic_id === 'string') {
      out.add(`${e.payload.topic_id}/quiz`);
    }
  }
  for (const [id, e] of latest) if (!e.payload.undone) out.add(id);
  return out;
}

/** Task ids that are complete: done directly, or every scheduled part done. */
export function doneTaskIds(done: Set<string>, schedule: Schedule | null): Set<string> {
  const out = new Set<string>();
  for (const k of done) if (!k.includes('@')) out.add(k);
  if (schedule) {
    const parts = new Map<string, string[]>();
    for (const d of schedule.days) for (const e of d.tasks) if (e.parts > 1) parts.set(e.task_id, [...(parts.get(e.task_id) ?? []), entryKey(e)]);
    for (const [id, keys] of parts) if (keys.every((k) => done.has(k))) out.add(id);
  }
  return out;
}

export function isEntryDone(done: Set<string>, e: { task_id: string; part: number; parts: number }): boolean {
  return done.has(entryKey(e)) || done.has(e.task_id);
}

export interface ModuleProgress {
  module_id: string;
  stream: Stream;
  tasks_total: number;
  tasks_done: number;
  minutes_total: number;
  minutes_done: number;
  percent: number;
  /** Last scheduled date of the module's tasks (null when none are scheduled). */
  finish_date: string | null;
}

export function moduleProgress(tasks: PlanTask[], doneIds: Set<string>, schedule: Schedule | null): ModuleProgress[] {
  const last = new Map<string, string>();
  for (const d of schedule?.days ?? []) for (const e of d.tasks) last.set(e.task_id, d.date);
  const map = new Map<string, ModuleProgress>();
  for (const t of tasks) {
    const m = map.get(t.module_id) ?? {
      module_id: t.module_id,
      stream: t.stream,
      tasks_total: 0,
      tasks_done: 0,
      minutes_total: 0,
      minutes_done: 0,
      percent: 0,
      finish_date: null,
    };
    m.tasks_total++;
    m.minutes_total += t.minutes;
    if (doneIds.has(t.id)) {
      m.tasks_done++;
      m.minutes_done += t.minutes;
    }
    const d = last.get(t.id);
    if (d && (!m.finish_date || d > m.finish_date)) m.finish_date = d;
    map.set(t.module_id, m);
  }
  return [...map.values()].map((m) => ({ ...m, percent: m.minutes_total ? Math.round((m.minutes_done / m.minutes_total) * 100) : 0 }));
}

export function streamProgress(modules: ModuleProgress[]): Array<{ stream: Stream; minutes_total: number; minutes_done: number; percent: number }> {
  const map = new Map<Stream, { stream: Stream; minutes_total: number; minutes_done: number; percent: number }>();
  for (const m of modules) {
    const s = map.get(m.stream) ?? { stream: m.stream, minutes_total: 0, minutes_done: 0, percent: 0 };
    s.minutes_total += m.minutes_total;
    s.minutes_done += m.minutes_done;
    map.set(m.stream, s);
  }
  return [...map.values()].map((s) => ({ ...s, percent: s.minutes_total ? Math.round((s.minutes_done / s.minutes_total) * 100) : 0 }));
}

export interface Forecast {
  status: 'on_track' | 'behind' | 'ahead';
  /** Planned minutes before today that are not done. */
  behind_minutes: number;
  /** Minutes done from days after today. */
  ahead_minutes: number;
  planned_finish: string | null;
  projected_finish: string | null;
  day_index: number;
  day_count: number;
}

/**
 * On track when at most 30 planned minutes (or one day's worth) before today
 * are undone; ahead when 30+ minutes from future days are done.
 */
export function forecast(schedule: Schedule, done: Set<string>, today: string): Forecast {
  let behind = 0;
  let ahead = 0;
  let plannedFinish: string | null = null;
  const remainingCaps: number[] = [];
  for (const d of schedule.days) {
    if (d.tasks.length) plannedFinish = d.date;
    for (const e of d.tasks) {
      const isDone = isEntryDone(done, e);
      if (d.date < today && !isDone) behind += e.minutes;
      if (d.date > today && isDone) ahead += e.minutes;
    }
    if (d.date >= today && d.capacity > 0) remainingCaps.push(d.capacity);
  }
  const avg = remainingCaps.length ? remainingCaps.reduce((a, b) => a + b, 0) / remainingCaps.length : 0;
  const tolerance = Math.max(30, Math.round(avg));
  const status = behind > tolerance ? 'behind' : ahead >= 30 && behind === 0 ? 'ahead' : 'on_track';
  let projected = plannedFinish;
  if (plannedFinish && status === 'behind' && avg > 0) {
    // Behind work needs extra study days at the average daily capacity (about 7/n calendar days each).
    const studyRatio = remainingCaps.length / Math.max(1, daysBetween(today, schedule.end_date) + 1);
    projected = addDays(plannedFinish, Math.ceil(behind / avg / Math.max(0.1, studyRatio)));
  }
  const day_index = Math.min(schedule.days.length, Math.max(0, daysBetween(schedule.start_date, today) + 1));
  return {
    status,
    behind_minutes: behind,
    ahead_minutes: ahead,
    planned_finish: plannedFinish,
    projected_finish: projected,
    day_index,
    day_count: schedule.days.length,
  };
}

/**
 * The streak over the student's own plan: consecutive days with learning
 * activity, where a planned rest day (no study time, a skipped day or an
 * unused reserve day) neither breaks nor adds to it. Outside the plan every
 * day counts. The current streak survives until the end of today.
 */
export function planStreak(
  events: LearningEvent[],
  schedule: Pick<Schedule, 'days'> | null,
  now: Date,
  tzOffsetMinutes = 0
): Streak {
  const active = new Set(heatmap(events, tzOffsetMinutes).keys());
  const today = localDay(now.toISOString(), tzOffsetMinutes);
  const byDate = new Map((schedule?.days ?? []).map((d) => [d.date, d]));
  const isRest = (date: string) => {
    const d = byDate.get(date);
    return !!d && (d.capacity === 0 || (d.kind === 'buffer' && d.tasks.length === 0));
  };
  const activeToday = active.has(today);
  let current = 0;
  for (let d = activeToday ? today : addDays(today, -1), i = 0; i < 3650; i++, d = addDays(d, -1)) {
    if (active.has(d)) current++;
    else if (!isRest(d)) break;
  }
  let longest = 0;
  let run = 0;
  const first = [...active].sort()[0];
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (active.has(d)) longest = Math.max(longest, ++run);
      else if (!isRest(d)) run = 0;
    }
  }
  return { current, longest: Math.max(longest, current), activeToday };
}

export interface ProblemStats {
  solved: number;
  planned: number;
  byDifficulty: Record<ProblemDifficulty, { solved: number; planned: number }>;
}

export function problemStats(tasks: PlanTask[], doneIds: Set<string>, index: CatalogIndex): ProblemStats {
  const byDifficulty: ProblemStats['byDifficulty'] = {
    easy: { solved: 0, planned: 0 },
    medium: { solved: 0, planned: 0 },
    hard: { solved: 0, planned: 0 },
  };
  let solved = 0;
  let planned = 0;
  for (const t of tasks) {
    if (t.kind !== 'solve' || !t.problem_ref) continue;
    const p = index.problems.get(t.problem_ref);
    if (!p) continue;
    planned++;
    byDifficulty[p.difficulty].planned++;
    if (doneIds.has(t.id)) {
      solved++;
      byDifficulty[p.difficulty].solved++;
    }
  }
  return { solved, planned, byDifficulty };
}

const DAY = 86_400_000;

/**
 * Re-solve reviews: SM-2 over solved problems (`task_done` on a solve task,
 * quality 4) and `problem_attempted` (`item_id` lc:slug, `payload.quality`;
 * 3 when a hint was used). Keyed by `lc:<slug>`.
 */
export function resolveReviews(events: LearningEvent[]): Map<string, ReviewState> {
  const states = new Map<string, ReviewState>();
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of sorted) {
    let ref: string | null = null;
    let quality: number | undefined;
    if (e.type === 'task_done' && e.item_id && /\/solve\/[a-z0-9-]+(?:@\d+)?$/.test(e.item_id) && !e.payload.undone) {
      ref = `lc:${e.item_id.replace(/@\d+$/, '').split('/solve/')[1]}`;
      quality = e.payload.quality ?? (e.payload.hint ? 3 : 4);
    } else if (e.type === 'problem_attempted' && e.item_id?.startsWith('lc:')) {
      ref = e.item_id;
      quality = e.payload.quality ?? (e.payload.hint ? 3 : 4);
    }
    if (!ref || quality === undefined) continue;
    const next = sm2Step(states.get(ref) ?? null, quality);
    states.set(ref, {
      item_id: ref,
      skill_id: e.skill_id,
      ...next,
      due_at: new Date(Date.parse(e.created_at) + next.interval_days * DAY).toISOString(),
      last_quality: quality,
    });
  }
  return states;
}

/**
 * Skill mastery from Learn v2 progress. A topic is complete when its learn
 * task is done and 60%+ of its core (non-optional) tasks are done; a skill's
 * mastery is completed minutes over the core + standard minutes of its topics.
 * `project_done` raises the floor to 0.8 for `payload.skill_ids`.
 */
export function masteryFromProgress(index: CatalogIndex, events: LearningEvent[]): MasteryMap {
  const done = doneEntries(events);
  const solved = new Set<string>();
  const doneLoose = (id: string) => done.has(id) || [...done].some((k) => k.startsWith(`${id}@`));
  for (const k of done) {
    const m = /\/solve\/([a-z0-9-]+)(?:@\d+)?$/.exec(k);
    if (m) solved.add(m[1]);
  }
  const isDone = (t: PlanTask) => doneLoose(t.id) || (t.problem_ref ? solved.has(slugOfRef(t.problem_ref)) : false);
  const total = new Map<string, number>();
  const completed = new Map<string, number>();
  for (const mod of index.catalog.modules) {
    const tasks = moduleTasks(index, { module_id: mod.id, emphasis: 'standard', skip_topics: [] }).filter((t) => t.topic_id);
    const byTopic = new Map<string, PlanTask[]>();
    for (const t of tasks) byTopic.set(t.topic_id!, [...(byTopic.get(t.topic_id!) ?? []), t]);
    for (const [topicId, list] of byTopic) {
      const topic = index.topics.get(topicId);
      if (!topic) continue;
      const skills = topic.skill_ids.length ? topic.skill_ids : mod.skill_ids;
      if (!skills.length) continue;
      const minutes = list.reduce((n, t) => n + t.minutes, 0);
      const core = list.filter((t) => !t.optional);
      const learnDone = doneLoose(`${topicId}/learn`);
      const coreDone = core.filter(isDone).length;
      const complete = learnDone && core.length > 0 && coreDone / core.length >= 0.6;
      for (const s of skills) {
        total.set(s, (total.get(s) ?? 0) + minutes);
        if (complete) completed.set(s, (completed.get(s) ?? 0) + minutes);
      }
    }
  }
  const out: MasteryMap = {};
  for (const [s, t] of total) {
    const c = completed.get(s) ?? 0;
    if (c > 0) out[s] = Math.round(Math.min(1, c / t) * 1000) / 1000;
  }
  for (const e of events) {
    if (e.type !== 'project_done' || !Array.isArray(e.payload.skill_ids)) continue;
    for (const s of e.payload.skill_ids as unknown[]) {
      if (typeof s === 'string') out[s] = Math.max(out[s] ?? 0, 0.8);
    }
  }
  return out;
}

/** The higher of two mastery maps per skill (the feed uses v1 ∪ v2). */
export function mergeMastery(a: MasteryMap, b: MasteryMap): MasteryMap {
  const out: MasteryMap = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

/** Tasks of the roadmap that sit on a date (for Today/Week), with the plan task attached. */
export function tasksById(tasks: PlanTask[]): Map<string, PlanTask> {
  return new Map(tasks.map((t) => [t.id, t]));
}
