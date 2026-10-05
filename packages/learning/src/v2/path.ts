/**
 * The roadmap as a path of weeks and days ("Week 3: Arrays & Web foundations —
 * Day 2: Prefix sums"). Pure: derived from the schedule, the expanded plan
 * tasks and the done set; nothing here is stored.
 */
import type { CatalogIndex } from './catalog';
import { addDays, daysBetween } from './dates';
import { entryKey, isSpecialTask } from './scheduler';
import type { DayKind, PlanTask, Roadmap, Schedule, ScheduleEntry, Stream } from './types';

export type PathDayState = 'done' | 'today' | 'missed' | 'upcoming';

export interface PathEntry {
  key: string;
  entry: ScheduleEntry;
  /** null for the weekly revision and OA mocks (scheduler-made tasks). */
  task: PlanTask | null;
  done: boolean;
}

export interface PathDay {
  date: string;
  /** Study day number inside its week (1-based). */
  day: number;
  /** Study day number across the whole plan (1-based). */
  index: number;
  week: number;
  kind: DayKind;
  /** What the day is about: its main topic, project stage or test. */
  title: string;
  /** Other topics of the day, joined (empty when there are none). */
  subtitle: string;
  stream: Stream | null;
  module_ids: string[];
  topic_ids: string[];
  minutes: number;
  done: number;
  total: number;
  state: PathDayState;
  entries: PathEntry[];
}

export interface PathModule {
  id: string;
  title: string;
  stream: Stream;
  minutes: number;
}

export interface PathWeek {
  number: number;
  start: string;
  end: string;
  /** The week's main modules, e.g. "Arrays & Web foundations". */
  title: string;
  modules: PathModule[];
  days: PathDay[];
  minutes: number;
  done: number;
  total: number;
}

export interface Path {
  weeks: PathWeek[];
  /** The day to work on now: today when it has work left, else the next day with work (null when all is done). */
  current: { week: number; date: string } | null;
  study_days: number;
  done_days: number;
}

/** Title of a topic id from the catalogue or a custom roadmap module. */
export function topicTitle(topicId: string, roadmap: Pick<Roadmap, 'modules'>, index: CatalogIndex): string {
  const t = index.topics.get(topicId);
  if (t) return t.title;
  for (const m of roadmap.modules) {
    const c = m.custom?.topics.find((x) => `${m.module_id}.${x.key}` === topicId);
    if (c) return c.title;
  }
  return topicId;
}

/** Title of a module id from the catalogue, a custom roadmap module or a project. */
export function moduleTitle(moduleId: string, roadmap: Pick<Roadmap, 'modules'>, index: CatalogIndex): string {
  const m = index.modules.get(moduleId);
  if (m) return m.title;
  const custom = roadmap.modules.find((x) => x.module_id === moduleId)?.custom;
  if (custom) return custom.title;
  if (moduleId.startsWith('project.')) return index.projects.get(moduleId.slice(8))?.title ?? 'Project';
  return moduleId;
}

/** The share of a list a task part covers: part 2 of 3 of 7 items is items 3–5. */
export function partSlice<T>(items: T[], part: number, parts: number): T[] {
  if (parts <= 1 || !items.length) return items;
  const p = Math.min(Math.max(1, part), parts);
  const from = Math.floor(((p - 1) * items.length) / parts);
  const to = Math.floor((p * items.length) / parts);
  // Never leave a part empty: it shows at least the item it starts on.
  return items.slice(from, Math.max(to, from + 1));
}

function weekNumber(start: string, date: string): number {
  return Math.floor(daysBetween(start, date) / 7) + 1;
}

function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  return `${titles.slice(0, -1).join(', ')} & ${titles[titles.length - 1]}`;
}

/** The day's label from its kind and its biggest piece of work. */
function dayTitle(
  kind: DayKind,
  entries: PathEntry[],
  roadmap: Pick<Roadmap, 'modules'>,
  index: CatalogIndex
): { title: string; subtitle: string; stream: Stream | null } {
  const byTitle = new Map<string, { minutes: number; stream: Stream; order: number; learnPart: number | null; learnFirst: boolean; topic: boolean }>();
  let order = 0;
  for (const e of entries) {
    if (!e.task) continue;
    const t = e.task;
    let label: string;
    if (t.topic_id) label = topicTitle(t.topic_id, roadmap, index);
    else if (t.project_id) label = `Build: ${index.projects.get(t.project_id)?.title ?? 'project'}`;
    else if (t.kind === 'mock') label = `${moduleTitle(t.module_id, roadmap, index)} check`;
    else label = t.title;
    const cur = byTitle.get(label) ?? { minutes: 0, stream: t.stream, order: order++, learnPart: null, learnFirst: false, topic: !!t.topic_id };
    cur.minutes += e.entry.minutes;
    if (t.kind === 'learn' || t.kind === 'read') {
      cur.learnPart = e.entry.part;
      if (e.entry.part === 1) cur.learnFirst = true;
    }
    byTitle.set(label, cur);
  }
  const ranked = [...byTitle.entries()].sort((a, b) => b[1].minutes - a[1].minutes || a[1].order - b[1].order);
  const special = entries.find((e) => !e.task);
  if (kind === 'mock' || special?.entry.task_id.startsWith('mock/oa/')) {
    return { title: 'Online assessment mock', subtitle: ranked.map(([t]) => t).slice(0, 2).join(' · '), stream: 'dsa' };
  }
  if (kind === 'revision' || special?.entry.task_id.startsWith('revise/week/')) {
    return { title: 'Weekly revision', subtitle: ranked.map(([t]) => t).slice(0, 2).join(' · '), stream: ranked[0]?.[1].stream ?? null };
  }
  if (!ranked.length) return { title: kind === 'buffer' ? 'Catch-up day' : 'Rest day', subtitle: '', stream: null };
  const [label, top] = ranked[0];
  // A topic over several days reads "(continued)" after its first day and "practice" on days without its lesson.
  const suffix = !top.topic || top.learnFirst ? '' : top.learnPart != null ? ' (continued)' : ': practice';
  return {
    title: `${label}${suffix}`,
    subtitle: ranked.slice(1, 3).map(([t]) => t).join(' · '),
    stream: top.stream,
  };
}

/**
 * Weeks are 7-day blocks from the plan's start date (the same weeks the
 * weekly revision is numbered by). Days without planned work are left out, so
 * "Day 3" is the third day of the week that has work.
 */
export function buildPath(input: {
  schedule: Pick<Schedule, 'start_date' | 'end_date' | 'days'>;
  roadmap: Pick<Roadmap, 'modules'>;
  tasks: Map<string, PlanTask>;
  index: CatalogIndex;
  /** Done entry keys and task ids. */
  done: Set<string>;
  today: string;
}): Path {
  const { schedule, roadmap, tasks, index, done, today } = input;
  const weeks = new Map<number, PathWeek>();
  const moduleMinutes = new Map<number, Map<string, PathModule>>();
  let studyIndex = 0;
  let doneDays = 0;

  for (const d of schedule.days) {
    const number = weekNumber(schedule.start_date, d.date);
    let week = weeks.get(number);
    if (!week) {
      const start = addDays(schedule.start_date, (number - 1) * 7);
      const end = addDays(start, 6);
      week = {
        number,
        start,
        end: end > schedule.end_date ? schedule.end_date : end,
        title: '',
        modules: [],
        days: [],
        minutes: 0,
        done: 0,
        total: 0,
      };
      weeks.set(number, week);
      moduleMinutes.set(number, new Map());
    }
    if (!d.tasks.length) continue;
    const entries: PathEntry[] = d.tasks.map((entry) => {
      const key = entryKey(entry);
      const task = isSpecialTask(entry.task_id) ? null : tasks.get(entry.task_id) ?? null;
      return { key, entry, task, done: done.has(key) || done.has(entry.task_id) };
    });
    // An entry whose task left the plan (an older roadmap) is not shown.
    const shown = entries.filter((e) => e.task || isSpecialTask(e.entry.task_id));
    if (!shown.length) continue;
    studyIndex++;
    const { title, subtitle, stream } = dayTitle(d.kind, shown, roadmap, index);
    const doneCount = shown.filter((e) => e.done).length;
    const allDone = doneCount === shown.length;
    if (allDone) doneDays++;
    const mods = moduleMinutes.get(number)!;
    for (const e of shown) {
      if (!e.task) continue;
      const id = e.task.module_id;
      const m = mods.get(id) ?? { id, title: moduleTitle(id, roadmap, index), stream: e.task.stream, minutes: 0 };
      m.minutes += e.entry.minutes;
      mods.set(id, m);
    }
    const minutes = shown.reduce((n, e) => n + e.entry.minutes, 0);
    week.days.push({
      date: d.date,
      day: week.days.length + 1,
      index: studyIndex,
      week: number,
      kind: d.kind,
      title,
      subtitle,
      stream,
      module_ids: [...new Set(shown.flatMap((e) => (e.task ? [e.task.module_id] : [])))],
      topic_ids: [...new Set(shown.flatMap((e) => (e.task?.topic_id ? [e.task.topic_id] : [])))],
      minutes,
      done: doneCount,
      total: shown.length,
      state: allDone ? 'done' : d.date === today ? 'today' : d.date < today ? 'missed' : 'upcoming',
      entries: shown,
    });
    week.minutes += minutes;
    week.done += doneCount;
    week.total += shown.length;
  }

  for (const [number, week] of weeks) {
    week.modules = [...moduleMinutes.get(number)!.values()].sort((a, b) => b.minutes - a.minutes);
    const main = week.modules.slice(0, 2).map((m) => m.title);
    week.title = main.length ? joinTitles(main) : week.days.length ? 'Revision and mock tests' : 'Rest week';
  }

  const list = [...weeks.values()].sort((a, b) => a.number - b.number);
  const days = list.flatMap((w) => w.days);
  const todayDay = days.find((d) => d.date === today && d.state !== 'done');
  const next = todayDay ?? days.find((d) => d.date > today && d.state !== 'done') ?? null;
  return {
    weeks: list,
    current: next ? { week: next.week, date: next.date } : null,
    study_days: days.length,
    done_days: doneDays,
  };
}
