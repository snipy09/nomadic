import { describe, expect, it } from 'vitest';
import {
  RoleRoadmapSchema,
  addTopic,
  buildSeedBundle,
  capstoneStepKey,
  catalogCapstone,
  catalogRoleRoadmap,
  indexCatalog,
  matchRoleFamily,
  normaliseCapstone,
  normaliseRoleRoadmap,
  projectReadiness,
  roadmapTopics,
  roleProgress,
  setModuleRemoved,
  setTopicRemoved,
  topicKey,
} from '../src';

const NOW = new Date('2026-10-31T06:00:00Z');
const ID = '00000000-0000-4000-8000-000000000003';
const REQ = { role: 'Quant trader', level: 'beginner' as const, note: '' };

/** What the AI returns for "Quant trader" (shape of the ai-proxy tree answer). */
const AI = {
  summary: 'Maths, programming and markets for an entry-level quant trader role.',
  subjects: [
    { title: 'Mathematics', why: 'Pricing and risk are applied probability.', modules: [
      { title: 'Probability', summary: 'Reason about uncertainty', topics: [
        { title: 'Basic probability', covers: 'Sample spaces, events, counting', search: 'basic probability counting' },
        { title: 'Conditional probability', covers: 'Bayes rule', search: 'conditional probability bayes' },
        { title: 'Basic probability', covers: 'duplicate', search: 'x' },
        { title: 'See https://example.com for more', covers: '', search: '' },
      ] },
      { title: 'Calculus', summary: '', topics: [{ title: 'Derivatives', covers: '', search: '' }] },
      { title: 'Empty module', summary: '', topics: [] },
    ] },
    { title: 'Programming', why: '', modules: [{ title: 'Python', summary: '', topics: [{ title: 'NumPy', covers: 'arrays', search: 'numpy tutorial' }] }] },
    { title: '[Subject name]', why: '', modules: [{ title: 'X', topics: [{ title: 'Y' }] }] },
  ],
  projects: [
    { title: 'Backtest a moving-average strategy', brief: 'Test a crossover', deliverable: 'A notebook', level: 'Starter', hours: 12, uses: ['Python', 'Probability', 'Unknown'] },
    { title: 'Option pricer', brief: '', deliverable: '', level: 'intermediate', hours: 900, uses: [] },
    { title: 'Backtest a moving-average strategy', level: 'stretch', hours: 3, uses: [] },
  ],
};

describe('normaliseRoleRoadmap', () => {
  const r = normaliseRoleRoadmap(AI, REQ, { id: ID, now: NOW })!;
  it('keeps the tree, drops duplicates, links, placeholders and empty modules', () => {
    expect(RoleRoadmapSchema.parse(r)).toBeTruthy();
    expect(r.subjects.map((s) => s.title)).toEqual(['Mathematics', 'Programming']);
    expect(r.subjects[0].modules.map((m) => m.title)).toEqual(['Probability', 'Calculus']);
    const titles = r.subjects[0].modules[0].topics.map((t) => t.title);
    expect(titles).toContain('Basic probability');
    expect(titles.filter((t) => t === 'Basic probability')).toHaveLength(1);
    expect(titles.join(' ')).not.toMatch(/https?:/);
  });
  it('gives stable slug ids and a search phrase for every topic', () => {
    const t = roadmapTopics(r);
    expect(t[0].key).toBe('topic:probability/basic-probability');
    expect(t.every((x) => x.topic.search.length > 0)).toBe(true);
    expect(normaliseRoleRoadmap(AI, REQ, { id: ID, now: NOW })!.subjects).toEqual(r.subjects);
  });
  it('resolves project modules by title and caps hours, without duplicate projects', () => {
    expect(r.projects.map((p) => p.title)).toEqual(['Backtest a moving-average strategy', 'Option pricer']);
    expect(r.projects[0]).toMatchObject({ level: 'starter', hours: 12, uses: ['python', 'probability'], source: 'ai' });
    expect(r.projects[1]).toMatchObject({ level: 'intermediate', hours: 300 });
  });
  it('is null when nothing usable is left', () => {
    expect(normaliseRoleRoadmap({ subjects: [] }, REQ, { id: ID, now: NOW })).toBeNull();
    expect(normaliseRoleRoadmap('nonsense', REQ, { id: ID, now: NOW })).toBeNull();
  });
});

describe('progress and edits', () => {
  const r = normaliseRoleRoadmap(AI, REQ, { id: ID, now: NOW })!;
  it('counts done topics, finds the next one and per-module counts', () => {
    const done = new Set([topicKey('probability', 'basic-probability')]);
    const p = roleProgress(r, done);
    expect(p).toMatchObject({ done: 1, total: 4, percent: 25 });
    expect(p.next?.topic.title).toBe('Conditional probability');
    expect(p.byModule.get('probability')).toEqual({ done: 1, total: 2 });
    expect(p.bySubject.get('mathematics')).toEqual({ done: 1, total: 3 });
    expect(projectReadiness(r.projects[0], p)).toBe(33);
  });
  it('removes and restores a topic or module without losing its id', () => {
    const removed = setTopicRemoved(r, 'probability', 'conditional-probability', true);
    expect(roleProgress(removed, new Set()).total).toBe(3);
    expect(roleProgress(setTopicRemoved(removed, 'probability', 'conditional-probability', false), new Set()).total).toBe(4);
    expect(roleProgress(setModuleRemoved(r, 'probability', true), new Set()).total).toBe(2);
  });
  it('adds the student\'s own topic once', () => {
    const added = addTopic(r, 'calculus', 'Taylor series')!;
    expect(roadmapTopics(added).find((t) => t.topic.title === 'Taylor series')).toMatchObject({ key: 'topic:calculus/taylor-series', topic: { custom: true } });
    expect(addTopic(added, 'calculus', 'taylor series')).toBeNull();
    expect(addTopic(r, 'calculus', '   ')).toBeNull();
  });
  it('counts capstone steps', () => {
    const cap = normaliseCapstone({ milestones: [{ title: 'Get data', steps: [{ title: 'Download prices', done_when: 'You have a DataFrame' }, { title: 'Clean it' }] }] }, r.projects[0].id, NOW)!;
    const withCap = { ...r, capstone: cap };
    const p = roleProgress(withCap, new Set([capstoneStepKey(cap.project_id, 'download-prices')]));
    expect(p.capstone).toEqual({ done: 1, total: 2 });
    expect(cap.milestones[0].steps[1].search).toBe('Clean it');
    expect(normaliseCapstone({ milestones: [] }, 'x', NOW)).toBeNull();
  });
});

describe('catalogue fallback', () => {
  const index = indexCatalog(buildSeedBundle());
  it('matches typed roles to built-in families and nothing else', () => {
    expect(matchRoleFamily('Frontend developer')).toBe('frontend');
    expect(matchRoleFamily('Software Engineer')).toBe('fullstack');
    expect(matchRoleFamily('UX designer')).toBe('design');
    expect(matchRoleFamily('Data Scientist')).toBe('data-ml');
    expect(matchRoleFamily('Quant trader')).toBeNull();
    expect(matchRoleFamily('Chartered accountant')).toBeNull();
  });
  it('builds a valid tree with curated projects for a built-in role', () => {
    const r = catalogRoleRoadmap({ role: 'Backend developer', level: 'beginner', note: '' }, index, { id: ID, now: NOW })!;
    expect(r.source).toBe('catalog');
    expect(r.subjects[0].title).toBe('Role skills');
    expect(roadmapTopics(r).length).toBeGreaterThan(30);
    expect(r.projects.length).toBeGreaterThan(0);
    expect(r.projects.every((p) => p.source === 'curated')).toBe(true);
    expect(catalogRoleRoadmap(REQ, index, { id: ID, now: NOW })).toBeNull();
  });
  it('turns a curated project into a capstone', () => {
    const p = index.catalog.projects[0];
    const cap = catalogCapstone(p, 'p', NOW)!;
    expect(cap.milestones.length).toBe(Math.min(10, p.stages.length));
    expect(cap.milestones[0].steps[0].done_when.length).toBeGreaterThan(0);
  });
});
