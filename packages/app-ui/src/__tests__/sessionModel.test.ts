import { describe, expect, it } from 'vitest';
import { IntakeSchema, buildPath, fitRoadmap, planRoadmapRules, type PlanTask, type Roadmap } from '@job-automator/learning';
import { learnIndex } from '../features/learn/catalog';
import type { EntryView } from '../features/learn/learnModel';
import { progressOf } from '../features/learn/learnModel';
import {
  buildSession,
  chunkPoints,
  lessonContent,
  lessonPoints,
  lessonScreens,
  planStatus,
  toPoint,
  weekSummary,
} from '../features/learn/sessionModel';

const view = (id: string, kind: PlanTask['kind'], minutes: number, patch: Partial<PlanTask> = {}, done = false): EntryView => ({
  key: id,
  done,
  entry: { task_id: id, minutes, stream: patch.stream ?? 'dsa', part: 1, parts: 1 },
  task: { id, kind, title: id, minutes, stream: 'dsa', module_id: 'm', topic_id: null, optional: false, splittable: false, ...patch },
});

describe('lesson points', () => {
  it('splits "Name: details" lines', () => {
    expect(toPoint('Pivot index: left sum equals total', 1)).toMatchObject({ name: 'Pivot index', text: 'left sum equals total' });
    expect(toPoint('A plain line without a name', 2)).toMatchObject({ name: null, text: 'A plain line without a name', n: 2 });
  });
  it('cuts points into even screens of at most three', () => {
    const n = (k: number) => chunkPoints(Array.from({ length: k }, (_, i) => i)).map((c) => c.length);
    expect(n(8)).toEqual([3, 3, 2]);
    expect(n(7)).toEqual([3, 2, 2]);
    expect(n(4)).toEqual([2, 2]);
    expect(n(3)).toEqual([3]);
    expect(n(0)).toEqual([]);
  });
  it('numbers a later part from where the first part ended', () => {
    const items = ['a: 1', 'b: 2', 'c: 3', 'd: 4', 'e: 5', 'f: 6'];
    expect(lessonPoints(items, 2, 2).map((p) => p.n)).toEqual([4, 5, 6]);
    expect(lessonPoints(items).length).toBe(6);
  });
  it('leaves out screens with nothing to show', () => {
    const points = lessonPoints(['a: 1', 'b: 2', 'c: 3', 'd: 4']);
    expect(lessonScreens({ points, recap: false, check: true, practice: false }).map((s) => s.kind)).toEqual(['intro', 'points', 'points', 'check', 'done']);
    expect(lessonScreens({ points: [], recap: true, check: false, practice: true }).map((s) => s.kind)).toEqual(['intro', 'recap', 'practice', 'done']);
  });
});

describe('lessonContent', () => {
  const index = learnIndex();
  it('reads a catalogue topic: learn items as points, key points as the recap', () => {
    const c = lessonContent('dsa.arrays.prefix-sums', null, index)!;
    expect(c.title).toBe('Prefix sums');
    expect(c.points.length).toBeGreaterThan(3);
    expect(c.recap.length).toBeGreaterThan(0);
    expect(c.topic).not.toBeNull();
  });
  it('reads an AI custom-module topic from the roadmap', () => {
    const roadmap = {
      modules: [{ module_id: 'custom.1', emphasis: 'standard', skip_topics: [], why: '', added_for: null, custom: {
        title: 'Rust basics', summary: '', stream: 'dev', topics: [{ key: 'ownership', title: 'Ownership', summary: 'Who frees memory.', tasks: [{ key: 'a', kind: 'learn', title: 'Read about ownership', minutes: 30 }] }],
      } }],
    } as unknown as Pick<Roadmap, 'modules'>;
    const c = lessonContent('custom.1.ownership', roadmap, index)!;
    expect(c).toMatchObject({ title: 'Ownership', moduleTitle: 'Rust basics', summary: 'Who frees memory.', points: [], topic: null, unreviewed: true });
  });
  it('is null for an unknown topic', () => expect(lessonContent('nope', null, index)).toBeNull());
});

describe('buildSession', () => {
  const titles: Record<string, string> = { a: 'Prefix sums', b: 'HTML forms', c: 'OOP' };
  const titleOf = (id: string) => titles[id] ?? id;
  const views = [
    view('b/learn', 'learn', 30, { topic_id: 'b', stream: 'dev' }),
    view('a/learn', 'learn', 30, { topic_id: 'a' }),
    view('a/solve/x', 'solve', 40, { topic_id: 'a', problem_ref: 'lc:x' }),
    view('a/quiz', 'quiz', 10, { topic_id: 'a' }),
    view('c/quiz', 'quiz', 10, { topic_id: 'c', stream: 'core_cs' }),
  ];

  it('puts the main focus first, merges a same-day quiz into its lesson and keeps a later quiz as a check', () => {
    const s = buildSession({ views, titleOf, reviewsDue: 0, reviewsDoneToday: 0 });
    expect(s.focus).toBe('Prefix sums');
    expect(s.side).toBe('HTML forms');
    expect(s.steps.map((x) => `${x.kind}:${x.title}`)).toEqual(['lesson:Prefix sums', 'practice:a/solve/x', 'lesson:HTML forms', 'check:OOP']);
    expect(s.steps[0].views.map((v) => v.key)).toEqual(['a/learn', 'a/quiz']);
    expect(s.steps[0].main && s.steps[1].main && !s.steps[2].main).toBe(true);
    expect(s.next?.title).toBe('Prefix sums');
    expect(s.minutes).toBe(120);
  });

  it('opens with a warm-up review when items are due and counts done steps', () => {
    const done = views.map((v) => (v.key === 'a/learn' || v.key === 'a/quiz' ? { ...v, done: true } : v));
    const s = buildSession({ views: done, titleOf, reviewsDue: 3, reviewsDoneToday: 0 });
    expect(s.steps[0]).toMatchObject({ kind: 'review', title: '3 to review', done: false });
    expect(s.done).toBe(1);
    expect(s.next?.kind).toBe('review');
    expect(s.minutesLeft).toBe(80);
  });

  it('shows the review as done once today\'s reviews are answered', () => {
    const s = buildSession({ views, titleOf, reviewsDue: 0, reviewsDoneToday: 4 });
    expect(s.steps[0]).toMatchObject({ kind: 'review', done: true });
    expect(s.next?.kind).toBe('lesson');
  });

  it('keeps projects, mocks and weekly revision as their own steps', () => {
    const s = buildSession({
      views: [
        view('revise/week/1', 'revise', 60, { module_id: 'revision' }),
        view('project.p/build/s1', 'build', 30, { project_id: 'p', stream: 'dev' }),
      ],
      titleOf,
      projectTitleOf: () => 'Todo app',
      reviewsDue: 0,
      reviewsDoneToday: 0,
    });
    expect(s.focus).toBe('revise/week/1');
    expect(s.steps.map((x) => x.kind)).toEqual(['revision', 'project']);
    expect(s.side).toBeNull();
  });
});

describe('week and plan status', () => {
  const index = learnIndex();
  const intake = IntakeSchema.parse({
    role: 'frontend', aim: 'internship', start_date: '2026-10-05', end_date: '2026-11-01', study_days: [0, 1, 2, 3, 4, 5, 6],
    weekday_minutes: 60, weekend_minutes: 120, streams: ['dsa', 'core_cs', 'dev', 'interview'],
  });
  const fit = fitRoadmap(planRoadmapRules(intake, index, new Date('2026-10-05T06:00:00Z')), index);
  const progress = progressOf(fit.roadmap, fit.schedule, [], index);
  const path = buildPath({ schedule: fit.schedule, roadmap: fit.roadmap, tasks: progress.byId, index, done: progress.done, today: '2026-10-07' });

  it('counts this week\'s sessions and finds the unused reserve day', () => {
    const w = weekSummary(path, fit.schedule, '2026-10-07');
    expect(w.week?.number).toBe(1);
    expect(w.sessionsTotal).toBe(w.week!.days.length);
    expect(w.sessionsDone).toBe(0);
    const w2 = weekSummary(path, fit.schedule, '2026-10-14');
    expect(w2.week?.number).toBe(2);
    if (w2.reserveDate) expect(fit.schedule.days.find((d) => d.date === w2.reserveDate)?.kind).toBe('buffer');
  });
  it('reports the end date, the last day with work and what does not fit', () => {
    const s = planStatus(fit.schedule);
    expect(s.endDate).toBe('2026-11-01');
    expect(s.finishDate! <= '2026-11-01').toBe(true);
    expect(s.leftOutMinutes).toBeGreaterThanOrEqual(0);
  });
});
