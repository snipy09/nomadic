import { describe, expect, it } from 'vitest';
import {
  RESUME_INPUTS,
  buildProblemIndex,
  canStartProject,
  companyBoosts,
  companyKey,
  completeStage,
  criterionKey,
  defaultIntake,
  doneEntries,
  doneTaskIds,
  endDateForWeeks,
  evaluateRepoRules,
  expandRoadmap,
  feasibility,
  finishKit,
  fitRoadmap,
  forecast,
  globToRegExp,
  masteryFromProgress,
  matchGlob,
  mergeMastery,
  moduleProgress,
  parseGithubRepo,
  planRoadmapRules,
  problemStats,
  projectMinutes,
  projectProgress,
  readmeHeadings,
  resolveReviews,
  setCriterionDone,
  setStepDone,
  showNextHint,
  slugFromLink,
  stageProgress,
  startUserProject,
  streamProgress,
  weeklyMinutes,
  type CompanyDataset,
} from '../src';
import { INDEX, NOW, PROJECTS, ev, intake } from './v2-fixtures';

const P = PROJECTS[0];

describe('project progress', () => {
  const up = () => startUserProject('todo-app', NOW, 'setup');
  it('starts active with the first stage started', () => {
    expect(up()).toMatchObject({ status: 'active', stage_started_at: { setup: NOW.toISOString() } });
  });
  it('sums project minutes', () => expect(projectMinutes(P)).toBe(70 + 110 + 45));
  it('counts steps and criteria per stage', () => {
    let u = setStepDone(up(), 'setup', 0, true, NOW);
    u = setCriterionDone(u, 'setup', 'a1', true, NOW);
    expect(stageProgress(P, u)[0]).toMatchObject({ steps_done: 1, steps_total: 3, criteria_done: 1, criteria_total: 3, ready: false });
  });
  it('unticks a step', () => {
    const u = setStepDone(setStepDone(up(), 'setup', 0, true, NOW), 'setup', 0, false, NOW);
    expect(u.steps_done).toEqual([]);
  });
  it('ticking twice keeps one key', () => {
    const u = setStepDone(setStepDone(up(), 'setup', 1, true, NOW), 'setup', 1, true, NOW);
    expect(u.steps_done).toEqual(['setup:1']);
  });
  it('reveals hints one at a time up to the count', () => {
    let u = up();
    for (let k = 0; k < 5; k++) u = showNextHint(u, P.stages[0], NOW);
    expect(u.hints_shown.setup).toBe(2);
  });
  it('a stage cannot be completed before its checks', () => {
    expect(completeStage(P, up(), 'setup', NOW).error).toMatch(/acceptance/);
  });
  it('completing a stage starts the next', () => {
    let u = up();
    for (const c of ['a1', 'a2', 'a3']) u = setCriterionDone(u, 'setup', c, true, NOW);
    const r = completeStage(P, u, 'setup', NOW);
    expect(r.error).toBeNull();
    expect(r.project.stages_done).toEqual(['setup']);
    expect(r.project.stage_started_at.core).toBe(NOW.toISOString());
    expect(r.finished).toBe(false);
  });
  it('completing the last stage finishes the project', () => {
    let u = up();
    for (const s of ['setup', 'core', 'ship']) {
      for (const c of ['a1', 'a2', 'a3']) u = setCriterionDone(u, s, c, true, NOW);
      u = completeStage(P, u, s, NOW).project;
    }
    expect(u.status).toBe('done');
    expect(u.finished_at).toBe(NOW.toISOString());
  });
  it('unknown stage errors', () => expect(completeStage(P, up(), 'nope', NOW).error).toBeTruthy());
  it('project progress reports the current stage', () => {
    expect(projectProgress(P, up())).toMatchObject({ stages_done: 0, stages_total: 3, current_stage_id: 'setup', percent: 0 });
  });
  it('project progress without a user project', () => expect(projectProgress(P, null).minutes_left).toBe(projectMinutes(P)));
  it('criterion keys are stage-scoped', () => expect(criterionKey('core', 'a1')).toBe('core:a1'));
});

describe('project limits', () => {
  const active = (id: string) => ({ ...startUserProject(id, NOW), status: 'active' as const });
  it('free plan: beginner projects only', () => {
    expect(canStartProject(PROJECTS[1], [], { active: 1, beginnerOnly: true })).toMatchObject({ ok: false });
  });
  it('free plan: one active project', () => {
    expect(canStartProject(PROJECTS[2], [active('todo-app')], { active: 1, beginnerOnly: true })).toMatchObject({ ok: false });
  });
  it('resuming an active project is allowed', () => {
    expect(canStartProject(PROJECTS[0], [active('todo-app')], { active: 1, beginnerOnly: true })).toEqual({ ok: true });
  });
  it('done projects do not count', () => {
    expect(canStartProject(PROJECTS[2], [{ ...active('todo-app'), status: 'done' }], { active: 1, beginnerOnly: true })).toEqual({ ok: true });
  });
  it('pro: three active', () => {
    const mine = ['a', 'b'].map(active);
    expect(canStartProject(PROJECTS[1], mine, { active: 3, beginnerOnly: false })).toEqual({ ok: true });
    expect(canStartProject(PROJECTS[1], [...mine, active('c')], { active: 3, beginnerOnly: false })).toMatchObject({ ok: false });
  });
  it('max: unlimited', () => {
    expect(canStartProject(PROJECTS[1], ['a', 'b', 'c', 'd'].map(active), { active: Infinity, beginnerOnly: false })).toEqual({ ok: true });
  });
});

describe('repo check', () => {
  it.each([
    ['https://github.com/octo/hello', { owner: 'octo', repo: 'hello' }],
    ['https://github.com/octo/hello.git', { owner: 'octo', repo: 'hello' }],
    ['github.com/octo/hello/', { owner: 'octo', repo: 'hello' }],
    ['https://github.com/octo/hello/tree/main/src', { owner: 'octo', repo: 'hello' }],
    ['https://gitlab.com/octo/hello', null],
    ['https://github.com/octo', null],
    ['not a url', null],
  ])('parses %s', (url, want) => expect(parseGithubRepo(url)).toEqual(want));

  it.each([
    ['src/**/*.ts', 'src/a/b.ts', true],
    ['src/**/*.ts', 'src/b.ts', true],
    ['src/*.ts', 'src/a/b.ts', false],
    ['README.md', 'readme.md', true],
    ['tests/**', 'tests/unit/a.test.js', true],
    ['*.json', 'package.json', true],
    ['src/?.ts', 'src/a.ts', true],
  ])('glob %s vs %s', (glob, path, ok) => expect(globToRegExp(glob).test(path)).toBe(ok));

  it('matches a directory pattern via its files', () => expect(matchGlob('src/routes', ['src/routes/index.ts'])).toBe(true));
  it('reads README headings', () => expect(readmeHeadings('# Title\n\n## Setup ##\ntext\n### API')).toEqual(['title', 'setup', 'api']));
  it('passes when every rule holds', () => {
    const r = evaluateRepoRules(
      { paths: ['src/**/*.ts'], readme_sections: ['Setup'], min_commits: 1 },
      { paths: ['src/index.ts'], readme: '## Setup\n', commits_since_stage_start: 2 }
    );
    expect(r.ok).toBe(true);
    expect(r.checks).toHaveLength(3);
  });
  it('fails a missing path', () => {
    expect(evaluateRepoRules({ paths: ['tests/**'], readme_sections: [], min_commits: 0 }, { paths: ['src/a.ts'], readme: null, commits_since_stage_start: 0 }).ok).toBe(false);
  });
  it('fails a missing README section', () => {
    expect(evaluateRepoRules({ paths: [], readme_sections: ['API'], min_commits: 0 }, { paths: [], readme: '# x', commits_since_stage_start: 0 }).ok).toBe(false);
  });
  it('fails too few commits', () => {
    expect(evaluateRepoRules({ paths: [], readme_sections: [], min_commits: 2 }, { paths: [], readme: null, commits_since_stage_start: 1 }).ok).toBe(false);
  });
});

describe('finish kit', () => {
  it('README lists finished stages as features', () => {
    const up = { ...startUserProject('todo-app', NOW), stages_done: ['setup'] };
    expect(finishKit(P, up).readme).toMatch(/## Features\n\n- Stage setup/);
  });
  it('README lists the stack', () => expect(finishKit(P, null).readme).toMatch(/- React/));
  it('resume bullets carry no numbers unless typed', () => {
    for (const b of finishKit(P, startUserProject('todo-app', NOW)).resume_bullets) expect(b).not.toMatch(/\d/);
  });
  it('resume bullets use what the student typed', () => {
    const up = { ...startUserProject('todo-app', NOW), resume_inputs: { result: 'cut load time from 3 s to 1 s' } };
    expect(finishKit(P, up).resume_bullets[0]).toMatch(/3 s to 1 s/);
  });
  it('interview questions come from self-checks', () => expect(finishKit(P, null).interview_questions).toHaveLength(6));
  it('has two resume prompts', () => expect(RESUME_INPUTS.map((r) => r.key)).toEqual(['result', 'scale']));
});

describe('problems', () => {
  const dataset: CompanyDataset = {
    Amazon: {
      company: 'Amazon',
      problems: [
        { title: 'Two Sum', difficulty: 'EASY', link: 'https://leetcode.com/problems/two-sum', frequency: '90', topics: ['Array', 'Hash Table'] },
        { title: 'Valid Anagram', difficulty: 'EASY', link: 'https://leetcode.com/problems/valid-anagram', frequency: '80', topics: ['Hash Table', 'String'] },
        { title: 'Alien Dictionary', difficulty: 'HARD', link: 'https://leetcode.com/problems/alien-dictionary', frequency: '70', topics: ['Graph'] },
        { title: 'Course Schedule', difficulty: 'MEDIUM', link: 'https://leetcode.com/problems/course-schedule', frequency: '60', topics: ['Graph'] },
      ],
    },
    'Goldman Sachs': {
      company: 'Goldman Sachs',
      problems: [{ title: 'Two Sum', difficulty: 'EASY', link: 'https://leetcode.com/problems/two-sum/', frequency: '50', topics: ['Array'] }],
    },
  };
  it('slug from link', () => {
    expect(slugFromLink('https://leetcode.com/problems/two-sum/')).toBe('two-sum');
    expect(slugFromLink('https://example.com/x')).toBeNull();
  });
  it('company keys', () => expect(companyKey('Goldman Sachs')).toBe('goldman-sachs'));
  it('index counts companies per problem', () => {
    const idx = buildProblemIndex(dataset);
    expect(idx[0]).toMatchObject({ ref: 'lc:two-sum', companies: 2, difficulty: 'easy' });
  });
  it('index unions tags', () => expect(buildProblemIndex(dataset)[0].tags).toEqual(['Array', 'Hash Table']));
  it('index marks paid-only from the check', () => {
    const idx = buildProblemIndex(dataset, { 'alien-dictionary': true, 'two-sum': false });
    expect(idx.find((p) => p.ref === 'lc:alien-dictionary')!.paid_only).toBe(true);
    expect(idx.find((p) => p.ref === 'lc:course-schedule')!.paid_only).toBeNull();
  });
  it('index links end with a slash', () => expect(buildProblemIndex(dataset)[0].link).toBe('https://leetcode.com/problems/two-sum/'));
  it('boosts pick tagged company problems not already curated', () => {
    const b = companyBoosts({ dataset, index: INDEX, topicIds: ['dsa.arrays.hashing', 'dsa.graphs.bfs'], companies: ['amazon'] });
    expect(b.map((x) => x.topic_id)).toEqual([]);
  });
  it('boosts skip paid-only problems and label the company', () => {
    const b = companyBoosts({ dataset, index: INDEX, topicIds: ['dsa.graphs.bfs'], companies: ['Amazon'], perCompany: 2 });
    expect(b.flatMap((x) => x.problems.map((p) => p.ref))).not.toContain('lc:alien-dictionary');
  });
  it('no boosts without known companies', () => expect(companyBoosts({ dataset, index: INDEX, topicIds: ['dsa.graphs.bfs'], companies: ['nope'] })).toEqual([]));
});

describe('intake', () => {
  it('fills defaults', () => {
    const i = defaultIntake({ role: 'backend' }, '2026-10-05');
    expect(i).toMatchObject({ role: 'backend', start_date: '2026-10-05', end_date: '2026-12-27', weekday_minutes: 60 });
  });
  it('end date for weeks', () => expect(endDateForWeeks('2026-10-05', 4)).toBe('2026-11-01'));
  it('weekly minutes', () => expect(weeklyMinutes({ study_days: [1, 2, 6], weekday_minutes: 60, weekend_minutes: 120 })).toBe(240));
  it('feasibility: full when standard fits', () => expect(feasibility(intake({ end_date: '2027-06-30' }), INDEX).status).toBe('full'));
  it('feasibility: short when nothing fits', () => {
    const f = feasibility(intake({ end_date: '2026-10-07', weekday_minutes: 30, weekend_minutes: 30 }), INDEX);
    expect(f.status).toBe('short');
    expect(f.message).toMatch(/Even the core/);
  });
  it('feasibility needs grow with emphasis', () => {
    const f = feasibility(intake(), INDEX);
    expect(f.needed.light).toBeLessThanOrEqual(f.needed.standard);
    expect(f.needed.standard).toBeLessThanOrEqual(f.needed.deep);
  });
  it('usable is at most available', () => {
    const f = feasibility(intake(), INDEX);
    expect(f.usable_minutes).toBeLessThanOrEqual(f.available_minutes);
  });
});

describe('progress', () => {
  const roadmap = planRoadmapRules(intake(), INDEX, NOW, { id: '00000000-0000-4000-8000-000000000001' });
  const fit = fitRoadmap(roadmap, INDEX, { now: NOW });
  const tasks = expandRoadmap(fit.roadmap, INDEX);

  it('doneEntries: latest event wins', () => {
    const done = doneEntries([
      ev('task_done', '2026-10-05T10:00:00Z', { item_id: 'a' }),
      ev('task_done', '2026-10-05T11:00:00Z', { item_id: 'a', payload: { undone: true } }),
      ev('task_done', '2026-10-05T12:00:00Z', { item_id: 'b' }),
    ]);
    expect([...done]).toEqual(['b']);
  });
  it('doneEntries: re-tick after untick', () => {
    const done = doneEntries([
      ev('task_done', '2026-10-05T10:00:00Z', { item_id: 'a', payload: { undone: true } }),
      ev('task_done', '2026-10-05T11:00:00Z', { item_id: 'a' }),
    ]);
    expect(done.has('a')).toBe(true);
  });
  it('doneEntries: a topic quiz pass completes the quiz task', () => {
    expect(doneEntries([ev('quiz_passed', '2026-10-05T10:00:00Z', { payload: { topic_id: 'dsa.basics.complexity' } })]).has('dsa.basics.complexity/quiz')).toBe(true);
  });
  it('doneTaskIds: split task needs every part', () => {
    const schedule = {
      ...fit.schedule,
      days: [
        { date: '2026-10-05', kind: 'study' as const, capacity: 60, review_minutes: 0, tasks: [{ task_id: 'x', minutes: 30, stream: 'dsa' as const, part: 1, parts: 2 }] },
        { date: '2026-10-06', kind: 'study' as const, capacity: 60, review_minutes: 0, tasks: [{ task_id: 'x', minutes: 30, stream: 'dsa' as const, part: 2, parts: 2 }] },
      ],
    };
    expect(doneTaskIds(new Set(['x@1']), schedule).has('x')).toBe(false);
    expect(doneTaskIds(new Set(['x@1', 'x@2']), schedule).has('x')).toBe(true);
  });
  it('module progress counts done minutes', () => {
    const first = tasks[0];
    const mp = moduleProgress(tasks, new Set([first.id]), fit.schedule).find((m) => m.module_id === first.module_id)!;
    expect(mp.minutes_done).toBe(first.minutes);
    expect(mp.finish_date).not.toBeNull();
  });
  it('stream progress aggregates modules', () => {
    const sp = streamProgress(moduleProgress(tasks, new Set(), fit.schedule));
    expect(sp.every((s) => s.percent === 0)).toBe(true);
    expect(sp.map((s) => s.stream)).toContain('dsa');
  });
  it('forecast: on track at the start', () => expect(forecast(fit.schedule, new Set(), '2026-10-05').status).toBe('on_track'));
  it('forecast: behind after missing days', () => {
    const f = forecast(fit.schedule, new Set(), '2026-10-12');
    expect(f.status).toBe('behind');
    expect(f.projected_finish! >= f.planned_finish!).toBe(true);
  });
  it('forecast: ahead after doing future work', () => {
    const future = fit.schedule.days.filter((d) => d.date > '2026-10-05').slice(0, 3).flatMap((d) => d.tasks.map((t) => (t.parts > 1 ? `${t.task_id}@${t.part}` : t.task_id)));
    expect(forecast(fit.schedule, new Set(future), '2026-10-05').status).toBe('ahead');
  });
  it('forecast reports the day index', () => expect(forecast(fit.schedule, new Set(), '2026-10-07').day_index).toBe(3));
  it('problem stats by difficulty', () => {
    const solve = tasks.find((t) => t.kind === 'solve')!;
    const s = problemStats(tasks, new Set([solve.id]), INDEX);
    expect(s.solved).toBe(1);
    expect(s.planned).toBeGreaterThan(1);
  });
  it('re-solve reviews from solve tasks', () => {
    const r = resolveReviews([ev('task_done', '2026-10-05T10:00:00Z', { item_id: 'dsa.arrays.hashing/solve/two-sum' })]);
    expect(r.get('lc:two-sum')).toMatchObject({ repetitions: 1, interval_days: 1, last_quality: 4 });
  });
  it('a hint lowers the quality to 3', () => {
    const r = resolveReviews([ev('problem_attempted', '2026-10-05T10:00:00Z', { item_id: 'lc:3sum', payload: { hint: true } })]);
    expect(r.get('lc:3sum')!.last_quality).toBe(3);
  });
  it('repeated solves grow the interval', () => {
    const r = resolveReviews([
      ev('problem_attempted', '2026-10-05T10:00:00Z', { item_id: 'lc:3sum', payload: { quality: 4 } }),
      ev('problem_attempted', '2026-10-06T10:00:00Z', { item_id: 'lc:3sum', payload: { quality: 4 } }),
    ]);
    expect(r.get('lc:3sum')!.interval_days).toBe(6);
  });
  it('mastery: nothing done is empty', () => expect(masteryFromProgress(INDEX, [])).toEqual({}));
  it('mastery: a completed topic adds mastery to its skills', () => {
    const at = '2026-10-05T10:00:00Z';
    const events = [
      ev('task_done', at, { item_id: 'cs.oop.pillars/learn' }),
      ev('task_done', at, { item_id: 'cs.oop.pillars/t/mcq' }),
    ];
    const m = masteryFromProgress(INDEX, events);
    expect(m.oop).toBeGreaterThan(0);
    expect(m.oop).toBeLessThan(1);
  });
  it('mastery: learn alone does not complete a topic with core tasks', () => {
    expect(masteryFromProgress(INDEX, [ev('task_done', '2026-10-05T10:00:00Z', { item_id: 'dev.react.components/learn' })]).react).toBeUndefined();
  });
  it('mastery: a solve under another topic id still counts', () => {
    const at = '2026-10-05T10:00:00Z';
    const m = masteryFromProgress(INDEX, [
      ev('task_done', at, { item_id: 'dsa.arrays.hashing/learn' }),
      ev('task_done', at, { item_id: 'somewhere/solve/two-sum' }),
      ev('task_done', at, { item_id: 'dsa.arrays.hashing/solve/contains-duplicate' }),
    ]);
    expect(m.dsa).toBeGreaterThan(0);
  });
  it('mastery: project_done raises the floor to 0.8', () => {
    expect(masteryFromProgress(INDEX, [ev('project_done', '2026-10-05T10:00:00Z', { payload: { skill_ids: ['react'] } })]).react).toBe(0.8);
  });
  it('merges mastery by max', () => expect(mergeMastery({ a: 0.5, b: 0.9 }, { a: 0.7 })).toEqual({ a: 0.7, b: 0.9 }));
});
