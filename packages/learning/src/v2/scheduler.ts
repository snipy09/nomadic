/**
 * Day-wise scheduler: calendar with buffer, revision and OA-mock days, packing
 * of plan tasks into days by stream share, fitting a roadmap to the time
 * available, re-planning from today, day actions and the personal pace factor.
 * Deterministic: the same inputs always give the same days.
 */
import type { CatalogIndex } from './catalog';
import { addDays, dateRange, dayOfWeek, isWeekend } from './dates';
import { expandRoadmap, totalMinutes } from './expand';
import type {
  Emphasis,
  Intake,
  LeftOut,
  PlanTask,
  Roadmap,
  Schedule,
  ScheduleDay,
  ScheduleEntry,
  Stream,
} from './types';
import type { LearningEvent } from '../types';

export const OVERRUN_MINUTES = 10;
export const MIN_SPLIT_MINUTES = 20;
export const REVIEW_RESERVE_MINUTES = 10;
export const FIT_FACTOR = 0.97;
export const OA_MOCK_MINUTES = 90;

export const PACE_CHIPS = { less: 0.7, planned: 1, more: 1.4 } as const;

// ── Calendar ────────────────────────────────────────────────────────────────

/** Minutes the student said they have on a date (0 on non-study days and blackouts). */
export function baseCapacity(
  intake: Pick<Intake, 'study_days' | 'weekday_minutes' | 'weekend_minutes' | 'blackouts'>,
  date: string
): number {
  if (!intake.study_days.includes(dayOfWeek(date)) || intake.blackouts.includes(date)) return 0;
  return isWeekend(date) ? intake.weekend_minutes : intake.weekday_minutes;
}

/**
 * Dated days from the intake with their kinds: buffer (last study day of each
 * 14-day block with 3+ study days, plans of 14+ days), revision (last non-buffer
 * study day of each 7-day block with 2+ study days), OA mock (DSA plans of 21+
 * days, in the last third, a weekend study day every 14 days) and the review
 * reserve (10 min from the 3rd study day on, on days with 40+ minutes).
 */
export function buildDays(
  intake: Pick<Intake, 'start_date' | 'end_date' | 'study_days' | 'weekday_minutes' | 'weekend_minutes' | 'blackouts'>,
  opts: { dsa?: boolean } = {}
): ScheduleDay[] {
  const dates = dateRange(intake.start_date, intake.end_date);
  const days: ScheduleDay[] = dates.map((date) => {
    const capacity = Math.min(600, baseCapacity(intake, date));
    return { date, kind: capacity > 0 ? 'study' : 'off', capacity, review_minutes: 0, tasks: [] };
  });
  const n = days.length;
  const isStudy = (d: ScheduleDay) => d.capacity > 0;
  if (n >= 14) {
    for (let b = 0; b < n; b += 14) {
      const block = days.slice(b, b + 14).filter(isStudy);
      if (block.length >= 3) block[block.length - 1].kind = 'buffer';
    }
  }
  for (let b = 0; b < n; b += 7) {
    const block = days.slice(b, b + 7).filter(isStudy);
    if (block.length < 2) continue;
    const last = [...block].reverse().find((d) => d.kind === 'study');
    if (last) last.kind = 'revision';
  }
  if (opts.dsa && n >= 21) {
    let next = Math.floor((n * 2) / 3);
    for (let i = next; i < n; i++) {
      const d = days[i];
      if (i >= next && d.kind === 'study' && isWeekend(d.date)) {
        d.kind = 'mock';
        next = i + 14;
      }
    }
  }
  let studied = 0;
  for (const d of days) {
    if (!isStudy(d)) continue;
    studied++;
    if (studied >= 3 && d.capacity >= 40) d.review_minutes = REVIEW_RESERVE_MINUTES;
  }
  return days;
}

/** Minutes of a revision day given to the weekly revision block. */
export function revisionMinutes(day: Pick<ScheduleDay, 'capacity' | 'review_minutes'>): number {
  return Math.round((day.capacity - day.review_minutes) * 0.5);
}

export function mockMinutes(day: Pick<ScheduleDay, 'capacity' | 'review_minutes'>): number {
  return Math.min(OA_MOCK_MINUTES, day.capacity - day.review_minutes);
}

/** Minutes left for plan tasks on a day after reserves and special blocks. */
export function packableMinutes(day: ScheduleDay, useBuffers = false): number {
  const base = Math.max(0, day.capacity - day.review_minutes);
  switch (day.kind) {
    case 'off':
      return 0;
    case 'buffer':
      return useBuffers ? base : 0;
    case 'revision':
      return base - revisionMinutes(day);
    case 'mock':
      return base - mockMinutes(day);
    default:
      return base;
  }
}

// ── Entries ─────────────────────────────────────────────────────────────────

/** `task_id@part` when the task is split, else the task id. */
export function entryKey(e: Pick<ScheduleEntry, 'task_id' | 'part' | 'parts'>): string {
  return e.parts > 1 ? `${e.task_id}@${e.part}` : e.task_id;
}

export function taskIdOfKey(key: string): string {
  const at = key.lastIndexOf('@');
  return at > 0 ? key.slice(0, at) : key;
}

export function isSpecialTask(taskId: string): boolean {
  return taskId.startsWith('revise/week/') || taskId.startsWith('mock/oa/');
}

/** Renumbers parts so every entry of a task carries its part and the parts total. */
export function fixParts(days: ScheduleDay[]): ScheduleDay[] {
  const count = new Map<string, number>();
  for (const d of days) for (const e of d.tasks) count.set(e.task_id, (count.get(e.task_id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return days.map((d) => ({
    ...d,
    tasks: d.tasks.map((e) => {
      const part = (seen.get(e.task_id) ?? 0) + 1;
      seen.set(e.task_id, part);
      return { ...e, part, parts: count.get(e.task_id)! };
    }),
  }));
}

// ── Packing ─────────────────────────────────────────────────────────────────

export interface PendingTask {
  task: PlanTask;
  /** Paced minutes still to place. */
  remaining: number;
}

export interface PackInput {
  tasks: PlanTask[];
  days: ScheduleDay[];
  /** Percent per stream (any scale; normalised over streams that have tasks). */
  shares: Partial<Record<Stream, number>>;
  pace?: number;
  useBuffers?: boolean;
  /** Raw minutes already done per task id (partly done split tasks). */
  doneMinutes?: Map<string, number>;
  /** Plan start date; numbers the revision weeks and OA mocks. */
  planStart?: string;
  /** Special tasks already done (revision/mock ids). */
  doneSpecial?: Set<string>;
  /** OA mocks before the first packed day (numbering continues after them). */
  mockOffset?: number;
  /** Minutes per stream already placed on earlier days (keeps stream deficits stable on a re-plan). */
  packedBefore?: Partial<Record<Stream, number>>;
}

export interface PackResult {
  days: ScheduleDay[];
  overflow: PendingTask[];
}

export function paced(minutes: number, pace = 1): number {
  return Math.max(1, Math.round(minutes * pace));
}

function specialEntries(day: ScheduleDay, input: PackInput, mockCounter: { n: number }): ScheduleEntry[] {
  const start = input.planStart ?? day.date;
  if (day.kind === 'revision') {
    const w = Math.floor((Date.parse(day.date) - Date.parse(start)) / (7 * 86_400_000)) + 1;
    const id = `revise/week/${w}`;
    const minutes = revisionMinutes(day);
    if (minutes <= 0 || input.doneSpecial?.has(id)) return [];
    return [{ task_id: id, minutes, stream: topStream(input.shares), part: 1, parts: 1 }];
  }
  if (day.kind === 'mock') {
    mockCounter.n += 1;
    const id = `mock/oa/${mockCounter.n}`;
    const minutes = mockMinutes(day);
    if (minutes <= 0 || input.doneSpecial?.has(id)) return [];
    return [{ task_id: id, minutes, stream: 'dsa', part: 1, parts: 1 }];
  }
  return [];
}

function topStream(shares: Partial<Record<Stream, number>>): Stream {
  let best: Stream = 'dsa';
  let max = -1;
  for (const [s, v] of Object.entries(shares) as Array<[Stream, number]>) {
    if ((v ?? 0) > max) {
      max = v ?? 0;
      best = s;
    }
  }
  return best;
}

/**
 * Packs tasks into days in order, one queue per stream. Each day takes at most
 * two streams, picked by the largest deficit against the target share; a task
 * fits if the day stays within capacity + 10 min; splittable tasks are split
 * when the day is empty or 20+ minutes remain. A task longer than any day can
 * hold is split wherever it starts.
 */
export function packTasks(input: PackInput): PackResult {
  const pace = input.pace ?? 1;
  const queues = new Map<Stream, PendingTask[]>();
  for (const task of input.tasks) {
    const done = input.doneMinutes?.get(task.id) ?? 0;
    const remaining = paced(Math.max(task.minutes - done, Math.min(10, task.minutes)), pace);
    const q = queues.get(task.stream) ?? [];
    q.push({ task, remaining });
    queues.set(task.stream, q);
  }
  const packed = new Map<Stream, number>(Object.entries(input.packedBefore ?? {}) as Array<[Stream, number]>);
  // Shares are normalised over the streams this plan has work in (pending or already placed).
  const planStreams = new Set<Stream>([...queues.keys(), ...[...packed.entries()].filter(([, v]) => v > 0).map(([s]) => s)]);
  const shareTotal = [...planStreams].reduce((n, s) => n + Math.max(0, input.shares[s] ?? 0), 0);
  const share = (s: Stream) =>
    shareTotal > 0 ? Math.max(0, input.shares[s] ?? 0) / shareTotal : 1 / Math.max(1, planStreams.size);
  let packedTotal = [...packed.values()].reduce((n, v) => n + v, 0);
  const maxDay = Math.max(0, ...input.days.map((d) => packableMinutes(d, input.useBuffers)));
  const mockCounter = { n: input.mockOffset ?? 0 };

  const days = input.days.map((template) => {
    const day: ScheduleDay = { ...template, tasks: specialEntries(template, input, mockCounter) };
    const avail = packableMinutes(template, input.useBuffers);
    let used = 0;
    const dayStreams = new Set<Stream>();
    while (avail > 0) {
      const candidates = [...queues.entries()]
        .filter(([, q]) => q.length)
        .map(([s]) => s)
        .filter((s) => dayStreams.size < 2 || dayStreams.has(s))
        // Deficit against where the plan should stand at the end of this day; larger shares win ties.
        .sort(
          (a, b) =>
            share(b) * (packedTotal + avail) - (packed.get(b) ?? 0) - (share(a) * (packedTotal + avail) - (packed.get(a) ?? 0)) ||
            share(b) - share(a) ||
            a.localeCompare(b)
        );
      let placed = false;
      for (const s of candidates) {
        const q = queues.get(s)!;
        const head = q[0];
        const room = avail - used;
        let minutes: number;
        if (used + head.remaining <= avail + OVERRUN_MINUTES) {
          minutes = head.remaining;
          q.shift();
        } else if (
          room > 0 &&
          (used === 0 || room >= MIN_SPLIT_MINUTES) &&
          (head.task.splittable || head.remaining > maxDay)
        ) {
          minutes = room;
          head.remaining -= room;
        } else continue;
        day.tasks.push({ task_id: head.task.id, minutes, stream: s, part: 1, parts: 1 });
        used += minutes;
        packed.set(s, (packed.get(s) ?? 0) + minutes);
        dayStreams.add(s);
        placed = true;
        break;
      }
      if (!placed) break;
    }
    packedTotal += used;
    return day;
  });
  const overflow = [...queues.values()].flat();
  overflow.sort((a, b) => input.tasks.indexOf(a.task) - input.tasks.indexOf(b.task));
  return { days, overflow };
}

// ── Fitting a roadmap ───────────────────────────────────────────────────────

export function roadmapHasDsa(roadmap: Pick<Roadmap, 'modules'>, index: CatalogIndex): boolean {
  return roadmap.modules.some((m) => (m.custom ? m.custom.stream === 'dsa' : index.modules.get(m.module_id)?.stream === 'dsa'));
}

/** Packable minutes of a calendar (no buffers). */
export function usableMinutes(days: ScheduleDay[]): number {
  return days.reduce((n, d) => n + packableMinutes(d), 0);
}

const LOWER: Record<Emphasis, Emphasis | null> = { deep: 'standard', standard: 'light', light: null };

export interface FitResult {
  roadmap: Roadmap;
  schedule: Schedule;
  tasks: PlanTask[];
}

/**
 * Fits a roadmap to the calendar at 97% of capacity: drops optional tasks from
 * the later modules first, then lowers emphasis (deep → standard → light) from
 * the last modules, then leaves what still does not fit out as `no_time`.
 */
export function fitRoadmap(
  roadmap: Roadmap,
  index: CatalogIndex,
  opts: { pace?: number; now?: Date } = {}
): FitResult {
  const pace = opts.pace ?? 1;
  const days = buildDays(roadmap.intake, { dsa: roadmapHasDsa(roadmap, index) });
  const budget = usableMinutes(days) * FIT_FACTOR;
  const original = expandRoadmap(roadmap, index);
  const need = (tasks: PlanTask[]) => tasks.reduce((n, t) => n + paced(t.minutes, pace), 0);

  let current: Roadmap = { ...roadmap, modules: roadmap.modules.map((m) => ({ ...m })) };
  let tasks = original;
  const dropped = new Set<string>();
  if (need(tasks) > budget) {
    const order = new Map(current.modules.map((m, i) => [m.module_id, i]));
    const optional = tasks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.optional)
      .sort((a, b) => (order.get(b.t.module_id) ?? 1e9) - (order.get(a.t.module_id) ?? 1e9) || b.i - a.i);
    let total = need(tasks);
    for (const { t } of optional) {
      if (total <= budget) break;
      dropped.add(t.id);
      total -= paced(t.minutes, pace);
    }
    tasks = tasks.filter((t) => !dropped.has(t.id));
  }
  for (const from of ['deep', 'standard'] as Emphasis[]) {
    for (let i = current.modules.length - 1; i >= 0 && need(tasks) > budget; i--) {
      const m = current.modules[i];
      if (m.custom || m.emphasis !== from) continue;
      current = {
        ...current,
        modules: current.modules.map((x, j) => (j === i ? { ...x, emphasis: LOWER[from]! } : x)),
      };
      tasks = expandRoadmap(current, index).filter((t) => !dropped.has(t.id));
    }
  }
  const { days: packedDays, overflow } = packTasks({
    tasks,
    days,
    shares: current.streams,
    pace,
    planStart: current.intake.start_date,
  });
  const kept = new Set(tasks.map((t) => t.id));
  const left_out: LeftOut[] = [
    ...original
      .filter((t) => !kept.has(t.id))
      .map((t) => ({ task_id: t.id, minutes: t.minutes, reason: dropped.has(t.id) ? ('optional' as const) : ('emphasis' as const) })),
    ...overflow.map((p) => ({ task_id: p.task.id, minutes: Math.max(1, Math.round(p.remaining / pace)), reason: 'no_time' as const })),
  ];
  const schedule: Schedule = {
    roadmap_id: current.id,
    generated_at: (opts.now ?? new Date()).toISOString(),
    start_date: current.intake.start_date,
    end_date: current.intake.end_date,
    pace_factor: pace,
    days: fixParts(packedDays),
    left_out,
  };
  return { roadmap: current, schedule, tasks };
}

// ── Re-planning ─────────────────────────────────────────────────────────────

export interface Shortfall {
  /** Paced minutes that did not fit. */
  minutes: number;
  task_ids: string[];
  options: {
    extend_to: string | null;
    weekend_minutes: number | null;
    drop_optional: number | null;
  };
}

export interface ReplanResult {
  schedule: Schedule;
  moved: number;
  shortfall: Shortfall | null;
  usedBuffers: boolean;
}

function firstDates(days: ScheduleDay[], skip?: (e: ScheduleEntry, d: ScheduleDay) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of days) for (const e of d.tasks) if (!skip?.(e, d) && !out.has(e.task_id)) out.set(e.task_id, d.date);
  return out;
}

/**
 * Re-plans from `today`: days before today keep only their done entries (missed
 * work moves forward); every task that is not done is repacked from today on,
 * using buffer days only when needed. `templates: 'intake'` rebuilds future days
 * from the intake (after an adjustment); `'keep'` keeps their kinds and
 * capacities (so a skipped day stays skipped).
 */
export function replan(input: {
  schedule: Schedule;
  roadmap: Roadmap;
  index: CatalogIndex;
  /** Done entry keys and task ids. */
  done: Set<string>;
  today: string;
  pace?: number;
  templates?: 'keep' | 'intake';
  now?: Date;
}): ReplanResult {
  const { schedule, roadmap, index, done, today } = input;
  const pace = input.pace ?? schedule.pace_factor ?? 1;
  const isDone = (e: ScheduleEntry) => done.has(entryKey(e)) || done.has(e.task_id);
  const past = schedule.days
    .filter((d) => d.date < today)
    .map((d) => ({ ...d, tasks: d.tasks.filter(isDone) }));

  const intakeDays = buildDays(roadmap.intake, { dsa: roadmapHasDsa(roadmap, index) });
  let future: ScheduleDay[];
  if (input.templates === 'intake') {
    future = intakeDays.filter((d) => d.date >= today);
  } else {
    const kept = new Map(schedule.days.map((d) => [d.date, d]));
    future = intakeDays.filter((d) => d.date >= today).map((d) => kept.get(d.date) ?? d);
  }

  const doneMinutes = new Map<string, number>();
  const doneTasks = new Set<string>();
  for (const d of schedule.days) {
    for (const e of d.tasks) {
      if (done.has(e.task_id)) doneTasks.add(e.task_id);
      else if (isDone(e)) doneMinutes.set(e.task_id, (doneMinutes.get(e.task_id) ?? 0) + e.minutes / pace);
    }
  }
  const dropped = new Set(schedule.left_out.filter((l) => l.reason !== 'no_time').map((l) => l.task_id));
  const all = expandRoadmap(roadmap, index);
  // A split task is done when every one of its entries is done.
  const entriesOf = new Map<string, ScheduleEntry[]>();
  for (const d of schedule.days) for (const e of d.tasks) entriesOf.set(e.task_id, [...(entriesOf.get(e.task_id) ?? []), e]);
  for (const [id, es] of entriesOf) if (es.length > 1 && es.every(isDone)) doneTasks.add(id);
  const pending = all.filter((t) => !doneTasks.has(t.id) && !done.has(t.id) && !dropped.has(t.id));
  const doneSpecial = new Set([...done].filter(isSpecialTask));

  const base = {
    tasks: pending,
    shares: roadmap.streams,
    pace,
    doneMinutes,
    planStart: schedule.start_date,
    doneSpecial,
    // Mock numbering counts the mock days before today too.
    mockOffset: schedule.days.filter((d) => d.date < today && d.kind === 'mock').length,
    packedBefore: past.reduce<Partial<Record<Stream, number>>>((acc, d) => {
      for (const e of d.tasks) if (!isSpecialTask(e.task_id)) acc[e.stream] = (acc[e.stream] ?? 0) + e.minutes;
      return acc;
    }, {}),
  };
  let result = packTasks({ ...base, days: future });
  let usedBuffers = false;
  if (result.overflow.length && future.some((d) => d.kind === 'buffer')) {
    result = packTasks({ ...base, days: future, useBuffers: true });
    usedBuffers = true;
  }
  const days = fixParts([...past, ...result.days]);

  const before = firstDates(schedule.days, (e, d) => d.date < today && isDone(e));
  const after = firstDates(days.filter((d) => d.date >= today));
  let moved = 0;
  for (const [id, date] of before) if (after.has(id) && after.get(id) !== date) moved++;

  const left_out: LeftOut[] = [
    ...schedule.left_out.filter((l) => l.reason !== 'no_time'),
    ...result.overflow.map((p) => ({ task_id: p.task.id, minutes: Math.max(1, Math.round(p.remaining / pace)), reason: 'no_time' as const })),
  ];
  const next: Schedule = {
    ...schedule,
    generated_at: (input.now ?? new Date()).toISOString(),
    end_date: roadmap.intake.end_date,
    pace_factor: pace,
    days,
    left_out,
  };
  return {
    schedule: next,
    moved,
    usedBuffers,
    shortfall: result.overflow.length ? shortfallOptions(result.overflow, roadmap.intake, days, today, pending) : null,
  };
}

/** The three ways out of a shortfall: a later end date, more weekend minutes, or fewer optional tasks. */
export function shortfallOptions(
  overflow: PendingTask[],
  intake: Intake,
  days: ScheduleDay[],
  today: string,
  pending: PlanTask[]
): Shortfall {
  const minutes = overflow.reduce((n, p) => n + p.remaining, 0);
  let extend_to: string | null = null;
  let acc = 0;
  for (let i = 1, d = addDays(intake.end_date, 1); i <= 365; i++, d = addDays(d, 1)) {
    acc += Math.max(0, baseCapacity(intake, d) - REVIEW_RESERVE_MINUTES);
    if (acc >= minutes) {
      extend_to = d;
      break;
    }
  }
  const weekends = days.filter(
    (d) => d.date >= today && isWeekend(d.date) && intake.study_days.includes(dayOfWeek(d.date)) && !intake.blackouts.includes(d.date)
  ).length;
  let weekend_minutes: number | null = null;
  if (weekends > 0) {
    const extra = Math.ceil(minutes / weekends / 15) * 15;
    weekend_minutes = intake.weekend_minutes + extra <= 600 ? intake.weekend_minutes + extra : null;
  }
  let drop_optional: number | null = null;
  const optional = pending.filter((t) => t.optional).reverse();
  let freed = 0;
  for (let k = 0; k < optional.length; k++) {
    freed += optional[k].minutes;
    if (freed >= minutes) {
      drop_optional = k + 1;
      break;
    }
  }
  return { minutes, task_ids: overflow.map((p) => p.task.id), options: { extend_to, weekend_minutes, drop_optional } };
}

// ── Day actions ─────────────────────────────────────────────────────────────

/** "Can't study today": today's capacity becomes 0, then everything re-plans. */
export function skipToday(input: Parameters<typeof replan>[0]): ReplanResult {
  const days = input.schedule.days.map((d) =>
    d.date === input.today ? { ...d, kind: 'off' as const, capacity: 0, review_minutes: 0, tasks: [] } : d
  );
  return replan({ ...input, schedule: { ...input.schedule, days }, templates: 'keep' });
}

/** "Do more today": pulls the first not-done entry of the next non-empty day into today. */
export function doMore(schedule: Schedule, today: string, done: Set<string> = new Set()): Schedule {
  const todayIdx = schedule.days.findIndex((d) => d.date === today);
  if (todayIdx < 0) return schedule;
  for (let i = todayIdx + 1; i < schedule.days.length; i++) {
    const e = schedule.days[i].tasks.find((x) => !done.has(entryKey(x)) && !done.has(x.task_id));
    if (!e) continue;
    const days = schedule.days.map((d, j) => {
      if (j === i) return { ...d, tasks: d.tasks.filter((x) => x !== e) };
      if (j === todayIdx) return { ...d, tasks: [...d.tasks, e] };
      return d;
    });
    return { ...schedule, days };
  }
  return schedule;
}

/** Moves one entry (by key) to another date in the schedule. */
export function moveEntry(schedule: Schedule, key: string, toDate: string): Schedule {
  if (!schedule.days.some((d) => d.date === toDate)) return schedule;
  let entry: ScheduleEntry | null = null;
  const removed = schedule.days.map((d) => {
    const e = d.tasks.find((x) => entryKey(x) === key);
    if (!e || entry) return d;
    entry = e;
    return { ...d, tasks: d.tasks.filter((x) => x !== e) };
  });
  if (!entry) return schedule;
  const days = removed.map((d) => (d.date === toDate ? { ...d, tasks: [...d.tasks, entry!] } : d));
  return { ...schedule, days: fixParts(days) };
}

// ── Pace ────────────────────────────────────────────────────────────────────

/**
 * Actual / planned time over the last 30 `task_done` events that carry both a
 * duration and `payload.planned_minutes`. Needs 10 such events (else null),
 * clamped to 0.6–1.8.
 */
export function paceFactor(events: LearningEvent[]): number | null {
  const samples = events
    .filter(
      (e) =>
        e.type === 'task_done' &&
        e.duration_s > 0 &&
        typeof e.payload.planned_minutes === 'number' &&
        (e.payload.planned_minutes as number) > 0 &&
        !e.payload.undone
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);
  if (samples.length < 10) return null;
  const actual = samples.reduce((n, e) => n + e.duration_s / 60, 0);
  const planned = samples.reduce((n, e) => n + (e.payload.planned_minutes as number), 0);
  const f = actual / planned;
  return Math.round(Math.min(1.8, Math.max(0.6, f)) * 100) / 100;
}

/** Planned minutes for a day (entries + review reserve). */
export function dayMinutes(day: ScheduleDay): number {
  return totalMinutes(day.tasks) + day.review_minutes;
}
