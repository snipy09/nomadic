import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APP_IDEAS,
  DATA_IDEAS,
  ProjectSchema,
  generatedProject,
  generatedProjectId,
  generatedSummaries,
  generatedSummary,
  generatorStacks,
  isGeneratedProjectId,
  projectMinutes,
  type ContentBundle,
} from '../src';

const bundle = JSON.parse(readFileSync(new URL('../seed/bundle.json', import.meta.url), 'utf8')) as ContentBundle;
const skillIds = new Set(bundle.skills.map((s) => s.id));
const moduleIds = new Set(bundle.modules.map((m) => m.id));
const topicIds = new Set(bundle.topics.map((t) => t.id));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('ideas and stacks', () => {
  it('have unique, slug-shaped keys', () => {
    const keys = [...APP_IDEAS.map((i) => i.key), ...DATA_IDEAS.map((i) => i.key)];
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(SLUG);
    const stacks = generatorStacks().map((s) => s.key);
    expect(new Set(stacks).size).toBe(stacks.length);
    for (const k of stacks) expect(k).toMatch(SLUG);
  });

  it('app ideas are well formed', () => {
    for (const idea of APP_IDEAS) {
      const where = idea.key;
      expect(idea.pitch.length, where).toBeLessThanOrEqual(220);
      expect(idea.why.length, where).toBeLessThanOrEqual(160);
      expect(idea.entity.fields.length, where).toBeGreaterThanOrEqual(3);
      expect(idea.entity.fields.length, where).toBeLessThanOrEqual(6);
      expect(idea.entity.fields.some((f) => f.type === 'text'), where).toBe(true);
      for (const f of idea.entity.fields) {
        expect(f.name, where).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        if (f.type === 'enum') {
          expect(f.options?.length ?? 0, `${where}.${f.name}`).toBeGreaterThanOrEqual(2);
          for (const o of f.options ?? []) expect(o, `${where}.${f.name}`).toMatch(/^[a-z0-9][a-z0-9 -]*$/);
        }
      }
      expect(new Set(idea.entity.fields.map((f) => f.name)).size, where).toBe(idea.entity.fields.length);
      expect(idea.features).toHaveLength(3);
      expect(idea.kinds.length, where).toBeGreaterThan(0);
    }
  });

  it('stacks point at real skills and modules', () => {
    for (const s of generatorStacks()) {
      for (const id of s.skills) expect(skillIds.has(id), `${s.key} skill ${id}`).toBe(true);
      for (const id of s.modules) expect(moduleIds.has(id), `${s.key} module ${id}`).toBe(true);
      expect(s.tech.length).toBeGreaterThan(0);
      expect(s.tech.length).toBeLessThanOrEqual(6);
      expect(s.levels.length).toBeGreaterThan(0);
    }
  });
});

describe('generated library', () => {
  const all = generatedSummaries();

  it('has unique ids that round-trip', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const s of all) {
      expect(isGeneratedProjectId(s.id)).toBe(true);
      expect(generatedSummary(s.id)).toBe(s);
      expect(s.id).toBe(generatedProjectId(s.idea, s.stack, s.level));
    }
  });

  it('builds every project strictly: schema-valid, no clipped text, real topic links', () => {
    let built = 0;
    for (const s of all) {
      const p = generatedProject(s.id, { strict: true });
      expect(p, s.id).not.toBeNull();
      const parsed = ProjectSchema.safeParse(p);
      if (!parsed.success) throw new Error(`${s.id}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      expect(projectMinutes(parsed.data), s.id).toBe(s.minutes);
      expect(parsed.data.stages.length, s.id).toBe(s.stages);
      for (const st of parsed.data.stages) for (const t of st.topic_ids) expect(topicIds.has(t), `${s.id} ${st.id} topic ${t}`).toBe(true);
      expect(new Set(parsed.data.stages.map((x) => x.id)).size, s.id).toBe(parsed.data.stages.length);
      built++;
    }
    expect(built).toBe(all.length);
  });

  it('covers every kind of project, thousands in total', () => {
    const kinds = new Set(all.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(['backend', 'cli', 'data', 'devops', 'frontend', 'fullstack', 'ml', 'mobile']);
    expect(all.length).toBeGreaterThan(4000);
  });

  it('caches built projects and rejects unknown ids', () => {
    const id = all[0].id;
    expect(generatedProject(id)).toBe(generatedProject(id));
    expect(generatedProject('g.nope.react.b')).toBeNull();
    expect(generatedProject(`${id.slice(0, -1)}z`)).toBeNull();
    expect(generatedProject('not-generated')).toBeNull();
  });

  it('beginner projects are shorter than advanced ones of the same idea and stack', () => {
    for (const s of all.filter((x) => x.level === 'advanced')) {
      const b = generatedSummary(generatedProjectId(s.idea, s.stack, 'beginner'));
      if (b) expect(b.minutes, s.id).toBeLessThan(s.minutes);
    }
  });
});
