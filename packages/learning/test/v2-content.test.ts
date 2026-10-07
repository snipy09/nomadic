import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIMS,
  RoadmapSchema,
  ROLE_FAMILY_IDS,
  buildProblemIndex,
  buildSeedBundle,
  expandRoadmap,
  fitRoadmap,
  indexCatalog,
  planRoadmapRules,
  validateContentBundle,
  type CompanyDataset,
  type IntakeInput,
} from '../src';
import { IntakeSchema } from '../src/v2/types';

const bundle = buildSeedBundle();
const index = indexCatalog(bundle);
const dataset = JSON.parse(
  readFileSync(new URL('../../../packages/app-core/data/practice/leetcode-companies.json', import.meta.url), 'utf8')
) as CompanyDataset;
const NOW = new Date('2026-10-05T06:00:00Z');
const intake = (patch: Partial<IntakeInput>) =>
  IntakeSchema.parse({
    role: 'fullstack',
    aim: 'campus',
    start_date: '2026-10-05',
    end_date: '2026-12-27',
    study_days: [1, 2, 3, 4, 5, 6, 0],
    weekday_minutes: 60,
    weekend_minutes: 150,
    streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
    ...patch,
  });

describe('Learn v2 seed content', () => {
  it('validates with no errors', () => expect(validateContentBundle(bundle).errors).toEqual([]));
  it('has 18 DSA modules and 3 language modules', () => {
    const dsa = bundle.modules.filter((m) => m.stream === 'dsa');
    expect(dsa.filter((m) => !m.language)).toHaveLength(18);
    expect(dsa.filter((m) => m.language).map((m) => m.language).sort()).toEqual(['cpp', 'java', 'python']);
  });
  it('has 5 core CS, 3 aptitude and 2 interview modules', () => {
    expect(bundle.modules.filter((m) => m.stream === 'core_cs')).toHaveLength(5);
    expect(bundle.modules.filter((m) => m.stream === 'aptitude')).toHaveLength(3);
    expect(bundle.modules.filter((m) => m.stream === 'interview')).toHaveLength(2);
  });
  it('has 12 projects, 3 per SDE role family, each role with a beginner project', () => {
    expect(bundle.projects).toHaveLength(12);
    for (const role of ['frontend', 'backend', 'fullstack', 'devops'] as const) {
      expect(bundle.projects.some((p) => p.role_families.includes(role) && p.level === 'beginner')).toBe(true);
    }
  });
  it('marks all v2 content as AI-drafted drafts', () => {
    for (const x of [...bundle.modules, ...bundle.topics, ...bundle.projects]) {
      expect(x.status).toBe('draft');
      expect(x.ai_drafted).toBe(true);
    }
  });
  it('adds the seven new skills with a lesson and a practice item each', () => {
    for (const id of ['oop', 'operating-systems', 'computer-networks', 'dbms', 'aptitude-quant', 'aptitude-logical', 'aptitude-verbal']) {
      expect(bundle.skills.some((s) => s.id === id)).toBe(true);
      expect(bundle.lessons.some((l) => l.skill_id === id)).toBe(true);
      expect(bundle.practice_items.some((p) => p.skill_id === id)).toBe(true);
    }
  });
  it('every dev module names its role families (empty would mean every role)', () => {
    for (const m of bundle.modules.filter((x) => x.stream === 'dev')) expect(m.role_families.length).toBeGreaterThan(0);
  });
  it('every problem matches the LeetCode company dataset', () => {
    const fresh = new Map(buildProblemIndex(dataset).map((p) => [p.ref, p]));
    for (const p of bundle.problems) {
      const d = fresh.get(p.ref);
      expect(d, p.ref).toBeDefined();
      expect(p.companies).toBe(d!.companies);
      expect(p.difficulty).toBe(d!.difficulty);
    }
  });
  it('paid-only problems are never must or good', () => {
    const paid = new Set(bundle.problems.filter((p) => p.paid_only).map((p) => p.ref));
    for (const t of bundle.topics) for (const r of [...t.problems.must, ...t.problems.good]) expect(paid.has(r), `${t.id} ${r}`).toBe(false);
  });
  it('no lesson or task text carries a URL', () => {
    for (const t of bundle.topics) {
      expect(t.summary_md).not.toMatch(/https?:\/\/|www\./);
      for (const k of t.tasks) expect(k.title).not.toMatch(/https?:\/\//);
    }
  });
  it('new resources start unverified with the learn-v2 source', () => {
    const v2 = bundle.resources.filter((r) => r.source.startsWith('learn-v2'));
    expect(v2.length).toBeGreaterThan(20);
    for (const r of v2) expect(['unverified', 'active', 'broken']).toContain(r.status);
  });
});

describe('rules planner over the real catalogue', () => {
  for (const role of ROLE_FAMILY_IDS) {
    for (const aim of AIMS) {
      it(`${role} / ${aim} gives a valid, schedulable roadmap`, () => {
        const r = planRoadmapRules(intake({ role, aim }), index, NOW);
        expect(RoadmapSchema.safeParse(r).success).toBe(true);
        expect(r.modules.length).toBeGreaterThan(0);
        const ids = expandRoadmap(r, index).map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        const fit = fitRoadmap(r, index, { now: NOW });
        expect(fit.schedule.days).toHaveLength(84);
        const placed = new Set(fit.schedule.days.flatMap((d) => d.tasks.map((e) => e.task_id)));
        for (const l of fit.schedule.left_out) expect(placed.has(l.task_id)).toBe(false);
      });
    }
  }
  it('aptitude only appears for campus aims', () => {
    expect(planRoadmapRules(intake({ aim: 'campus' }), index, NOW).modules.some((m) => m.module_id.startsWith('apt.'))).toBe(true);
    expect(planRoadmapRules(intake({ aim: 'offcampus' }), index, NOW).modules.some((m) => m.module_id.startsWith('apt.'))).toBe(false);
  });
  it('the chosen DSA language module is included', () => {
    const ids = planRoadmapRules(intake({ language: 'python' }), index, NOW).modules.map((m) => m.module_id);
    expect(ids).toContain('lang.python');
    expect(ids).not.toContain('lang.cpp');
  });
  it('a full-stack plan picks a project', () => {
    expect(planRoadmapRules(intake({}), index, NOW).projects.length).toBeGreaterThan(0);
  });
});
