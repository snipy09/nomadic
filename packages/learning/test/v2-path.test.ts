import { describe, expect, it } from 'vitest';
import {
  buildPath,
  entryKey,
  expandRoadmap,
  fitRoadmap,
  moduleTitle,
  partSlice,
  planRoadmapRules,
  topicTitle,
  type PlanTask,
  type Roadmap,
  type ScheduleDay,
} from '../src';
import { INDEX, NOW, intake } from './v2-fixtures';

const plan = () => {
  const roadmap = planRoadmapRules(intake(), INDEX, NOW);
  const { roadmap: fitted, schedule } = fitRoadmap(roadmap, INDEX, { now: NOW });
  const tasks = new Map(expandRoadmap(fitted, INDEX).map((t) => [t.id, t]));
  return { roadmap: fitted, schedule, tasks };
};

describe('partSlice', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  it('returns everything for a single part', () => expect(partSlice(items, 1, 1)).toEqual(items));
  it('splits evenly and in order', () => {
    const parts = [1, 2, 3].map((p) => partSlice(items, p, 3));
    expect(parts.flat()).toEqual(items);
    expect(parts.map((p) => p.length)).toEqual([2, 2, 3]);
  });
  it('never returns an empty part', () => {
    expect(partSlice(['a'], 2, 3)).toEqual(['a']);
    expect(partSlice(['a', 'b'], 3, 4).length).toBeGreaterThan(0);
  });
  it('clamps parts out of range', () => expect(partSlice(items, 9, 3)).toEqual(['e', 'f', 'g']));
  it('handles an empty list', () => expect(partSlice([], 2, 3)).toEqual([]));
});

describe('titles', () => {
  const roadmap = { modules: [] } as unknown as Roadmap;
  it('uses catalogue titles', () => {
    expect(topicTitle('dsa.arrays.hashing', roadmap, INDEX)).toBe('dsa.arrays.hashing');
    expect(moduleTitle('dsa.arrays', roadmap, INDEX)).toBe('dsa.arrays');
  });
  it('uses custom module titles', () => {
    const custom = {
      modules: [
        {
          module_id: 'custom.1',
          emphasis: 'standard',
          skip_topics: [],
          why: '',
          added_for: null,
          custom: { title: 'Flutter basics', summary: '', stream: 'dev', topics: [{ key: 'widgets', title: 'Widgets', summary: '', tasks: [] }] },
        },
      ],
    } as unknown as Roadmap;
    expect(topicTitle('custom.1.widgets', custom, INDEX)).toBe('Widgets');
    expect(moduleTitle('custom.1', custom, INDEX)).toBe('Flutter basics');
  });
  it('names project modules after the project', () => expect(moduleTitle('project.todo-app', roadmap, INDEX)).toBe('Project todo-app'));
  it('falls back to the id', () => expect(topicTitle('nope', roadmap, INDEX)).toBe('nope'));
});

describe('buildPath', () => {
  it('groups study days into 7-day weeks from the start date', () => {
    const { roadmap, schedule, tasks } = plan();
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done: new Set(), today: '2026-10-05' });
    expect(path.weeks[0].start).toBe('2026-10-05');
    expect(path.weeks[0].end).toBe('2026-10-11');
    for (const w of path.weeks) {
      for (const d of w.days) {
        expect(d.date >= w.start && d.date <= w.end).toBe(true);
        expect(d.week).toBe(w.number);
      }
      expect(w.days.map((d) => d.day)).toEqual(w.days.map((_, i) => i + 1));
    }
    const all = path.weeks.flatMap((w) => w.days);
    expect(all.map((d) => d.index)).toEqual(all.map((_, i) => i + 1));
    expect(path.study_days).toBe(all.length);
  });

  it('leaves out days without work', () => {
    const { roadmap, schedule, tasks } = plan();
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done: new Set(), today: '2026-10-05' });
    const withWork = schedule.days.filter((d) => d.tasks.length).length;
    expect(path.study_days).toBe(withWork);
    expect(path.weeks.flatMap((w) => w.days).every((d) => d.total > 0)).toBe(true);
  });

  it('titles a day after its biggest topic and lists the others', () => {
    const { roadmap, schedule, tasks } = plan();
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done: new Set(), today: '2026-10-05' });
    const day = path.weeks.flatMap((w) => w.days).find((d) => d.kind === 'study' && d.topic_ids.length > 1);
    expect(day).toBeTruthy();
    const minutesByTopic = new Map<string, number>();
    for (const e of day!.entries) if (e.task?.topic_id) minutesByTopic.set(e.task.topic_id, (minutesByTopic.get(e.task.topic_id) ?? 0) + e.entry.minutes);
    const top = Math.max(...minutesByTopic.values());
    const winners = [...minutesByTopic].filter(([, m]) => m === top).map(([id]) => topicTitle(id, roadmap, INDEX));
    expect(winners).toContain(day!.title);
    expect(day!.subtitle.length).toBeGreaterThan(0);
  });

  it('titles a week after its main modules', () => {
    const { roadmap, schedule, tasks } = plan();
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done: new Set(), today: '2026-10-05' });
    const w = path.weeks[0];
    expect(w.modules.length).toBeGreaterThan(0);
    expect(w.modules[0].minutes).toBeGreaterThanOrEqual(w.modules[w.modules.length - 1].minutes);
    expect(w.title).toContain(w.modules[0].title);
  });

  it('labels revision and mock days', () => {
    const { roadmap, schedule, tasks } = plan();
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done: new Set(), today: '2026-10-05' });
    const days = path.weeks.flatMap((w) => w.days);
    const rev = days.find((d) => d.entries.some((e) => e.entry.task_id.startsWith('revise/week/')));
    expect(rev?.title).toBe('Weekly revision');
    const mock = days.find((d) => d.entries.some((e) => e.entry.task_id.startsWith('mock/oa/')));
    if (mock) expect(mock.title).toBe('Online assessment mock');
  });

  it('marks states from the done set and today', () => {
    const { roadmap, schedule, tasks } = plan();
    const days = schedule.days.filter((d) => d.tasks.length);
    const first = days[0];
    const second = days[1];
    const done = new Set(first.tasks.map(entryKey));
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done, today: days[2].date });
    const flat = path.weeks.flatMap((w) => w.days);
    expect(flat.find((d) => d.date === first.date)!.state).toBe('done');
    expect(flat.find((d) => d.date === second.date)!.state).toBe('missed');
    expect(flat.find((d) => d.date === days[2].date)!.state).toBe('today');
    expect(flat.find((d) => d.date === days[3].date)!.state).toBe('upcoming');
    expect(path.done_days).toBe(1);
    expect(path.current).toEqual({ week: flat.find((d) => d.date === days[2].date)!.week, date: days[2].date });
  });

  it('points at the next day with work when today is done or free', () => {
    const { roadmap, schedule, tasks } = plan();
    const days = schedule.days.filter((d) => d.tasks.length);
    const done = new Set(days[0].tasks.map(entryKey));
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done, today: days[0].date });
    expect(path.current?.date).toBe(days[1].date);
  });

  it('has no current day when everything is done', () => {
    const { roadmap, schedule, tasks } = plan();
    const done = new Set(schedule.days.flatMap((d) => d.tasks.map(entryKey)));
    const path = buildPath({ schedule, roadmap, tasks, index: INDEX, done, today: '2026-10-05' });
    expect(path.current).toBeNull();
    expect(path.done_days).toBe(path.study_days);
  });

  it('counts a split task part as done by its key', () => {
    const t: PlanTask = { id: 'dsa.basics.complexity/learn', kind: 'learn', title: 'x', minutes: 60, stream: 'dsa', module_id: 'dsa.basics', topic_id: 'dsa.basics.complexity', optional: false, splittable: true };
    const days: ScheduleDay[] = [
      { date: '2026-10-05', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: t.id, minutes: 30, stream: 'dsa', part: 1, parts: 2 }] },
      { date: '2026-10-06', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: t.id, minutes: 30, stream: 'dsa', part: 2, parts: 2 }] },
    ];
    const path = buildPath({
      schedule: { start_date: '2026-10-05', end_date: '2026-10-06', days },
      roadmap: { modules: [] },
      tasks: new Map([[t.id, t]]),
      index: INDEX,
      done: new Set([`${t.id}@1`]),
      today: '2026-10-06',
    });
    const [a, b] = path.weeks[0].days;
    expect(a.state).toBe('done');
    expect(b.state).toBe('today');
    expect(path.weeks[0].title).toBe('dsa.basics');
  });

  it('marks a topic carried over from an earlier day', () => {
    const learn: PlanTask = { id: 'dsa.basics.complexity/learn', kind: 'learn', title: 'x', minutes: 60, stream: 'dsa', module_id: 'dsa.basics', topic_id: 'dsa.basics.complexity', optional: false, splittable: true };
    const solve: PlanTask = { ...learn, id: 'dsa.basics.complexity/solve/two-sum', kind: 'solve', minutes: 20, splittable: false, problem_ref: 'lc:two-sum' };
    const days: ScheduleDay[] = [
      { date: '2026-10-05', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: learn.id, minutes: 30, stream: 'dsa', part: 1, parts: 2 }] },
      { date: '2026-10-06', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: learn.id, minutes: 30, stream: 'dsa', part: 2, parts: 2 }] },
      { date: '2026-10-07', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: solve.id, minutes: 20, stream: 'dsa', part: 1, parts: 1 }] },
    ];
    const path = buildPath({
      schedule: { start_date: '2026-10-05', end_date: '2026-10-07', days },
      roadmap: { modules: [] },
      tasks: new Map([[learn.id, learn], [solve.id, solve]]),
      index: INDEX,
      done: new Set(),
      today: '2026-10-05',
    });
    expect(path.weeks[0].days.map((d) => d.title)).toEqual([
      'dsa.basics.complexity',
      'dsa.basics.complexity (continued)',
      'dsa.basics.complexity: practice',
    ]);
  });

  it('skips entries whose task is no longer in the plan', () => {
    const days: ScheduleDay[] = [
      { date: '2026-10-05', kind: 'study', capacity: 30, review_minutes: 0, tasks: [{ task_id: 'gone/learn', minutes: 30, stream: 'dsa', part: 1, parts: 1 }] },
    ];
    const path = buildPath({
      schedule: { start_date: '2026-10-05', end_date: '2026-10-05', days },
      roadmap: { modules: [] },
      tasks: new Map(),
      index: INDEX,
      done: new Set(),
      today: '2026-10-05',
    });
    expect(path.study_days).toBe(0);
    expect(path.weeks[0].title).toBe('Rest week');
  });
});
