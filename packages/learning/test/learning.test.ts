import { describe, expect, it } from 'vitest';
import {
  ROLE_FAMILY_IDS,
  applyPlanAdjustment,
  buildJsHarness,
  buildSeedBundle,
  buildSkillGraph,
  buildTodayQueue,
  completedLessons,
  compareResults,
  deriveMastery,
  deriveReviewStates,
  dueReviews,
  gradeFillIn,
  gradeMcq,
  gradeOrdering,
  gradeRun,
  jobMatch,
  learnTierFor,
  lessonCheckPassed,
  newlyMatchingJobs,
  planTrack,
  qualityFromGrade,
  roleReadiness,
  runCodeItem,
  sm2Step,
  streak,
  tagSkills,
  uuidV5,
  validateContentBundle,
  weeklySummary,
  type CodeItem,
  type CodeRunner,
  type LearningEvent,
  type RawResult,
} from '../src';

const bundle = buildSeedBundle();
const U = 'user-1';
let n = 0;
function ev(type: LearningEvent['type'], at: string, patch: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: uuidV5(`t${n++}`),
    user_id: U,
    type,
    skill_id: null,
    item_id: null,
    payload: {},
    duration_s: 60,
    created_at: at,
    ...patch,
  };
}

describe('seed bundle', () => {
  it('validates with no errors and covers the 8 role families', () => {
    const report = validateContentBundle(bundle);
    expect(report.errors).toEqual([]);
    expect(bundle.roles.map((r) => r.id).sort()).toEqual([...ROLE_FAMILY_IDS].sort());
    expect(bundle.lessons.every((l) => !/https?:\/\//.test(l.summary_md))).toBe(true);
    expect(bundle.resources.every((r) => r.url.startsWith('https://'))).toBe(true);
  });
});

describe('planner', () => {
  const graph = buildSkillGraph(bundle.skills, bundle.prerequisites);
  for (const role of ROLE_FAMILY_IDS) {
    for (const [horizonMonths, dailyHours] of [
      [1, 1],
      [3, 2],
      [6, 4],
    ] as const) {
      it(`${role} ${horizonMonths}m x ${dailyHours}h: valid order, fits budget`, () => {
        const plan = planTrack({ bundle, role, horizonMonths, dailyHours });
        expect(plan.skills.length).toBeGreaterThan(0);
        const pos = new Map(plan.skills.map((s, i) => [s.skill_id, i]));
        for (const s of plan.skills) {
          for (const pre of graph.hard.get(s.skill_id) ?? [])
            if (pos.has(pre)) expect(pos.get(pre)!).toBeLessThan(pos.get(s.skill_id)!);
          expect(s.week).toBeGreaterThanOrEqual(1);
          expect(s.week).toBeLessThanOrEqual(plan.weeks);
        }
        const total = plan.skills.reduce((x, s) => x + s.hours, 0);
        if (plan.skills.length > 1) expect(total).toBeLessThanOrEqual(plan.weeks * plan.hours_per_week + 0.5);
        expect(planTrack({ bundle, role, horizonMonths, dailyHours })).toEqual(plan);
      });
    }
  }
  it('longer horizons cover more skills; mastered skills are skipped', () => {
    const short = planTrack({ bundle, role: 'frontend', horizonMonths: 1, dailyHours: 1 });
    const long = planTrack({ bundle, role: 'frontend', horizonMonths: 6, dailyHours: 4 });
    expect(long.skills.length).toBeGreaterThan(short.skills.length);
    expect(short.deferred.length).toBeGreaterThan(0);
    const mastered = planTrack({
      bundle,
      role: 'frontend',
      horizonMonths: 3,
      dailyHours: 2,
      mastery: { javascript: 1 },
    });
    expect(mastered.skills.some((s) => s.skill_id === 'javascript')).toBe(false);
    expect(mastered.already_mastered).toContain('javascript');
  });
  it('accepts a valid LLM reorder and rejects invalid ones', () => {
    const plan = planTrack({ bundle, role: 'backend', horizonMonths: 3, dailyHours: 2 });
    const ids = plan.skills.map((s) => s.skill_id);
    expect(applyPlanAdjustment(plan, bundle, { order: ids, explanation: 'Fine as is.' }).ok).toBe(true);
    expect(applyPlanAdjustment(plan, bundle, { order: [...ids].reverse(), explanation: 'x' }).reason).toMatch(
      /prerequisite_order/
    );
    expect(applyPlanAdjustment(plan, bundle, { order: ids.slice(1), explanation: 'x' }).reason).toBe(
      'not_a_permutation'
    );
    expect(applyPlanAdjustment(plan, bundle, { order: ids, explanation: 'see https://x.com' }).reason).toBe(
      'invalid_shape'
    );
  });
});

describe('grading', () => {
  const base = {
    id: 'q',
    skill_id: 'javascript',
    lesson_id: null,
    prompt: 'p ___',
    explanation: 'because',
    difficulty: 'easy' as const,
    company_tags: [],
    status: 'published' as const,
    ai_drafted: false,
    version: 1,
  };
  it('mcq, fill-in, ordering', () => {
    const mcq = { ...base, kind: 'mcq' as const, options: ['a', 'b', 'c'], correct: [0, 2] };
    expect(gradeMcq(mcq, [0, 2]).correct).toBe(true);
    expect(gradeMcq(mcq, [0]).score).toBe(0.5);
    expect(gradeMcq(mcq, [0, 1, 2]).correct).toBe(false);
    const fill = { ...base, kind: 'fill_in' as const, blanks: [['PATH', '$PATH']], case_sensitive: false };
    expect(gradeFillIn(fill, ['  path ']).correct).toBe(true);
    const ord = { ...base, kind: 'ordering' as const, items: ['a', 'b', 'c', 'd'] };
    expect(gradeOrdering(ord, ['a', 'b', 'c', 'd']).correct).toBe(true);
    expect(gradeOrdering(ord, ['b', 'a', 'c', 'd']).score).toBe(0.75);
    expect(gradeOrdering(ord, ['a', 'a', 'c', 'd']).score).toBe(0);
    expect(qualityFromGrade({ correct: true, score: 1 })).toBe(5);
    expect(
      lessonCheckPassed([
        { correct: true, score: 1 },
        { correct: true, score: 1 },
        { correct: false, score: 0 },
      ])
    ).toBe(false);
  });

  it('runs the JS harness and grades hidden tests without leaking values', async () => {
    const item = bundle.practice_items.find((p) => p.kind === 'code' && p.language === 'javascript') as CodeItem;
    const nodeRunner: CodeRunner = {
      language: 'javascript',
      async run(code, it) {
        const raw = (await new Function(buildJsHarness(code, it.entry_point, it.tests))()) as RawResult[];
        return { outcomes: compareResults(it.tests, raw), timedOut: false, durationMs: 0 };
      },
    };
    const solution = (await import('../scripts/seed-source/practice')).PRACTICE_SOLUTIONS.find(
      (s) => s.item_id === item.id
    )!;
    expect((await runCodeItem(nodeRunner, item, solution.solution_code)).grade.correct).toBe(true);
    const bad = await runCodeItem(nodeRunner, item, `function ${item.entry_point}() { throw new Error('nope') }`);
    expect(bad.grade.correct).toBe(false);
    expect(bad.run.outcomes.filter((o) => o.hidden).every((o) => o.actual === undefined && o.error === undefined)).toBe(
      true
    );
    expect(gradeRun({ outcomes: [], timedOut: true, durationMs: 0 }).feedback).toMatch(/Time limit/);
  });
});

describe('SM-2 and Today queue', () => {
  it('follows SM-2 intervals and resets on failure', () => {
    const a = sm2Step(null, 5);
    const b = sm2Step(a, 5);
    const c = sm2Step(b, 4);
    expect([a.interval_days, b.interval_days]).toEqual([1, 6]);
    expect(c.interval_days).toBe(Math.round(6 * b.ease));
    expect(sm2Step(c, 1)).toMatchObject({ repetitions: 0, interval_days: 1 });
    expect(sm2Step({ repetitions: 0, interval_days: 0, ease: 1.3 }, 0).ease).toBe(1.3);
  });

  it('a failed question reappears the next day, before the next lesson', () => {
    const events = [ev('quiz_failed', '2026-10-01T10:00:00Z', { item_id: 'javascript-q1', skill_id: 'javascript' })];
    expect(dueReviews(deriveReviewStates(events), new Date('2026-10-01T20:00:00Z'))).toHaveLength(0);
    const plan = planTrack({ bundle, role: 'frontend', horizonMonths: 3, dailyHours: 2 });
    const q = buildTodayQueue({
      bundle,
      plan,
      events,
      mastery: {},
      tier: 'free',
      now: new Date('2026-10-02T10:00:00Z'),
    });
    expect(q.entries[0]).toMatchObject({ kind: 'review', item_id: 'javascript-q1' });
    expect(q.entries.at(-1)?.kind).toBe('lesson');
  });

  it('free tier stops practice after 10 attempts a day; pro does not', () => {
    const day = Array.from({ length: 10 }, (_, i) =>
      ev('quiz_passed', `2026-10-02T0${i % 10}:00:00Z`, { item_id: `x${i}`, skill_id: 'git' })
    );
    const plan = planTrack({ bundle, role: 'frontend', horizonMonths: 3, dailyHours: 2 });
    const now = new Date('2026-10-02T12:00:00Z');
    expect(buildTodayQueue({ bundle, plan, events: day, mastery: {}, tier: 'free', now })).toMatchObject({
      limitReached: true,
      practiceRemaining: 0,
    });
    expect(buildTodayQueue({ bundle, plan, events: day, mastery: {}, tier: 'pro', now }).limitReached).toBe(false);
    expect([learnTierFor('trial'), learnTierFor('pro'), learnTierFor('lifetime'), learnTierFor(null)]).toEqual([
      'free',
      'pro',
      'max',
      'free',
    ]);
  });
});

describe('progress from events', () => {
  it('streak and weekly summary respect the timezone', () => {
    const events = ['2026-09-29T20:00:00Z', '2026-09-30T20:00:00Z', '2026-10-01T20:00:00Z'].map((t) =>
      ev('lesson_viewed', t, { skill_id: 'git' })
    );
    // 20:00Z is the next day in IST (+330), so the streak still holds on 2026-10-02 IST.
    expect(streak(events, new Date('2026-10-02T05:00:00Z'), 330)).toEqual({
      current: 3,
      longest: 3,
      activeToday: true,
    });
    expect(streak(events, new Date('2026-10-04T05:00:00Z'), 0).current).toBe(0);
    expect(weeklySummary(events, new Date('2026-10-02T00:00:00Z')).lessons).toBe(3);
  });

  it('mastery needs repeated success; viewing alone counts for nothing; placement sets a floor', () => {
    const one = deriveMastery([ev('quiz_passed', '2026-10-01T00:00:00Z', { skill_id: 'git' })]);
    expect(one.git).toBeLessThan(0.8);
    const three = deriveMastery(
      ['01', '02', '03'].map((d) => ev('quiz_passed', `2026-10-${d}T00:00:00Z`, { skill_id: 'git' }))
    );
    expect(three.git).toBe(1);
    expect(deriveMastery([ev('lesson_viewed', '2026-10-01T00:00:00Z', { skill_id: 'git' })]).git).toBeUndefined();
    expect(
      deriveMastery([ev('skill_marked_known', '2026-10-01T00:00:00Z', { skill_id: 'css', payload: { mastery: 0.9 } })])
        .css
    ).toBe(0.9);
  });

  it('a passed lesson check completes the lesson and masters the skill; item attempts do not', () => {
    const item = ev('quiz_passed', '2026-10-01T00:00:00Z', { skill_id: 'git', item_id: 'git-q1' });
    const check = ev('quiz_passed', '2026-10-01T00:01:00Z', {
      skill_id: 'git',
      payload: { lesson_id: 'lesson-git', score: 1 },
    });
    expect(deriveMastery([item]).git).toBeLessThan(0.8);
    expect(deriveMastery([item, check]).git).toBeGreaterThanOrEqual(0.8);
    expect([...completedLessons([item, check])]).toEqual(['lesson-git']);
    expect(completedLessons([item]).size).toBe(0);
  });
});

describe('readiness and job match', () => {
  it('tags skills and computes match with top missing skills', () => {
    const tags = tagSkills('Senior React developer, TypeScript, Node.js and PostgreSQL', bundle.skills);
    expect(tags).toEqual(expect.arrayContaining(['react', 'typescript']));
    const m = jobMatch(bundle, ['react', 'typescript', 'css'], { react: 1, typescript: 1 }, 'frontend');
    expect(m.score).toBeGreaterThan(50);
    expect(m.score).toBeLessThan(100);
    expect(m.missing.map((x) => x.skill_id)).toEqual(['css']);
    expect(roleReadiness(bundle, 'frontend', {}).score).toBe(0);
    const jobs = [{ id: 'j', skill_ids: ['react', 'css'], role: 'frontend' as const }];
    expect(newlyMatchingJobs(bundle, jobs, { react: 1 }, { react: 1, css: 1 })).toHaveLength(1);
  });
});

describe('link checker', () => {
  it('classifies responses and only hides after repeated unknown failures', async () => {
    const { checkResource, nextResourceState } = await import('../scripts/check-links');
    const res = (status: number) => (async () => ({ status }) as Response) as unknown as typeof fetch;
    expect(await checkResource('https://a', res(200))).toEqual({ status: 'active', http_status: 200 });
    expect(await checkResource('https://a', res(404))).toEqual({ status: 'broken', http_status: 404 });
    expect((await checkResource('https://a', res(503))).status).toBe('unknown');
    expect(nextResourceState({ status: 'active', fail_count: 0 }, { status: 'unknown', http_status: 503 })).toEqual({
      status: 'active',
      fail_count: 1,
    });
    expect(
      nextResourceState({ status: 'active', fail_count: 2 }, { status: 'unknown', http_status: null }).status
    ).toBe('broken');
    expect(nextResourceState({ status: 'broken', fail_count: 5 }, { status: 'active', http_status: 200 })).toEqual({
      status: 'active',
      fail_count: 0,
    });
  });
});
