import { describe, expect, it } from 'vitest';
import {
  AIMS,
  ROLE_FAMILY_IDS,
  buildSeedBundle,
  entryKey,
  expandRoadmap,
  fitRoadmap,
  indexCatalog,
  normaliseAiRoadmap,
  orderModules,
  planRoadmapRules,
  planStreak,
  rollForward,
  unfinishedBefore,
  type ScheduleDay,
} from '../src';
import { IntakeSchema } from '../src/v2/types';
import { INDEX, NOW, ev, intake } from './v2-fixtures';

describe('language basics come first', () => {
  it('orders lang.* before every other DSA module, whatever the preference', () => {
    expect(orderModules(INDEX, ['dsa.basics', 'dsa.arrays', 'lang.cpp', 'cs.oop'])).toEqual(['lang.cpp', 'dsa.basics', 'dsa.arrays', 'cs.oop']);
  });
  it('leaves other streams in the preferred order', () => {
    expect(orderModules(INDEX, ['cs.oop', 'dsa.basics', 'lang.cpp']).indexOf('cs.oop')).toBe(0);
  });
  it('holds for the AI path too', () => {
    const i = intake({ language: 'cpp' });
    const r = normaliseAiRoadmap(
      {
        summary: 'x',
        streams: [{ stream: 'dsa', percent: 100 }],
        modules: [
          { module_id: 'dsa.basics', emphasis: 'standard', why: 'a' },
          { module_id: 'lang.cpp', emphasis: 'standard', why: 'b' },
        ],
        custom_modules: [],
        projects: [],
        warnings: [],
      },
      i,
      INDEX,
      NOW
    );
    expect(r).not.toBeNull();
    const ids = r!.modules.map((m) => m.module_id);
    expect(ids.indexOf('lang.cpp')).toBeLessThan(ids.indexOf('dsa.basics'));
  });

  const seed = indexCatalog(buildSeedBundle());
  for (const role of ROLE_FAMILY_IDS) {
    for (const aim of AIMS) {
      for (const language of ['cpp', 'java', 'python'] as const) {
        it(`schedules ${language} basics before the first problem (${role}, ${aim})`, () => {
          const i = IntakeSchema.parse({
            role, aim, language, start_date: '2026-10-05', end_date: '2026-12-27', study_days: [0, 1, 2, 3, 4, 5, 6],
            weekday_minutes: 90, weekend_minutes: 150, streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
          });
          const fit = fitRoadmap(planRoadmapRules(i, seed, NOW), seed, { now: NOW });
          const tasks = new Map(expandRoadmap(fit.roadmap, seed).map((t) => [t.id, t]));
          const entries = fit.schedule.days.flatMap((d) => d.tasks.map((e) => ({ date: d.date, task: tasks.get(e.task_id) })));
          const firstSolve = entries.find((e) => e.task?.kind === 'solve');
          if (!firstSolve) return;
          const lang = entries.find((e) => e.task?.module_id === `lang.${language}`);
          expect(lang, 'language module scheduled').toBeTruthy();
          expect(lang!.date <= firstSolve.date).toBe(true);
        });
      }
    }
  }
});

describe('rollForward', () => {
  const base = () => {
    const fit = fitRoadmap(planRoadmapRules(intake({ end_date: '2026-11-15' }), INDEX, NOW), INDEX, { now: NOW });
    return { roadmap: fit.roadmap, schedule: fit.schedule };
  };
  it('does nothing when no earlier work is open', () => {
    const { roadmap, schedule } = base();
    expect(rollForward({ schedule, roadmap, index: INDEX, done: new Set(), today: schedule.start_date, now: NOW })).toBeNull();
  });
  it('moves unfinished work from earlier days forward and is idempotent', () => {
    const { roadmap, schedule } = base();
    const today = '2026-10-08';
    expect(unfinishedBefore(schedule, new Set(), today)).toBeGreaterThan(0);
    const r = rollForward({ schedule, roadmap, index: INDEX, done: new Set(), today, now: NOW })!;
    expect(r.moved).toBeGreaterThan(0);
    expect(unfinishedBefore(r.schedule, new Set(), today)).toBe(0);
    expect(rollForward({ schedule: r.schedule, roadmap, index: INDEX, done: new Set(), today, now: NOW })).toBeNull();
  });
  it('keeps done work on its day', () => {
    const { roadmap, schedule } = base();
    const e = schedule.days[0].tasks[0];
    const r = rollForward({ schedule, roadmap, index: INDEX, done: new Set([entryKey(e)]), today: '2026-10-08', now: NOW })!;
    expect(r.schedule.days[0].tasks.map((t) => entryKey(t))).toEqual([entryKey(e)]);
  });
});

describe('planStreak', () => {
  const day = (date: string, capacity: number, kind: ScheduleDay['kind'] = capacity ? 'study' : 'off'): ScheduleDay => ({
    date, kind, capacity, review_minutes: 0, tasks: [],
  });
  // Mon 5 Oct to Sun 11 Oct; Sunday is a rest day.
  const schedule = {
    days: [
      day('2026-10-05', 60), day('2026-10-06', 60), day('2026-10-07', 60), day('2026-10-08', 60),
      day('2026-10-09', 60), day('2026-10-10', 60, 'buffer'), day('2026-10-11', 0), day('2026-10-12', 60),
    ],
  };
  const active = (...dates: string[]) => dates.map((d) => ev('task_done', `${d}T10:00:00Z`));

  it('does not break on a planned rest day or an unused reserve day', () => {
    const events = active('2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12');
    const s = planStreak(events, schedule, new Date('2026-10-12T12:00:00Z'));
    expect(s).toEqual({ current: 4, longest: 4, activeToday: true });
  });
  it('breaks on a missed study day', () => {
    const events = active('2026-10-05', '2026-10-07', '2026-10-08');
    expect(planStreak(events, schedule, new Date('2026-10-08T12:00:00Z')).current).toBe(2);
  });
  it('survives until the end of today', () => {
    const events = active('2026-10-08', '2026-10-09');
    const s = planStreak(events, schedule, new Date('2026-10-12T08:00:00Z'));
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(false);
  });
  it('counts every calendar day outside the plan, like the old streak', () => {
    const events = active('2026-09-01', '2026-09-02');
    expect(planStreak(events, null, new Date('2026-09-02T12:00:00Z')).current).toBe(2);
    expect(planStreak(events, null, new Date('2026-09-04T12:00:00Z')).current).toBe(0);
  });
});

describe('pullNextDay', () => {
  it('moves the open entries of the next day with work into today', async () => {
    const { pullNextDay } = await import('../src');
    const fit = fitRoadmap(planRoadmapRules(intake({ end_date: '2026-11-15' }), INDEX, NOW), INDEX, { now: NOW });
    const s = fit.schedule;
    const today = s.days[0].date;
    const next = s.days.find((d) => d.date > today && d.tasks.length)!;
    const out = pullNextDay(s, today, new Set());
    expect(out.days[0].tasks.length).toBe(s.days[0].tasks.length + next.tasks.length);
    expect(out.days.find((d) => d.date === next.date)!.tasks).toEqual([]);
    expect(pullNextDay(s, '1999-01-01')).toBe(s);
  });
});
