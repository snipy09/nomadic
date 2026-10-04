import { describe, expect, it } from 'vitest';
import {
  AIM_STREAMS,
  RoadmapSchema,
  applyRoadmapDiff,
  cleanText,
  defaultEmphasis,
  enabledStreams,
  normaliseAiRoadmap,
  normaliseShares,
  pickProjects,
  planRoadmapRules,
  projectAnchor,
  roleShares,
  selectModules,
  slugify,
  type Roadmap,
} from '../src';
import { INDEX, NOW, PROJECTS, intake, mod } from './v2-fixtures';

const ID = '00000000-0000-4000-8000-000000000001';
const rules = (patch: Parameters<typeof intake>[0] = {}) => planRoadmapRules(intake(patch), INDEX, NOW, { id: ID });
const moduleIds = (r: Roadmap) => r.modules.map((m) => m.module_id);

describe('streams', () => {
  it.each([
    ['campus', ['dsa', 'core_cs', 'dev', 'aptitude', 'interview']],
    ['internship', ['dsa', 'core_cs', 'dev', 'interview']],
    ['offcampus', ['dsa', 'core_cs', 'dev', 'interview']],
    ['switch', ['dsa', 'dev', 'core_cs', 'interview']],
  ] as const)('aim %s enables its streams', (aim, streams) => expect(AIM_STREAMS[aim]).toEqual(streams));

  it('narrows to the streams the student picked', () => {
    expect(enabledStreams({ aim: 'campus', role: 'frontend', streams: ['dsa', 'dev'] })).toEqual(['dsa', 'dev']);
  });
  it('drops zero-share streams for the role', () => {
    expect(enabledStreams({ aim: 'campus', role: 'design', streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'] })).toEqual([
      'dev',
      'aptitude',
      'interview',
    ]);
  });
  it('falls back to the aim streams when the choice is empty after filtering', () => {
    expect(enabledStreams({ aim: 'switch', role: 'frontend', streams: ['aptitude'] })).toEqual(AIM_STREAMS.switch);
  });
  it('role shares sum to 100', () => {
    const s = roleShares({ aim: 'campus', role: 'frontend', streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'] });
    expect(Object.values(s).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    expect(s).toEqual({ dsa: 40, core_cs: 15, dev: 35, aptitude: 5, interview: 5 });
  });
  it('role shares renormalise over enabled streams', () => {
    const s = roleShares({ aim: 'internship', role: 'frontend', streams: ['dsa', 'core_cs', 'dev', 'interview'] });
    expect(Object.values(s).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    expect(s.aptitude).toBeUndefined();
  });
  it.each([
    [{ dsa: 1, dev: 1, core_cs: 1 }],
    [{ dsa: 33.3, dev: 33.3, core_cs: 33.4 }],
    [{ dsa: 7, dev: 0, interview: 2 }],
    [{ dsa: 45, dev: 35, core_cs: 15, aptitude: 5 }],
  ])('normaliseShares sums to 100 (%o)', (w) => {
    expect(Object.values(normaliseShares(w)).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
  });
  it('normaliseShares drops zero and negative weights', () => expect(normaliseShares({ dsa: 0, dev: -3, core_cs: 2 })).toEqual({ core_cs: 100 }));
  it('normaliseShares of nothing is empty', () => expect(normaliseShares({})).toEqual({}));
});

describe('text helpers', () => {
  it('strips URLs', () => expect(cleanText('see https://x.com/a now', 100)).toBe('see now'));
  it('strips www links', () => expect(cleanText('go www.example.com', 100)).toBe('go'));
  it('strips emails', () => expect(cleanText('mail a@b.co please', 100)).toBe('mail please'));
  it('clips with an ellipsis', () => expect(cleanText('abcdefghij', 5)).toBe('abcd…'));
  it('non-strings become empty', () => expect(cleanText(42, 10)).toBe(''));
  it('slugifies', () => expect(slugify('Widgets & Layout!', 'x')).toBe('widgets-layout'));
  it('slugify falls back', () => expect(slugify('!!!', 'topic-1')).toBe('topic-1'));
});

describe('rules planner', () => {
  it('produces a valid roadmap', () => expect(RoadmapSchema.safeParse(rules()).success).toBe(true));
  it('is source rules', () => expect(rules().source).toBe('rules'));
  it('includes only the chosen language module', () => {
    const ids = moduleIds(rules({ language: 'java' }));
    expect(ids).toContain('lang.java');
    expect(ids).not.toContain('lang.cpp');
  });
  it('filters modules by role', () => {
    expect(moduleIds(rules({ role: 'frontend' }))).not.toContain('dev.backend');
    expect(moduleIds(rules({ role: 'backend' }))).toContain('dev.backend');
  });
  it('filters modules by aim', () => {
    expect(moduleIds(rules({ aim: 'campus' }))).toContain('apt.quant');
    expect(moduleIds(rules({ aim: 'offcampus' }))).not.toContain('apt.quant');
  });
  it('advanced DSA is only for its role families', () => {
    expect(moduleIds(rules({ role: 'frontend' }))).toContain('dsa.graphs');
    expect(moduleIds(rules({ role: 'data-analyst' }))).not.toContain('dsa.graphs');
  });
  it('orders prerequisites before dependants', () => {
    const ids = moduleIds(rules());
    expect(ids.indexOf('dsa.basics')).toBeLessThan(ids.indexOf('dsa.arrays'));
    expect(ids.indexOf('dev.js')).toBeLessThan(ids.indexOf('dev.react'));
  });
  it('defaults to standard emphasis for a new student', () => {
    expect(defaultEmphasis(mod('m', { level: 3 }), { levels: { dsa: 'new', core_cs: 'new', dev: 'new', aptitude: 'new' }, known_skill_ids: [] })).toBe('standard');
  });
  it('light when the stream level is comfortable', () => {
    expect(defaultEmphasis(mod('m', { level: 4 }), { levels: { dsa: 'comfortable', core_cs: 'new', dev: 'new', aptitude: 'new' }, known_skill_ids: [] })).toBe('light');
  });
  it('light for easy modules when the student knows some', () => {
    expect(defaultEmphasis(mod('m', { level: 2 }), { levels: { dsa: 'some', core_cs: 'new', dev: 'new', aptitude: 'new' }, known_skill_ids: [] })).toBe('light');
  });
  it('light when all module skills are known', () => {
    expect(
      defaultEmphasis(mod('m', { level: 4, skill_ids: ['a', 'b'] }), {
        levels: { dsa: 'new', core_cs: 'new', dev: 'new', aptitude: 'new' },
        known_skill_ids: ['a', 'b'],
      })
    ).toBe('light');
  });
  it('upgrades modules to deep when time is spare', () => {
    expect(rules({ end_date: '2027-06-30' }).modules.some((m) => m.emphasis === 'deep')).toBe(true);
  });
  it('does not upgrade when time is tight', () => {
    expect(rules({ end_date: '2026-10-18', weekday_minutes: 30, weekend_minutes: 30 }).modules.some((m) => m.emphasis === 'deep')).toBe(false);
  });
  it('warns when the plan is over budget', () => {
    expect(rules({ end_date: '2026-10-11', weekday_minutes: 30, weekend_minutes: 30 }).warnings.length).toBeGreaterThan(0);
  });
  it('has no warnings when it fits', () => expect(rules({ end_date: '2027-06-30' }).warnings).toEqual([]));
  it('writes a summary from a template', () => expect(rules().summary).toMatch(/12-week frontend plan/));
  it('picks a project for the role', () => expect(rules().projects.map((p) => p.project_id)).toContain('todo-app'));
  it('anchors the project after its last prerequisite module', () => {
    expect(rules().projects.find((p) => p.project_id === 'todo-app')!.after_module).toBe('dev.js');
  });
  it('beginner-only limits projects', () => {
    const r = planRoadmapRules(intake({ levels: { dsa: 'new', core_cs: 'new', dev: 'some', aptitude: 'new' } }), INDEX, NOW, {
      beginnerProjectsOnly: true,
    });
    expect(r.projects.every((p) => INDEX.projects.get(p.project_id)!.level === 'beginner')).toBe(true);
  });
  it('picks intermediate projects for some dev experience', () => {
    const ps = pickProjects(intake({ levels: { dsa: 'new', core_cs: 'new', dev: 'some', aptitude: 'new' } }), INDEX);
    expect(ps[0].level).toBe('intermediate');
  });
  it('project anchor is null without prerequisites in the roadmap', () => expect(projectAnchor(PROJECTS[0], ['cs.oop'])).toBeNull());
  it('selectModules respects language', () => {
    expect(selectModules(intake({ language: 'python' }), INDEX).some((m) => m.language)).toBe(false);
  });
  it('stream shares only for streams with modules', () => {
    const r = rules({ aim: 'offcampus' });
    expect(r.streams.aptitude).toBeUndefined();
  });
});

describe('AI normaliser', () => {
  const i = intake();
  const norm = (raw: unknown) => normaliseAiRoadmap(raw, i, INDEX, NOW, { id: ID });

  it('returns null for empty output', () => expect(norm({})).toBeNull());
  it('returns null for garbage', () => expect(norm('nope')).toBeNull());
  it('returns null when no catalogue module survives', () => expect(norm({ modules: [{ module_id: 'ghost', emphasis: 'deep' }] })).toBeNull());
  it('drops unknown modules with a warning', () => {
    const r = norm({ modules: [{ module_id: 'dsa.basics', emphasis: 'light' }, { module_id: 'ghost' }] })!;
    expect(moduleIds(r)).toEqual(['dsa.basics']);
    expect(r.warnings.join(' ')).toMatch(/unknown module/);
  });
  it('dedupes modules', () => {
    expect(moduleIds(norm({ modules: [{ module_id: 'cs.oop' }, { module_id: 'cs.oop' }] })!)).toEqual(['cs.oop']);
  });
  it('adds missing hard prerequisites at light emphasis', () => {
    const r = norm({ modules: [{ module_id: 'dsa.graphs', emphasis: 'deep' }] })!;
    expect(moduleIds(r)).toEqual(['dsa.basics', 'dsa.arrays', 'dsa.graphs']);
    expect(r.modules[0]).toMatchObject({ emphasis: 'light', added_for: expect.any(String) });
  });
  it('sorts topologically with the AI order as tie-break', () => {
    const r = norm({ modules: [{ module_id: 'cs.oop' }, { module_id: 'dsa.arrays' }, { module_id: 'dsa.basics' }] })!;
    expect(moduleIds(r)).toEqual(['cs.oop', 'dsa.basics', 'dsa.arrays']);
  });
  it('defaults a bad emphasis to standard', () => expect(norm({ modules: [{ module_id: 'cs.oop', emphasis: 'max' }] })!.modules[0].emphasis).toBe('standard'));
  it('drops modules for another language', () => expect(norm({ modules: [{ module_id: 'lang.java' }, { module_id: 'cs.oop' }] })!.modules.map((m) => m.module_id)).toEqual(['cs.oop']));
  it('drops modules outside the enabled streams', () => {
    const r = normaliseAiRoadmap({ modules: [{ module_id: 'apt.quant' }, { module_id: 'cs.oop' }] }, intake({ aim: 'offcampus' }), INDEX, NOW)!;
    expect(moduleIds(r)).toEqual(['cs.oop']);
  });
  it('keeps only known skip_topics', () => {
    const r = norm({ modules: [{ module_id: 'dsa.arrays', skip_topics: ['dsa.arrays.extra', 'ghost'] }] })!;
    expect(r.modules.find((m) => m.module_id === 'dsa.arrays')!.skip_topics).toEqual(['dsa.arrays.extra']);
  });
  it('normalises stream shares to 100 over present streams', () => {
    const r = norm({ modules: [{ module_id: 'cs.oop' }, { module_id: 'dsa.basics' }], streams: [{ stream: 'dsa', percent: 70 }, { stream: 'core_cs', percent: 50 }, { stream: 'dev', percent: 40 }] })!;
    expect(Object.values(r.streams).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    expect(r.streams.dev).toBeUndefined();
  });
  it('fills shares for streams the AI forgot', () => {
    const r = norm({ modules: [{ module_id: 'cs.oop' }, { module_id: 'dsa.basics' }], streams: [{ stream: 'dsa', percent: 100 }] })!;
    expect(r.streams.core_cs).toBeGreaterThan(0);
  });
  it('strips URLs from why and summary', () => {
    const r = norm({ summary: 'Plan https://evil.example now', modules: [{ module_id: 'cs.oop', why: 'see www.x.com' }] })!;
    expect(r.summary).not.toMatch(/https?:|www\./);
    expect(r.modules[0].why).not.toMatch(/www\./);
  });
  it('caps custom modules at 3', () => {
    const custom = Array.from({ length: 5 }, (_, k) => ({ title: `C${k}`, stream: 'dev', topics: [{ title: 'T', tasks: [{ kind: 'learn', title: 'Do', minutes: 30 }] }] }));
    expect(norm({ modules: [{ module_id: 'cs.oop' }], custom_modules: custom })!.modules.filter((m) => m.custom)).toHaveLength(3);
  });
  it('caps custom topics at 8 and tasks at 6', () => {
    const topics = Array.from({ length: 10 }, (_, k) => ({ title: `T${k}`, tasks: Array.from({ length: 9 }, (_, j) => ({ kind: 'learn', title: `x${j}`, minutes: 20 })) }));
    const c = norm({ modules: [{ module_id: 'cs.oop' }], custom_modules: [{ title: 'C', stream: 'dev', topics }] })!.modules.find((m) => m.custom)!.custom!;
    expect(c.topics).toHaveLength(8);
    expect(c.topics.every((t) => t.tasks.length === 6)).toBe(true);
  });
  it('clamps custom task minutes to 10–60', () => {
    const c = norm({
      modules: [{ module_id: 'cs.oop' }],
      custom_modules: [{ title: 'C', stream: 'dev', topics: [{ title: 'T', tasks: [{ kind: 'learn', title: 'a', minutes: 2 }, { kind: 'build', title: 'b', minutes: 500 }] }] }],
    })!.modules.find((m) => m.custom)!.custom!;
    expect(c.topics[0].tasks.map((t) => t.minutes)).toEqual([10, 60]);
  });
  it('custom modules get custom.<n> ids', () => {
    const r = norm({ modules: [{ module_id: 'cs.oop' }], custom_modules: [{ title: 'Flutter', stream: 'dev', topics: [{ title: 'Widgets', tasks: [{ kind: 'learn', title: 'Read', minutes: 30 }] }] }] })!;
    expect(r.modules.find((m) => m.custom)!.module_id).toBe('custom.1');
  });
  it('unknown custom task kinds become learn', () => {
    const c = norm({ modules: [{ module_id: 'cs.oop' }], custom_modules: [{ title: 'C', stream: 'dev', topics: [{ title: 'T', tasks: [{ kind: 'dance', title: 'a', minutes: 20 }] }] }] })!
      .modules.find((m) => m.custom)!.custom!;
    expect(c.topics[0].tasks[0].kind).toBe('learn');
  });
  it('drops custom modules without topics', () => {
    expect(norm({ modules: [{ module_id: 'cs.oop' }], custom_modules: [{ title: 'Empty', stream: 'dev', topics: [] }] })!.modules.some((m) => m.custom)).toBe(false);
  });
  it('keeps at most 3 projects', () => {
    const projects = ['todo-app', 'dashboard', 'api-server', 'todo-app'].map((project_id) => ({ project_id }));
    expect(norm({ modules: [{ module_id: 'dev.js' }], projects })!.projects.length).toBeLessThanOrEqual(3);
  });
  it('drops unknown projects with a warning', () => {
    const r = norm({ modules: [{ module_id: 'dev.js' }], projects: [{ project_id: 'ghost' }] })!;
    expect(r.projects).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/unknown project/);
  });
  it('after_module must be a dev module in the roadmap', () => {
    const r = norm({
      modules: [{ module_id: 'dev.js' }, { module_id: 'cs.oop' }],
      projects: [
        { project_id: 'todo-app', after_module: 'dev.js' },
        { project_id: 'dashboard', after_module: 'cs.oop' },
      ],
    })!;
    expect(r.projects.map((p) => p.after_module)).toEqual(['dev.js', null]);
  });
  it('beginner-only drops harder projects', () => {
    const r = normaliseAiRoadmap({ modules: [{ module_id: 'dev.js' }], projects: [{ project_id: 'dashboard' }] }, i, INDEX, NOW, { beginnerProjectsOnly: true })!;
    expect(r.projects).toEqual([]);
  });
  it('produces a schema-valid roadmap', () => {
    const r = norm({ summary: 'ok', modules: [{ module_id: 'dsa.graphs', emphasis: 'deep', why: 'Graphs matter.' }], warnings: ['Tight.'] })!;
    expect(RoadmapSchema.safeParse(r).success).toBe(true);
    expect(r.source).toBe('ai');
  });
  it('fills a summary when the AI gives none', () => expect(norm({ modules: [{ module_id: 'cs.oop' }] })!.summary.length).toBeGreaterThan(0));
});

describe('applyRoadmapDiff', () => {
  const base = () => rules();
  it('adds a module with its prerequisites', () => {
    const r0 = { ...base(), modules: base().modules.filter((m) => !m.module_id.startsWith('dsa.')) };
    const { roadmap } = applyRoadmapDiff(r0, { add: [{ module_id: 'dsa.graphs', emphasis: 'deep' }] }, INDEX);
    expect(moduleIds(roadmap)).toEqual(expect.arrayContaining(['dsa.basics', 'dsa.arrays', 'dsa.graphs']));
    expect(moduleIds(roadmap).indexOf('dsa.basics')).toBeLessThan(moduleIds(roadmap).indexOf('dsa.graphs'));
  });
  it('removes a module', () => {
    expect(moduleIds(applyRoadmapDiff(base(), { remove: ['int.hr'] }, INDEX).roadmap)).not.toContain('int.hr');
  });
  it('keeps a removed module another module needs, with a warning', () => {
    const r = applyRoadmapDiff(base(), { remove: ['dsa.basics'] }, INDEX);
    expect(moduleIds(r.roadmap)).toContain('dsa.basics');
    expect(r.warnings.join(' ')).toMatch(/Kept/);
  });
  it('removes a prerequisite together with its dependants', () => {
    const r = applyRoadmapDiff(base(), { remove: ['dsa.basics', 'dsa.arrays', 'dsa.graphs'] }, INDEX);
    expect(moduleIds(r.roadmap).some((id) => id.startsWith('dsa.'))).toBe(false);
  });
  it('changes emphasis', () => {
    expect(applyRoadmapDiff(base(), { emphasis: [{ module_id: 'cs.oop', emphasis: 'deep' }] }, INDEX).roadmap.modules.find((m) => m.module_id === 'cs.oop')!.emphasis).toBe('deep');
  });
  it('ignores unknown modules with a warning', () => {
    const r = applyRoadmapDiff(base(), { add: [{ module_id: 'ghost', emphasis: 'standard' }] }, INDEX);
    expect(r.warnings.join(' ')).toMatch(/unknown module/);
  });
  it('updates streams and renormalises', () => {
    const r = applyRoadmapDiff(base(), { streams: [{ stream: 'dsa', percent: 80 }] }, INDEX).roadmap;
    expect(Object.values(r.streams).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    expect(r.streams.dsa!).toBeGreaterThan(base().streams.dsa!);
  });
  it('adds blackouts and flags a calendar change', () => {
    const r = applyRoadmapDiff(base(), { blackouts_add: ['2026-11-10', '2026-11-11'] }, INDEX);
    expect(r.roadmap.intake.blackouts).toEqual(['2026-11-10', '2026-11-11']);
    expect(r.calendarChanged).toBe(true);
  });
  it('ignores blackouts before the start', () => {
    expect(applyRoadmapDiff(base(), { blackouts_add: ['2020-01-01'] }, INDEX).roadmap.intake.blackouts).toEqual([]);
  });
  it('changes weekday and weekend minutes', () => {
    const r = applyRoadmapDiff(base(), { weekday_minutes: 90, weekend_minutes: 240 }, INDEX);
    expect(r.roadmap.intake).toMatchObject({ weekday_minutes: 90, weekend_minutes: 240 });
    expect(r.calendarChanged).toBe(true);
  });
  it('changes the end date', () => {
    expect(applyRoadmapDiff(base(), { end_date: '2027-01-31' }, INDEX).roadmap.intake.end_date).toBe('2027-01-31');
  });
  it('rejects an end date before the start', () => {
    const r = applyRoadmapDiff(base(), { end_date: '2026-01-01' }, INDEX);
    expect(r.roadmap.intake.end_date).toBe(base().intake.end_date);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('no calendar change for module edits', () => expect(applyRoadmapDiff(base(), { remove: ['int.hr'] }, INDEX).calendarChanged).toBe(false));
  it('adds and removes projects', () => {
    const r = applyRoadmapDiff(base(), { project_add: ['dashboard'], project_remove: ['todo-app'] }, INDEX).roadmap;
    expect(r.projects.map((p) => p.project_id)).toContain('dashboard');
    expect(r.projects.map((p) => p.project_id)).not.toContain('todo-app');
  });
  it('clears a project anchor whose module was removed', () => {
    const r0 = { ...base(), projects: [{ project_id: 'todo-app', after_module: 'int.hr', why: '' }] };
    expect(applyRoadmapDiff(r0, { remove: ['int.hr'] }, INDEX).roadmap.projects[0].after_module).toBeNull();
  });
  it('honours an explicit order where prerequisites allow', () => {
    const r = applyRoadmapDiff(base(), { order: ['int.hr', 'cs.oop'] }, INDEX).roadmap;
    expect(moduleIds(r)[0]).toBe('int.hr');
  });
  it('never orders a module before its prerequisite', () => {
    const r = applyRoadmapDiff(base(), { order: ['dsa.graphs', 'dsa.arrays', 'dsa.basics'] }, INDEX).roadmap;
    expect(moduleIds(r).indexOf('dsa.basics')).toBeLessThan(moduleIds(r).indexOf('dsa.graphs'));
  });
  it('keeps the roadmap schema-valid', () => {
    const r = applyRoadmapDiff(base(), { add: [{ module_id: 'dev.backend', emphasis: 'light' }], streams: [{ stream: 'dev', percent: 50 }] }, INDEX).roadmap;
    expect(RoadmapSchema.safeParse(r).success).toBe(true);
  });
});
