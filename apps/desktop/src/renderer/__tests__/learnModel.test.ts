import { describe, expect, it } from 'vitest';
import { IntakeSchema, addDays, fitRoadmap, planRoadmapRules, uuidV5, type LearningEvent } from '@job-automator/learning';
import { learnIndex } from '../features/learn/catalog';
import { bundle, checkItemsFor, isShowableResource, lessonById } from '../features/learn/content';
import {
  buildTodayModel,
  defaultIntakeDraft,
  draftProblem,
  draftToIntake,
  entryViews,
  feasibilityOf,
  formatMinutes,
  intakeToDraft,
  knowThisEvent,
  problemAttemptedEvent,
  progressModel,
  progressOf,
  taskDoneEvent,
  topicProblems,
  untickEvent,
} from '../features/learn/learnModel';
import { gradeAll, recallQuality, shuffledSteps, topicQuizEvents } from '../features/learn/quizLogic';

const START = '2026-10-05';
const NOW = new Date('2026-10-05T06:00:00Z');
const index = learnIndex();
const intake = IntakeSchema.parse({
  role: 'backend', aim: 'campus', start_date: START, end_date: addDays(START, 41), study_days: [1, 2, 3, 4, 5, 6],
  weekday_minutes: 60, weekend_minutes: 120, streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
});
const fit = fitRoadmap(planRoadmapRules(intake, index, NOW, { id: '00000000-0000-4000-8000-0000000000bb' }), index, { now: NOW });
let n = 0;
const ev = (type: LearningEvent['type'], patch: Partial<LearningEvent> = {}): LearningEvent => ({
  id: uuidV5(`lm-${n++}`), user_id: 'u1', type, skill_id: null, item_id: null, payload: {}, duration_s: 0, created_at: NOW.toISOString(), ...patch,
});

describe('intake draft', () => {
  const d = defaultIntakeDraft('frontend', START);
  it('defaults to 12 weeks, every day, 1 h / 2.5 h', () => {
    expect(draftToIntake(d)).toMatchObject({ role: 'frontend', start_date: START, end_date: addDays(START, 83), weekday_minutes: 60, weekend_minutes: 150 });
  });
  it('round-trips through the intake', () => expect(intakeToDraft(IntakeSchema.parse(draftToIntake(d)))).toMatchObject({ weeks: 12, role: 'frontend' }));
  it('needs a study day', () => expect(draftProblem({ ...d, studyDays: [] })).toMatch(/study day/));
  it('needs time on study days', () => expect(draftProblem({ ...d, studyDays: [6], weekendMinutes: 0 })).toMatch(/time/));
  it('is valid by default', () => expect(draftProblem(d)).toBeNull());
  it('drops blackouts before the start', () => expect(draftToIntake({ ...d, blackouts: ['2020-01-01', START] }).blackouts).toEqual([START]));
  it('gives a feasibility preview', () => expect(feasibilityOf(d, index)?.needed.standard).toBeGreaterThan(0));
  it('no preview for an invalid draft', () => expect(feasibilityOf({ ...d, studyDays: [] }, index)).toBeNull());
});

describe('Today and tasks', () => {
  const progress = progressOf(fit.roadmap, fit.schedule, [], index);
  it('lists the first day', () => {
    const t = buildTodayModel({ schedule: fit.schedule, progress, events: [], now: NOW });
    expect(t.dayIndex).toBe(1);
    expect(t.entries.length).toBe(fit.schedule.days[0].tasks.length);
    expect(t.missed).toBe(0);
  });
  it('counts missed work on later days', () => {
    const t = buildTodayModel({ schedule: fit.schedule, progress, events: [], now: new Date('2026-10-09T06:00:00Z') });
    expect(t.missed).toBeGreaterThan(0);
  });
  it('a tick marks the entry done', () => {
    const first = fit.schedule.days[0].tasks[0];
    const task = progress.byId.get(first.task_id)!;
    const done = taskDoneEvent(task, first.task_id, first.minutes, 600, 'backend', index, NOW);
    const p2 = progressOf(fit.roadmap, fit.schedule, [done as unknown as LearningEvent], index);
    expect(entryViews(fit.schedule.days[0], p2)[0].done).toBe(true);
    expect(done.payload).toMatchObject({ planned_minutes: first.minutes, stream: task.stream });
  });
  it('an untick wins over an earlier tick', () => {
    const first = fit.schedule.days[0].tasks[0];
    const task = progress.byId.get(first.task_id)!;
    const a = { ...taskDoneEvent(task, first.task_id, 30, 0, 'backend', index, NOW), user_id: 'u1' } as unknown as LearningEvent;
    const b = { ...untickEvent(task, first.task_id, 'backend', index, new Date(NOW.getTime() + 1000)), user_id: 'u1' } as unknown as LearningEvent;
    expect(entryViews(fit.schedule.days[0], progressOf(fit.roadmap, fit.schedule, [a, b], index))[0].done).toBe(false);
  });
  it('labels special days', () => {
    const rev = fit.schedule.days.find((d) => d.kind === 'revision')!;
    expect(entryViews(rev, progress).some((v) => v.task.kind === 'revise')).toBe(true);
  });
  it('progress model sums planned time to date', () => {
    const m = progressModel(fit.schedule, progress, index, addDays(START, 2));
    expect(m.minutesPlannedToDate).toBeGreaterThan(0);
    expect(m.minutesDone).toBe(0);
  });
  it('lists a topic\'s problems by tier', () => {
    const rows = topicProblems('dsa.arrays.prefix-sums', null, index);
    expect(rows[0]).toEqual({ ref: 'lc:find-pivot-index', tier: 'must' });
  });
  it('"I know this" ticks the learn task', () => expect(knowThisEvent('dsa.arrays.matrix', 'dsa', 'backend', NOW).item_id).toBe('dsa.arrays.matrix/learn'));
  it('a hint lowers the problem quality', () => expect(problemAttemptedEvent('lc:two-sum', true, 'backend', NOW).payload).toMatchObject({ hint: true, quality: 3 }));
});

describe('helpers', () => {
  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(80)).toBe('1 h 20 min');
  });
  it('topic quiz pass completes the quiz task', () => {
    const items = bundle.practice_items.filter((p) => p.id.startsWith('cs.oop.pillars.q')) as never[];
    const grades = items.map(() => ({ correct: true, score: 1 })) as never[];
    const { events, passed } = topicQuizEvents('cs.oop.pillars', items, grades, 'backend', NOW);
    expect(passed).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'quiz_passed', item_id: null, payload: expect.objectContaining({ topic_id: 'cs.oop.pillars' }) });
  });
  it('a wrong answer recalls below 3', () => expect(recallQuality({ correct: false, score: 0 } as never)).toBeLessThan(3));
  it('ordering items are never shown already sorted', () => expect(shuffledSteps('x', ['a', 'b', 'c'])).not.toEqual(['a', 'b', 'c']));
  it('grades a quiz', () => {
    const lesson = lessonById('lesson-html')!;
    const items = checkItemsFor(lesson).filter((i) => i.kind === 'mcq');
    expect(gradeAll(items, {})).toHaveLength(items.length);
  });
  it('hides learn-v2 resources until checked, shows repo-sourced unverified ones', () => {
    const v2 = bundle.resources.find((r) => r.source.startsWith('learn-v2'))!;
    const v1 = bundle.resources.find((r) => !r.source.startsWith('learn-v2'))!;
    expect(isShowableResource(v2)).toBe(false);
    expect(isShowableResource({ ...v2, status: 'active' })).toBe(true);
    expect(isShowableResource(v1)).toBe(true);
    expect(isShowableResource({ ...v1, status: 'broken' })).toBe(false);
  });
  it('days without a schedule have no entries', () => expect(entryViews(null, progressOf(fit.roadmap, null, [ev('task_done')], index))).toEqual([]));
});
