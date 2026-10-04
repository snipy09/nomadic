import { describe, expect, it } from 'vitest';
import {
  PACE_CHIPS,
  baseCapacity,
  buildDays,
  doMore,
  entryKey,
  expandRoadmap,
  fitRoadmap,
  fixParts,
  isSpecialTask,
  moveEntry,
  packTasks,
  packableMinutes,
  paceFactor,
  planRoadmapRules,
  replan,
  skipToday,
  taskIdOfKey,
  usableMinutes,
  type PlanTask,
  type Roadmap,
  type ScheduleDay,
} from '../src';
import { INDEX, NOW, ev, intake } from './v2-fixtures';

const task = (id: string, minutes: number, patch: Partial<PlanTask> = {}): PlanTask => ({
  id,
  kind: 'learn',
  title: id,
  minutes,
  stream: 'dsa',
  module_id: 'm',
  topic_id: 't',
  optional: false,
  splittable: false,
  ...patch,
});
const day = (date: string, capacity: number, patch: Partial<ScheduleDay> = {}): ScheduleDay => ({
  date,
  kind: capacity > 0 ? 'study' : 'off',
  capacity,
  review_minutes: 0,
  tasks: [],
  ...patch,
});

describe('calendar', () => {
  const i = intake({ study_days: [1, 2, 3, 4, 5, 6], blackouts: ['2026-10-07'] });
  it('weekdays use weekday minutes', () => expect(baseCapacity(i, '2026-10-05')).toBe(60));
  it('Saturday uses weekend minutes', () => expect(baseCapacity(i, '2026-10-10')).toBe(150));
  it('non-study days have 0', () => expect(baseCapacity(i, '2026-10-11')).toBe(0));
  it('blackouts have 0', () => expect(baseCapacity(i, '2026-10-07')).toBe(0));

  it('builds one day per date', () => expect(buildDays(intake())).toHaveLength(84));
  it('marks off days', () => {
    const days = buildDays(i);
    expect(days.find((d) => d.date === '2026-10-11')!.kind).toBe('off');
  });
  it('marks a buffer as the last study day of each 14-day block', () => {
    const days = buildDays(intake());
    expect(days[13].kind).toBe('buffer');
    expect(days.filter((d) => d.kind === 'buffer')).toHaveLength(6);
  });
  it('no buffers in plans under 14 days', () => {
    expect(buildDays(intake({ end_date: '2026-10-17' })).some((d) => d.kind === 'buffer')).toBe(false);
  });
  it('no buffer in a block with fewer than 3 study days', () => {
    const days = buildDays(intake({ study_days: [6], end_date: '2026-10-18' }));
    expect(days.some((d) => d.kind === 'buffer')).toBe(false);
  });
  it('marks a revision day in each week', () => {
    const days = buildDays(intake());
    expect(days[5].kind).toBe('study');
    expect(days[6].kind).toBe('revision');
  });
  it('revision skips buffer days', () => {
    const days = buildDays(intake());
    expect(days[13].kind).toBe('buffer');
    expect(days[12].kind).toBe('revision');
  });
  it('no revision in a week with a single study day', () => {
    const days = buildDays(intake({ study_days: [3], end_date: '2026-10-11' }));
    expect(days.some((d) => d.kind === 'revision')).toBe(false);
  });
  it('adds OA mocks in the last third on weekends for DSA plans', () => {
    const days = buildDays(intake(), { dsa: true });
    const mocks = days.filter((d) => d.kind === 'mock');
    expect(mocks.length).toBeGreaterThan(0);
    for (const m of mocks) {
      expect(days.indexOf(m)).toBeGreaterThanOrEqual(Math.floor((84 * 2) / 3));
      expect([0, 6]).toContain(new Date(`${m.date}T00:00:00Z`).getUTCDay());
    }
  });
  it('OA mocks are at least 14 days apart', () => {
    const mocks = buildDays(intake({ end_date: '2027-03-31' }), { dsa: true }).filter((d) => d.kind === 'mock');
    for (let k = 1; k < mocks.length; k++) {
      expect(Date.parse(mocks[k].date) - Date.parse(mocks[k - 1].date)).toBeGreaterThanOrEqual(14 * 86_400_000);
    }
  });
  it('no OA mocks without DSA', () => expect(buildDays(intake()).some((d) => d.kind === 'mock')).toBe(false));
  it('no OA mocks in short plans', () => {
    expect(buildDays(intake({ end_date: '2026-10-20' }), { dsa: true }).some((d) => d.kind === 'mock')).toBe(false);
  });
  it('reserves 10 review minutes from the 3rd study day', () => {
    const days = buildDays(intake());
    expect(days[0].review_minutes).toBe(0);
    expect(days[1].review_minutes).toBe(0);
    expect(days[2].review_minutes).toBe(10);
  });
  it('no review reserve on short days', () => {
    expect(buildDays(intake({ weekday_minutes: 30 }))[3].review_minutes).toBe(0);
  });
  it('packable minutes: revision gives half to revision', () => {
    expect(packableMinutes(day('2026-10-10', 100, { kind: 'revision', review_minutes: 10 }))).toBe(45);
  });
  it('packable minutes: buffers only when allowed', () => {
    const b = day('2026-10-10', 100, { kind: 'buffer' });
    expect(packableMinutes(b)).toBe(0);
    expect(packableMinutes(b, true)).toBe(100);
  });
  it('packable minutes: mock day keeps what is left after 90', () => {
    expect(packableMinutes(day('2026-10-10', 150, { kind: 'mock' }))).toBe(60);
  });
  it('usable minutes sums packable minutes', () => {
    const days = [day('a', 60), day('b', 0)];
    expect(usableMinutes(days)).toBe(60);
  });
});

describe('entries', () => {
  it('entry key has @part only when split', () => {
    expect(entryKey({ task_id: 'x', part: 1, parts: 1 })).toBe('x');
    expect(entryKey({ task_id: 'x', part: 2, parts: 3 })).toBe('x@2');
  });
  it('task id of a key', () => {
    expect(taskIdOfKey('a/b@2')).toBe('a/b');
    expect(taskIdOfKey('a/b')).toBe('a/b');
  });
  it('recognises special tasks', () => {
    expect(isSpecialTask('revise/week/2')).toBe(true);
    expect(isSpecialTask('mock/oa/1')).toBe(true);
    expect(isSpecialTask('mock/dsa.arrays')).toBe(false);
  });
  it('fixParts numbers parts', () => {
    const e = { task_id: 'x', minutes: 10, stream: 'dsa' as const, part: 1, parts: 1 };
    const out = fixParts([day('a', 60, { tasks: [e] }), day('b', 60, { tasks: [e] })]);
    expect(out.map((d) => d.tasks[0])).toEqual([
      expect.objectContaining({ part: 1, parts: 2 }),
      expect.objectContaining({ part: 2, parts: 2 }),
    ]);
  });
});

describe('packing', () => {
  it('fills a day up to capacity', () => {
    const r = packTasks({ tasks: [task('a', 30), task('b', 30), task('c', 30)], days: [day('d1', 60), day('d2', 60)], shares: { dsa: 100 } });
    expect(r.days[0].tasks.map((t) => t.task_id)).toEqual(['a', 'b']);
    expect(r.days[1].tasks.map((t) => t.task_id)).toEqual(['c']);
  });
  it('allows a 10-minute overrun', () => {
    const r = packTasks({ tasks: [task('a', 40), task('b', 30)], days: [day('d1', 60)], shares: { dsa: 100 } });
    expect(r.days[0].tasks).toHaveLength(2);
  });
  it('does not overrun by more than 10 minutes', () => {
    const r = packTasks({ tasks: [task('a', 40), task('b', 31)], days: [day('d1', 60), day('d2', 60)], shares: { dsa: 100 } });
    expect(r.days[0].tasks).toHaveLength(1);
  });
  it('returns overflow when time runs out', () => {
    const r = packTasks({ tasks: [task('a', 60), task('b', 60)], days: [day('d1', 60)], shares: { dsa: 100 } });
    expect(r.overflow.map((p) => p.task.id)).toEqual(['b']);
  });
  it('skips off days', () => {
    const r = packTasks({ tasks: [task('a', 30)], days: [day('d1', 0), day('d2', 60)], shares: { dsa: 100 } });
    expect(r.days[0].tasks).toEqual([]);
    expect(r.days[1].tasks).toHaveLength(1);
  });
  it('splits splittable tasks across days', () => {
    const r = packTasks({ tasks: [task('a', 90, { splittable: true })], days: [day('d1', 60), day('d2', 60)], shares: { dsa: 100 } });
    expect(r.days.map((d) => d.tasks.map((t) => t.minutes))).toEqual([[60], [30]]);
  });
  it('does not split when less than 20 minutes remain', () => {
    const r = packTasks({
      tasks: [task('a', 45), task('b', 60, { splittable: true })],
      days: [day('d1', 60), day('d2', 60)],
      shares: { dsa: 100 },
    });
    expect(r.days[0].tasks.map((t) => t.task_id)).toEqual(['a']);
  });
  it('splits a task longer than any day', () => {
    const r = packTasks({ tasks: [task('big', 100)], days: [day('d1', 60), day('d2', 60)], shares: { dsa: 100 } });
    expect(r.overflow).toEqual([]);
    expect(r.days[0].tasks[0].minutes).toBe(60);
  });
  it('keeps task order within a stream', () => {
    const r = packTasks({ tasks: [task('a', 20), task('b', 20), task('c', 20)], days: [day('d1', 60)], shares: { dsa: 100 } });
    expect(r.days[0].tasks.map((t) => t.task_id)).toEqual(['a', 'b', 'c']);
  });
  it('mixes streams by share over days', () => {
    const tasks = [
      ...Array.from({ length: 10 }, (_, k) => task(`d${k}`, 30)),
      ...Array.from({ length: 10 }, (_, k) => task(`v${k}`, 30, { stream: 'dev' })),
    ];
    const r = packTasks({ tasks, days: Array.from({ length: 5 }, (_, k) => day(`x${k}`, 60)), shares: { dsa: 50, dev: 50 } });
    const dev = r.days.flatMap((d) => d.tasks).filter((t) => t.stream === 'dev').length;
    expect(dev).toBeGreaterThanOrEqual(4);
    expect(dev).toBeLessThanOrEqual(6);
  });
  it('uses at most two streams a day', () => {
    const tasks = (['dsa', 'dev', 'core_cs'] as const).flatMap((s) => Array.from({ length: 6 }, (_, k) => task(`${s}${k}`, 10, { stream: s })));
    const r = packTasks({ tasks, days: [day('x', 120)], shares: { dsa: 34, dev: 33, core_cs: 33 } });
    expect(new Set(r.days[0].tasks.map((t) => t.stream)).size).toBeLessThanOrEqual(2);
  });
  it('applies the pace factor to planned minutes', () => {
    const r = packTasks({ tasks: [task('a', 30)], days: [day('x', 60)], shares: { dsa: 100 }, pace: 1.4 });
    expect(r.days[0].tasks[0].minutes).toBe(42);
  });
  it('places the weekly revision block on revision days', () => {
    const r = packTasks({
      tasks: [],
      days: [day('2026-10-11', 100, { kind: 'revision' })],
      shares: { dsa: 100 },
      planStart: '2026-10-05',
    });
    expect(r.days[0].tasks).toEqual([expect.objectContaining({ task_id: 'revise/week/1', minutes: 50 })]);
  });
  it('numbers revision weeks from the plan start', () => {
    const r = packTasks({ tasks: [], days: [day('2026-10-18', 100, { kind: 'revision' })], shares: { dsa: 100 }, planStart: '2026-10-05' });
    expect(r.days[0].tasks[0].task_id).toBe('revise/week/2');
  });
  it('places an OA mock on mock days', () => {
    const r = packTasks({ tasks: [], days: [day('x', 150, { kind: 'mock' })], shares: { dsa: 100 } });
    expect(r.days[0].tasks).toEqual([expect.objectContaining({ task_id: 'mock/oa/1', minutes: 90 })]);
  });
  it('skips special tasks already done', () => {
    const r = packTasks({ tasks: [], days: [day('x', 150, { kind: 'mock' })], shares: { dsa: 100 }, doneSpecial: new Set(['mock/oa/1']) });
    expect(r.days[0].tasks).toEqual([]);
  });
  it('leaves buffer days empty unless allowed', () => {
    const r = packTasks({ tasks: [task('a', 30)], days: [day('x', 60, { kind: 'buffer' })], shares: { dsa: 100 } });
    expect(r.overflow).toHaveLength(1);
    const r2 = packTasks({ tasks: [task('a', 30)], days: [day('x', 60, { kind: 'buffer' })], shares: { dsa: 100 }, useBuffers: true });
    expect(r2.overflow).toHaveLength(0);
  });
  it('subtracts minutes already done from split tasks', () => {
    const r = packTasks({ tasks: [task('a', 60, { splittable: true })], days: [day('x', 60)], shares: { dsa: 100 }, doneMinutes: new Map([['a', 40]]) });
    expect(r.days[0].tasks[0].minutes).toBe(20);
  });
  it('is deterministic', () => {
    const input = { tasks: [task('a', 30), task('b', 30, { stream: 'dev' })], days: [day('x', 60)], shares: { dsa: 50, dev: 50 } };
    expect(packTasks(input)).toEqual(packTasks(input));
  });
});

function plan(patch: Parameters<typeof intake>[0] = {}): Roadmap {
  return planRoadmapRules(intake(patch), INDEX, NOW, { id: '00000000-0000-4000-8000-000000000001' });
}

describe('fitRoadmap', () => {
  it('schedules every task when there is time', () => {
    const fit = fitRoadmap(plan(), INDEX, { now: NOW });
    expect(fit.schedule.left_out.filter((l) => l.reason === 'no_time')).toEqual([]);
    const scheduled = new Set(fit.schedule.days.flatMap((d) => d.tasks.map((t) => t.task_id)));
    for (const t of fit.tasks) expect(scheduled.has(t.id)).toBe(true);
  });
  it('covers the whole date range', () => {
    const fit = fitRoadmap(plan(), INDEX, { now: NOW });
    expect(fit.schedule.days[0].date).toBe('2026-10-05');
    expect(fit.schedule.days[fit.schedule.days.length - 1].date).toBe('2026-12-27');
  });
  it('drops optional tasks first when short of time', () => {
    const r = plan({ end_date: '2026-10-18', weekday_minutes: 30, weekend_minutes: 30 });
    const deep: Roadmap = { ...r, modules: r.modules.map((m) => ({ ...m, emphasis: 'deep' })) };
    const fit = fitRoadmap(deep, INDEX, { now: NOW });
    expect(fit.schedule.left_out.some((l) => l.reason === 'optional')).toBe(true);
  });
  it('lowers emphasis from the last modules when still short', () => {
    const r = plan({ end_date: '2026-10-18', weekday_minutes: 30, weekend_minutes: 30 });
    const deep: Roadmap = { ...r, modules: r.modules.map((m) => ({ ...m, emphasis: 'deep' })) };
    const fit = fitRoadmap(deep, INDEX, { now: NOW });
    expect(fit.roadmap.modules.some((m) => m.emphasis !== 'deep')).toBe(true);
    expect(fit.roadmap.modules[0].emphasis === 'deep' || fit.roadmap.modules.every((m) => m.emphasis === 'light')).toBe(true);
  });
  it('leaves the rest out as no_time', () => {
    const fit = fitRoadmap(plan({ end_date: '2026-10-08', weekday_minutes: 30, weekend_minutes: 30 }), INDEX, { now: NOW });
    expect(fit.schedule.left_out.some((l) => l.reason === 'no_time')).toBe(true);
  });
  it('never schedules a left-out task, except the unplaced rest of a split one', () => {
    const fit = fitRoadmap(plan({ end_date: '2026-10-12', weekday_minutes: 30, weekend_minutes: 30 }), INDEX, { now: NOW });
    const placed = new Map<string, number>();
    for (const d of fit.schedule.days) for (const t of d.tasks) placed.set(t.task_id, (placed.get(t.task_id) ?? 0) + t.minutes);
    const byId = new Map(fit.tasks.map((t) => [t.id, t]));
    for (const l of fit.schedule.left_out) {
      if (!placed.has(l.task_id)) continue;
      expect(l.reason).toBe('no_time');
      expect(placed.get(l.task_id)! + l.minutes).toBe(byId.get(l.task_id)!.minutes);
    }
  });
  it('days never exceed capacity + 10', () => {
    const fit = fitRoadmap(plan(), INDEX, { now: NOW });
    for (const d of fit.schedule.days) {
      const m = d.tasks.reduce((n, t) => n + t.minutes, 0) + d.review_minutes;
      expect(m).toBeLessThanOrEqual(d.capacity + 10);
    }
  });
  it('stores the pace factor', () => expect(fitRoadmap(plan(), INDEX, { pace: 1.4, now: NOW }).schedule.pace_factor).toBe(1.4));
  it('links the schedule to the roadmap', () => {
    const r = plan();
    expect(fitRoadmap(r, INDEX, { now: NOW }).schedule.roadmap_id).toBe(r.id);
  });
});

describe('replan', () => {
  const base = () => {
    const r = plan({ end_date: '2026-11-15' });
    const fit = fitRoadmap(r, INDEX, { now: NOW });
    return { roadmap: fit.roadmap, schedule: fit.schedule };
  };
  it('moves missed tasks forward from today', () => {
    const { roadmap, schedule } = base();
    const missed = schedule.days[0].tasks[0].task_id;
    const r = replan({ schedule, roadmap, index: INDEX, done: new Set(), today: '2026-10-07', now: NOW });
    expect(r.schedule.days[0].tasks).toEqual([]);
    const future = r.schedule.days.filter((d) => d.date >= '2026-10-07').flatMap((d) => d.tasks.map((t) => t.task_id));
    expect(future).toContain(missed);
    expect(r.moved).toBeGreaterThan(0);
  });
  it('keeps done entries on past days', () => {
    const { roadmap, schedule } = base();
    const e = schedule.days[0].tasks[0];
    const r = replan({ schedule, roadmap, index: INDEX, done: new Set([entryKey(e)]), today: '2026-10-07', now: NOW });
    expect(r.schedule.days[0].tasks.map((t) => t.task_id)).toEqual([e.task_id]);
  });
  it('does not reschedule done tasks', () => {
    const { roadmap, schedule } = base();
    const e = schedule.days[0].tasks[0];
    const r = replan({ schedule, roadmap, index: INDEX, done: new Set([e.task_id]), today: '2026-10-07', now: NOW });
    const future = r.schedule.days.filter((d) => d.date >= '2026-10-07').flatMap((d) => d.tasks.map((t) => t.task_id));
    expect(future).not.toContain(e.task_id);
  });
  it('nothing moves when everything was done', () => {
    const { roadmap, schedule } = base();
    const done = new Set(schedule.days.filter((d) => d.date < '2026-10-07').flatMap((d) => d.tasks.map(entryKey)));
    const r = replan({ schedule, roadmap, index: INDEX, done, today: '2026-10-07', now: NOW });
    expect(r.moved).toBe(0);
  });
  it('reports a shortfall with three options', () => {
    const r0 = plan({ end_date: '2026-10-20', weekday_minutes: 60, weekend_minutes: 60 });
    const fit = fitRoadmap(r0, INDEX, { now: NOW });
    const r = replan({ schedule: fit.schedule, roadmap: fit.roadmap, index: INDEX, done: new Set(), today: '2026-10-15', now: NOW });
    expect(r.shortfall).not.toBeNull();
    expect(r.shortfall!.options.extend_to! > '2026-10-20').toBe(true);
    expect(r.shortfall!.minutes).toBeGreaterThan(0);
  });
  it('uses buffer days only when needed', () => {
    const { roadmap, schedule } = base();
    const r = replan({ schedule, roadmap, index: INDEX, done: new Set(), today: '2026-10-05', now: NOW });
    expect(r.usedBuffers).toBe(false);
  });
  it('rebuilds future days from the intake when asked', () => {
    const { roadmap, schedule } = base();
    const longer = { ...roadmap, intake: { ...roadmap.intake, end_date: '2026-11-30' } };
    const r = replan({ schedule, roadmap: longer, index: INDEX, done: new Set(), today: '2026-10-10', templates: 'intake', now: NOW });
    expect(r.schedule.days[r.schedule.days.length - 1].date).toBe('2026-11-30');
    expect(r.schedule.end_date).toBe('2026-11-30');
  });
  it('skip_today empties today and replans', () => {
    const { roadmap, schedule } = base();
    const r = skipToday({ schedule, roadmap, index: INDEX, done: new Set(), today: '2026-10-06', now: NOW });
    const today = r.schedule.days.find((d) => d.date === '2026-10-06')!;
    expect(today.capacity).toBe(0);
    expect(today.tasks).toEqual([]);
  });
});

describe('day actions', () => {
  const s = () => {
    const r = plan();
    return fitRoadmap(r, INDEX, { now: NOW }).schedule;
  };
  it('do_more pulls the next entry into today', () => {
    const sched = s();
    const next = sched.days[1].tasks[0];
    const out = doMore(sched, '2026-10-05');
    expect(out.days[0].tasks).toContainEqual(next);
    expect(out.days[1].tasks).not.toContainEqual(next);
  });
  it('do_more skips done entries', () => {
    const sched = s();
    const next = sched.days[1].tasks[0];
    const out = doMore(sched, '2026-10-05', new Set([entryKey(next)]));
    expect(out.days[0].tasks).not.toContainEqual(next);
  });
  it('do_more is a no-op for an unknown day', () => {
    const sched = s();
    expect(doMore(sched, '2030-01-01')).toBe(sched);
  });
  it('move puts an entry on another day', () => {
    const sched = s();
    const e = sched.days[0].tasks[0];
    const out = moveEntry(sched, entryKey(e), '2026-10-09');
    expect(out.days.find((d) => d.date === '2026-10-09')!.tasks.map((t) => t.task_id)).toContain(e.task_id);
    expect(out.days[0].tasks.map((t) => t.task_id)).not.toContain(e.task_id);
  });
  it('move to an unknown date does nothing', () => {
    const sched = s();
    expect(moveEntry(sched, entryKey(sched.days[0].tasks[0]), '1999-01-01')).toBe(sched);
  });
  it('move of an unknown key does nothing', () => {
    const sched = s();
    expect(moveEntry(sched, 'nope', '2026-10-09')).toBe(sched);
  });
});

describe('pace factor', () => {
  const done = (k: number, planned: number, seconds: number) =>
    ev('task_done', `2026-10-${String(5 + (k % 20)).padStart(2, '0')}T10:${String(k % 60).padStart(2, '0')}:00Z`, {
      item_id: `t${k}`,
      duration_s: seconds,
      payload: { planned_minutes: planned },
    });
  it('needs 10 samples', () => expect(paceFactor(Array.from({ length: 9 }, (_, k) => done(k, 30, 1800)))).toBeNull());
  it('is 1 when on plan', () => expect(paceFactor(Array.from({ length: 10 }, (_, k) => done(k, 30, 1800)))).toBe(1));
  it('is above 1 when slower', () => expect(paceFactor(Array.from({ length: 10 }, (_, k) => done(k, 30, 2700)))).toBe(1.5));
  it('clamps to 1.8', () => expect(paceFactor(Array.from({ length: 10 }, (_, k) => done(k, 10, 3600)))).toBe(1.8));
  it('clamps to 0.6', () => expect(paceFactor(Array.from({ length: 10 }, (_, k) => done(k, 60, 60)))).toBe(0.6));
  it('ignores events without planned minutes', () => {
    const evs = Array.from({ length: 12 }, (_, k) => ev('task_done', '2026-10-05T10:00:00Z', { item_id: `x${k}`, duration_s: 600 }));
    expect(paceFactor(evs)).toBeNull();
  });
  it('uses only the last 30 samples', () => {
    const old = Array.from({ length: 30 }, (_, k) => ({ ...done(k, 30, 5400), created_at: '2026-01-01T00:00:00Z' }));
    const recent = Array.from({ length: 30 }, (_, k) => done(k, 30, 1800));
    expect(paceFactor([...old, ...recent])).toBe(1);
  });
  it('chips map to fixed factors', () => expect(PACE_CHIPS).toEqual({ less: 0.7, planned: 1, more: 1.4 }));
  it('expanding a rules plan gives tasks', () => expect(expandRoadmap(plan(), INDEX).length).toBeGreaterThan(10));
});
