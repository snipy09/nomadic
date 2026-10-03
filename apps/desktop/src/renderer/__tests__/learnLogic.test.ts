import { describe, expect, it } from 'vitest';
import { completedLessons, type LearningEvent, type QuizAnswer } from '@job-automator/learning';
import type { LearningEventInput } from '../../shared/ipc';
import { bundle, checkItemsFor, isShowableResource, lessonById, lessonResources, type QuizItem } from '../features/learn/content';
import {
  buildPath,
  buildToday,
  checkEvents,
  gradeAll,
  practiceLeft,
  reviewEvents,
  selfReportedEvents,
  shuffledSteps,
} from '../features/learn/learnLogic';

const goal = { track_id: 'frontend', horizon_months: 3 as const, daily_hours: 2 as const };
const DAY = 86_400_000;
const T0 = new Date('2026-10-05T04:30:00Z'); // 10:00 IST

const stamp = (events: LearningEventInput[]): LearningEvent[] =>
  events.map((e) => ({ ...e, user_id: 'u1' })) as unknown as LearningEvent[];

function rightAnswer(item: QuizItem): QuizAnswer {
  if (item.kind === 'mcq') return item.correct;
  if (item.kind === 'fill_in') return item.blanks.map((b) => b[0]);
  return item.items;
}
function wrongAnswer(item: QuizItem): QuizAnswer {
  if (item.kind === 'mcq') return [item.options.findIndex((_, i) => !item.correct.includes(i))];
  if (item.kind === 'fill_in') return item.blanks.map(() => 'definitely wrong');
  return [...item.items].reverse();
}
const answers = (items: QuizItem[], f: (i: QuizItem) => QuizAnswer) => Object.fromEntries(items.map((i) => [i.id, f(i)]));

describe('path', () => {
  it('gives a new user an ordered path with an available first step and locked dependents', () => {
    const path = buildPath(goal, []);
    expect(path.steps.length).toBeGreaterThan(3);
    expect(path.done).toEqual([]);
    expect(path.next?.skillId).toBe(path.steps[0].skillId);
    expect(path.steps[0].state).toBe('available');
    const locked = path.steps.find((s) => s.state === 'locked')!;
    expect(locked.blockedBy.length).toBeGreaterThan(0);
    // Every hard prerequisite of a planned step comes before it.
    const pos = new Map(path.steps.map((s, i) => [s.skillId, i]));
    for (const s of path.steps) for (const p of s.blockedBy) if (pos.has(p)) expect(pos.get(p)!).toBeLessThan(pos.get(s.skillId)!);
  });

  it('plans every role at every pace without throwing', () => {
    for (const r of bundle.roles) for (const h of [1, 3, 6] as const) for (const d of [1, 2, 4] as const) {
      const p = buildPath({ track_id: r.id, horizon_months: h, daily_hours: d }, []);
      expect(p.steps.length).toBeGreaterThan(0);
      expect(p.steps.every((s) => s.lessonId)).toBe(true);
    }
  });
});

describe('first lesson', () => {
  it('a new user can complete the first lesson check, which masters the skill and moves the path on', () => {
    const path = buildPath(goal, []);
    const lesson = lessonById(path.next!.lessonId!)!;
    const items = checkItemsFor(lesson);
    expect(items.length).toBeGreaterThan(0);
    const grades = gradeAll(items, answers(items, rightAnswer));
    const { events, passed } = checkEvents('lesson', lesson, items, grades, goal.track_id, T0, 90);
    expect(passed).toBe(true);
    expect(events.filter((e) => e.item_id).length).toBe(items.length);
    const completion = events.find((e) => !e.item_id)!;
    expect(completion).toMatchObject({ type: 'quiz_passed', skill_id: lesson.skill_id, duration_s: 90 });

    const log = stamp(events);
    expect([...completedLessons(log)]).toEqual([lesson.id]);
    const after = buildPath(goal, log);
    expect(after.done.map((s) => s.skillId)).toContain(lesson.skill_id);
    expect(after.steps.map((s) => s.skillId)).not.toContain(lesson.skill_id);
    expect(after.next?.skillId).not.toBe(lesson.skill_id);
  });

  it('a failed check does not complete the lesson', () => {
    const lesson = lessonById(buildPath(goal, []).next!.lessonId!)!;
    const items = checkItemsFor(lesson);
    const { events, passed } = checkEvents('lesson', lesson, items, gradeAll(items, answers(items, wrongAnswer)), goal.track_id, T0);
    expect(passed).toBe(false);
    expect(events.every((e) => e.type === 'quiz_failed')).toBe(true);
    expect(buildPath(goal, stamp(events)).next?.skillId).toBe(lesson.skill_id);
  });

  it('"I already know this" placement masters the skill when passed', () => {
    const lesson = lessonById('lesson-html')!;
    const items = checkItemsFor(lesson);
    const { events, passed } = checkEvents('placement', lesson, items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, T0);
    expect(passed).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'skill_marked_known', payload: { source: 'placement' } });
    expect(buildPath(goal, stamp(events)).done.map((s) => s.skillId)).toContain('html');
  });
});

describe('spaced repetition', () => {
  it('failed quiz items reappear on schedule: not today, due tomorrow, then at growing intervals', () => {
    const lesson = lessonById('lesson-html')!;
    const items = checkItemsFor(lesson);
    const failed = stamp(checkEvents('lesson', lesson, items, gradeAll(items, answers(items, wrongAnswer)), goal.track_id, T0).events);
    const dueAt = (log: LearningEvent[], t: number) =>
      buildToday(buildPath(goal, log), log, 'pro', new Date(t)).reviews.map((r) => r.item.id).sort();

    expect(dueAt(failed, T0.getTime() + 60_000)).toEqual([]);
    expect(dueAt(failed, T0.getTime() + DAY - 60_000)).toEqual([]);
    expect(dueAt(failed, T0.getTime() + DAY + 60_000)).toEqual(items.map((i) => i.id).sort());

    // Reviewed correctly the next day: back again one day later, then after six days.
    const t1 = T0.getTime() + DAY + 60_000;
    const review1 = stamp(reviewEvents(items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, new Date(t1)));
    const log1 = [...failed, ...review1];
    expect(dueAt(log1, t1 + 60_000)).toEqual([]);
    expect(dueAt(log1, t1 + DAY + 60_000)).toEqual(items.map((i) => i.id).sort());
    const t2 = t1 + DAY + 60_000;
    const log2 = [...log1, ...stamp(reviewEvents(items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, new Date(t2)))];
    expect(dueAt(log2, t2 + 5 * DAY)).toEqual([]);
    expect(dueAt(log2, t2 + 6 * DAY + 60_000)).toEqual(items.map((i) => i.id).sort());

    // A wrong review resets the item to tomorrow.
    const t3 = t2 + 6 * DAY + 60_000;
    const log3 = [...log2, ...stamp(reviewEvents(items, gradeAll(items, answers(items, wrongAnswer)), goal.track_id, new Date(t3)))];
    expect(dueAt(log3, t3 + DAY + 60_000)).toEqual(items.map((i) => i.id).sort());
  });

  it('Today shows the next lesson, streak and the weekly goal', () => {
    const lesson = lessonById(buildPath(goal, []).next!.lessonId!)!;
    const items = checkItemsFor(lesson);
    const log = stamp(checkEvents('lesson', lesson, items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, T0).events);
    const today = buildToday(buildPath(goal, log), log, 'free', new Date(T0.getTime() + 60_000));
    expect(today.lesson?.id).not.toBe(lesson.id);
    expect(today.streak.current).toBe(1);
    expect(today.streak.activeToday).toBe(true);
    expect(today.week).toEqual({ activeDays: 1, target: 5 });
  });
});

describe('limits and content', () => {
  it('counts free practice per day like the server (10 a day, item attempts only)', () => {
    const lesson = lessonById('lesson-html')!;
    const items = checkItemsFor(lesson);
    const one = () => stamp(checkEvents('lesson', lesson, items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, T0).events);
    const log = [...one(), ...one(), ...one(), ...one(), ...one()];
    expect(practiceLeft(log, 'free', T0)).toEqual({ used: 10, remaining: 0, limit: 10 });
    expect(practiceLeft(log, 'free', new Date(T0.getTime() + DAY)).remaining).toBe(10);
    expect(practiceLeft(log, 'pro', T0).remaining).toBe(Infinity);
    expect(buildToday(buildPath(goal, log), log, 'free', T0).limitReached).toBe(true);
  });

  it('only shows curated https resources that have not failed the link check', () => {
    for (const l of bundle.lessons) for (const r of lessonResources(l)) {
      expect(r.url.startsWith('https://')).toBe(true);
      expect(['broken', 'retired']).not.toContain(r.status);
    }
    const base = bundle.resources[0];
    expect(isShowableResource({ ...base, status: 'broken' })).toBe(false);
    expect(isShowableResource({ ...base, status: 'retired' })).toBe(false);
    expect(isShowableResource({ ...base, status: 'active' })).toBe(true);
  });

  it('never includes coding items in checks (no code runner at launch)', () => {
    for (const l of bundle.lessons) expect(checkItemsFor(l).some((i) => (i as { kind: string }).kind === 'code')).toBe(false);
  });

  it('self-reported skills shorten the plan but are not mastered', () => {
    const events = stamp(selfReportedEvents(['html', 'css'], goal.track_id, T0));
    const path = buildPath(goal, events);
    const html = path.steps.find((s) => s.skillId === 'html')!;
    expect(html.state).toBe('in_progress');
    expect(html.hours).toBeLessThan(buildPath(goal, []).steps.find((s) => s.skillId === 'html')!.hours);
  });

  it('changing goal or pace keeps mastered skills', () => {
    const lesson = lessonById('lesson-html')!;
    const items = checkItemsFor(lesson);
    const log = stamp(checkEvents('lesson', lesson, items, gradeAll(items, answers(items, rightAnswer)), goal.track_id, T0).events);
    for (const g of [{ ...goal, daily_hours: 4 as const }, { ...goal, track_id: 'fullstack' }]) {
      const p = buildPath(g, log);
      expect(p.done.map((s) => s.skillId)).toContain('html');
      expect(p.steps.map((s) => s.skillId)).not.toContain('html');
    }
  });

  it('shuffles ordering steps deterministically and never in the solved order', () => {
    const steps = ['a', 'b', 'c', 'd'];
    expect(shuffledSteps('x', steps)).toEqual(shuffledSteps('x', steps));
    for (const id of ['a', 'b', 'c', 'q1', 'q2']) {
      const s = shuffledSteps(id, steps);
      expect([...s].sort()).toEqual(steps);
      expect(s).not.toEqual(steps);
    }
  });
});
