import { describe, expect, it } from 'vitest';
import {
  MODULE_MOCK_MINUTES,
  addDays,
  compareModules,
  dateRange,
  dayOfWeek,
  daysBetween,
  expandRoadmap,
  findModuleCycle,
  formatDay,
  indexCatalog,
  isWeekend,
  moduleHardClosure,
  moduleMinutes,
  moduleTasks,
  orderModules,
  projectTasks,
  slugOfRef,
  stageChunks,
  tiersFor,
  totalMinutes,
  type RoadmapModule,
} from '../src';
import { CATALOG, INDEX, MODULES, PROJECTS, intake, mod, prob, topic } from './v2-fixtures';

const rm = (module_id: string, emphasis: RoadmapModule['emphasis'] = 'standard', patch: Partial<RoadmapModule> = {}): RoadmapModule => ({
  module_id,
  emphasis,
  skip_topics: [],
  why: '',
  added_for: null,
  custom: null,
  ...patch,
});
const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id);

describe('dates', () => {
  it('adds days across month ends', () => expect(addDays('2026-10-31', 1)).toBe('2026-11-01'));
  it('subtracts days', () => expect(addDays('2026-03-01', -1)).toBe('2026-02-28'));
  it('knows the weekday', () => expect(dayOfWeek('2026-10-05')).toBe(1));
  it('detects weekends', () => {
    expect(isWeekend('2026-10-10')).toBe(true);
    expect(isWeekend('2026-10-11')).toBe(true);
    expect(isWeekend('2026-10-12')).toBe(false);
  });
  it('counts days between', () => expect(daysBetween('2026-10-05', '2026-10-19')).toBe(14));
  it('lists an inclusive range', () => expect(dateRange('2026-10-05', '2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']));
  it('formats a day', () => expect(formatDay('2026-10-20')).toBe('Tue 20 Oct'));
});

describe('catalogue', () => {
  it('indexes topics per module in order', () => {
    expect(INDEX.topicsByModule.get('dsa.arrays')!.map((t) => t.id)).toEqual([
      'dsa.arrays.hashing',
      'dsa.arrays.two-pointers',
      'dsa.arrays.extra',
    ]);
  });
  it('indexes problems by ref', () => expect(INDEX.problems.get('lc:two-sum')?.difficulty).toBe('easy'));
  it('finds the hard prerequisite closure', () => {
    expect([...moduleHardClosure(INDEX, ['dsa.graphs'])].sort()).toEqual(['dsa.arrays', 'dsa.basics']);
  });
  it('closure excludes the start ids', () => expect(moduleHardClosure(INDEX, ['dsa.basics']).size).toBe(0));
  it('finds no cycle in the fixture', () => expect(findModuleCycle(MODULES)).toBeNull());
  it('finds a cycle', () => {
    const a = mod('a', { prerequisites: [{ module_id: 'b', kind: 'hard' }] });
    const b = mod('b', { prerequisites: [{ module_id: 'a', kind: 'soft' }] });
    expect(findModuleCycle([a, b])).toEqual(expect.arrayContaining(['a', 'b']));
  });
  it('orders prerequisites first', () => {
    expect(orderModules(INDEX, ['dsa.graphs', 'dsa.arrays', 'dsa.basics'])).toEqual(['dsa.basics', 'dsa.arrays', 'dsa.graphs']);
  });
  it('keeps caller order as the tie-break', () => {
    expect(orderModules(INDEX, ['cs.oop', 'int.hr', 'dsa.basics'])).toEqual(['cs.oop', 'int.hr', 'dsa.basics']);
  });
  it('still returns every id on a cycle', () => {
    const a = mod('a', { prerequisites: [{ module_id: 'b', kind: 'hard' }] });
    const b = mod('b', { prerequisites: [{ module_id: 'a', kind: 'hard' }] });
    const idx = indexCatalog({ modules: [a, b], topics: [], problems: [], projects: [] });
    expect(orderModules(idx, ['a', 'b']).sort()).toEqual(['a', 'b']);
  });
  it('sorts modules by stream then order', () => {
    const sorted = [...MODULES].sort(compareModules).map((m) => m.stream);
    expect(sorted.indexOf('core_cs')).toBeGreaterThan(sorted.lastIndexOf('dsa'));
  });
  it('strips the lc: prefix', () => expect(slugOfRef('lc:two-sum')).toBe('two-sum'));
});

describe('expansion', () => {
  it.each([
    ['light', ['core']],
    ['standard', ['core', 'standard']],
    ['deep', ['core', 'standard', 'optional']],
  ] as const)('emphasis %s selects tiers', (e, tiers) => expect(tiersFor(e)).toEqual(tiers));

  it('light emphasis keeps only core topics', () => {
    const t = moduleTasks(INDEX, rm('dsa.basics', 'light'));
    expect(t.some((x) => x.topic_id === 'dsa.basics.loops')).toBe(false);
  });
  it('standard emphasis adds standard topics', () => {
    expect(moduleTasks(INDEX, rm('dsa.basics')).some((x) => x.topic_id === 'dsa.basics.loops')).toBe(true);
  });
  it('deep emphasis adds optional topics', () => {
    expect(moduleTasks(INDEX, rm('dsa.arrays', 'deep')).some((x) => x.topic_id === 'dsa.arrays.extra')).toBe(true);
  });
  it('skip_topics removes a topic', () => {
    const t = moduleTasks(INDEX, rm('dsa.arrays', 'standard', { skip_topics: ['dsa.arrays.hashing'] }));
    expect(t.some((x) => x.topic_id === 'dsa.arrays.hashing')).toBe(false);
  });
  it('learn tasks of 30+ minutes are splittable', () => {
    const t = moduleTasks(INDEX, rm('dsa.basics'));
    expect(t.find((x) => x.id === 'dsa.basics.complexity/learn')!.splittable).toBe(true);
    expect(t.find((x) => x.id === 'dsa.basics.loops/learn')!.splittable).toBe(false);
  });
  it('uses the topic learn kind', () => {
    expect(moduleTasks(INDEX, rm('cs.oop')).find((x) => x.id === 'cs.oop.pillars/learn')!.kind).toBe('read');
  });
  it('emits authored tasks with their ids', () => {
    expect(ids(moduleTasks(INDEX, rm('cs.oop')))).toContain('cs.oop.pillars/t/mcq');
  });
  it('keeps optional authored tasks marked optional', () => {
    expect(moduleTasks(INDEX, rm('dev.js')).find((x) => x.id === 'dev.js.basics/t/extra')!.optional).toBe(true);
  });
  it('light emphasis solves only must problems', () => {
    const t = moduleTasks(INDEX, rm('dsa.arrays', 'light')).filter((x) => x.kind === 'solve');
    expect(t.map((x) => x.problem_ref)).toEqual(['lc:two-sum', 'lc:3sum']);
  });
  it('standard emphasis adds good problems', () => {
    const t = moduleTasks(INDEX, rm('dsa.arrays')).filter((x) => x.kind === 'solve');
    expect(t.map((x) => x.problem_ref)).toEqual(['lc:two-sum', 'lc:contains-duplicate', 'lc:3sum', 'lc:trapping-rain-water']);
  });
  it('deep emphasis adds stretch problems as optional', () => {
    const s = moduleTasks(INDEX, rm('dsa.arrays', 'deep')).find((x) => x.problem_ref === 'lc:valid-anagram')!;
    expect(s.optional).toBe(true);
  });
  it.each([
    ['lc:two-sum', 20],
    ['lc:3sum', 40],
    ['lc:trapping-rain-water', 60],
  ])('solve %s takes %i minutes', (ref, minutes) => {
    expect(moduleTasks(INDEX, rm('dsa.arrays')).find((x) => x.problem_ref === ref)!.minutes).toBe(minutes);
  });
  it('dedupes problem slugs within a module', () => {
    const refs = moduleTasks(INDEX, rm('dsa.arrays')).filter((x) => x.kind === 'solve').map((x) => x.problem_ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
  it('dedupes problem slugs across modules', () => {
    const seen = new Set<string>(['two-sum']);
    expect(moduleTasks(INDEX, rm('dsa.arrays'), seen).some((x) => x.problem_ref === 'lc:two-sum')).toBe(false);
  });
  it('keeps paid-only problems out of must, even at standard', () => {
    expect(moduleTasks(INDEX, rm('dsa.graphs')).some((x) => x.problem_ref === 'lc:alien-dictionary')).toBe(false);
  });
  it('adds paid-only problems as optional stretch at deep', () => {
    const t = moduleTasks(INDEX, rm('dsa.graphs', 'deep')).find((x) => x.problem_ref === 'lc:alien-dictionary')!;
    expect(t.optional).toBe(true);
    expect(t.note).toBe('LeetCode Premium');
  });
  it('adds a quiz when the topic has 2+ items', () => {
    expect(ids(moduleTasks(INDEX, rm('dsa.basics')))).toContain('dsa.basics.complexity/quiz');
  });
  it('quiz is 10 min for 5 or fewer items, 15 above', () => {
    expect(moduleTasks(INDEX, rm('dsa.basics')).find((x) => x.kind === 'quiz')!.minutes).toBe(10);
    expect(moduleTasks(INDEX, rm('dsa.arrays')).find((x) => x.kind === 'quiz')!.minutes).toBe(15);
  });
  it('no quiz for a topic without items', () => {
    expect(ids(moduleTasks(INDEX, rm('dev.react')))).not.toContain('dev.react.components/quiz');
  });
  it('ends a DSA module with a module check', () => {
    const t = moduleTasks(INDEX, rm('dsa.arrays'));
    expect(t[t.length - 1]).toMatchObject({ id: 'mock/dsa.arrays', kind: 'mock', minutes: MODULE_MOCK_MINUTES });
  });
  it('no module check for language modules', () => {
    expect(ids(moduleTasks(INDEX, rm('lang.cpp')))).not.toContain('mock/lang.cpp');
  });
  it('no module check outside DSA', () => expect(ids(moduleTasks(INDEX, rm('cs.oop'))).some((i) => i.startsWith('mock/'))).toBe(false));
  it('tasks carry the module stream', () => {
    expect(new Set(moduleTasks(INDEX, rm('dev.js')).map((t) => t.stream))).toEqual(new Set(['dev']));
  });
  it('unknown modules expand to nothing', () => expect(moduleTasks(INDEX, rm('nope'))).toEqual([]));
  it('company boosts are optional and labelled', () => {
    const boosts = [{ topic_id: 'dsa.arrays.hashing', problems: [prob('valid-anagram', 'easy')], companies: { 'lc:valid-anagram': 'Amazon' } }];
    const t = moduleTasks(INDEX, rm('dsa.arrays'), new Set(), boosts).find((x) => x.problem_ref === 'lc:valid-anagram')!;
    expect(t).toMatchObject({ optional: true, note: "On Amazon's list" });
  });
});

describe('projects in expansion', () => {
  const p = PROJECTS[0];
  it('chunks stage steps into at most 60 minutes', () => {
    expect(stageChunks(p, 'core').map((c) => c.minutes)).toEqual([60, 50]);
  });
  it('keeps step indexes per chunk', () => expect(stageChunks(p, 'core').map((c) => c.steps)).toEqual([[0, 1], [2, 3]]));
  it('a small stage is one chunk', () => expect(stageChunks(p, 'ship')).toHaveLength(1));
  it('unknown stage has no chunks', () => expect(stageChunks(p, 'nope')).toEqual([]));
  it('build task ids follow proj/<id>/<stage>/<k>', () => {
    expect(ids(projectTasks(p, 'project.todo-app'))).toEqual([
      'proj/todo-app/setup/1',
      'proj/todo-app/setup/2',
      'proj/todo-app/core/1',
      'proj/todo-app/core/2',
      'proj/todo-app/ship/1',
    ]);
  });
  it('build tasks are dev stream, kind build', () => {
    expect(projectTasks(p, 'x').every((t) => t.kind === 'build' && t.stream === 'dev')).toBe(true);
  });
  it('inserts project tasks after after_module', () => {
    const tasks = expandRoadmap(
      { modules: [rm('dev.js'), rm('cs.oop')], projects: [{ project_id: 'todo-app', after_module: 'dev.js', why: '' }], boosts: [] },
      INDEX
    );
    const firstProj = tasks.findIndex((t) => t.project_id);
    const firstOop = tasks.findIndex((t) => t.module_id === 'cs.oop');
    expect(firstProj).toBeLessThan(firstOop);
    expect(tasks[firstProj - 1].module_id).toBe('dev.js');
  });
  it('appends project tasks at the end without an anchor', () => {
    const tasks = expandRoadmap(
      { modules: [rm('dev.js'), rm('cs.oop')], projects: [{ project_id: 'todo-app', after_module: null, why: '' }], boosts: [] },
      INDEX
    );
    expect(tasks[tasks.length - 1].project_id).toBe('todo-app');
  });
  it('skips unknown projects', () => {
    const tasks = expandRoadmap({ modules: [rm('dev.js')], projects: [{ project_id: 'ghost', after_module: null, why: '' }], boosts: [] }, INDEX);
    expect(tasks.some((t) => t.project_id)).toBe(false);
  });
});

describe('roadmap expansion', () => {
  it('walks modules in roadmap order', () => {
    const tasks = expandRoadmap({ modules: [rm('cs.oop'), rm('dsa.basics')], projects: [], boosts: [] }, INDEX);
    expect(tasks[0].module_id).toBe('cs.oop');
  });
  it('dedupes problems across the whole roadmap', () => {
    const tasks = expandRoadmap({ modules: [rm('dsa.arrays'), rm('dsa.graphs')], projects: [], boosts: [] }, INDEX);
    const refs = tasks.filter((t) => t.problem_ref).map((t) => t.problem_ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
  it('custom modules produce custom.<n>.<topic>/t/<task> ids', () => {
    const tasks = expandRoadmap(
      {
        modules: [
          rm('custom.1', 'standard', {
            custom: { title: 'Flutter', summary: '', stream: 'dev', topics: [{ key: 'widgets', title: 'Widgets', summary: '', tasks: [{ key: 't1', kind: 'learn', title: 'Widgets', minutes: 30 }] }] },
          }),
        ],
        projects: [],
        boosts: [],
      },
      INDEX
    );
    expect(tasks).toEqual([expect.objectContaining({ id: 'custom.1.widgets/t/t1', stream: 'dev', note: 'AI-generated, not reviewed' })]);
  });
  it('module minutes grow with emphasis', () => {
    const m = moduleMinutes(INDEX, 'dsa.arrays');
    expect(m.light).toBeLessThan(m.standard);
    expect(m.standard).toBeLessThan(m.deep);
  });
  it('sums minutes', () => expect(totalMinutes([{ minutes: 10 }, { minutes: 25 }])).toBe(35));
  it('catalogue fixture parses', () => {
    expect(CATALOG.topics.length).toBeGreaterThan(10);
    expect(topic('x.y', 'x').tier).toBe('core');
    expect(intake().language).toBe('cpp');
  });
});
