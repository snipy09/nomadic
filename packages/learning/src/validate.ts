/**
 * Referential and structural checks for a content bundle. Used by the seed
 * builder, the seed script and tests; the admin editor can reuse it.
 */
import { buildSkillGraph, findCycle } from './graph';
import { ContentBundleSchema, type ContentBundle } from './types';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

export function validateContentBundle(input: unknown): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = ContentBundleSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), warnings };
  }
  const b: ContentBundle = parsed.data;
  const skillIds = new Set(b.skills.map((s) => s.id));
  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id: ${id}`);
      seen.add(id);
    }
  };
  dup('skill', b.skills.map((s) => s.id));
  dup('resource', b.resources.map((r) => r.id));
  dup('lesson', b.lessons.map((l) => l.id));
  dup('practice item', b.practice_items.map((p) => p.id));
  dup('resource url', b.resources.map((r) => r.url));

  for (const p of b.prerequisites) {
    if (!skillIds.has(p.skill_id)) errors.push(`prerequisite references unknown skill ${p.skill_id}`);
    if (!skillIds.has(p.prerequisite_id)) errors.push(`prerequisite references unknown skill ${p.prerequisite_id}`);
    if (p.skill_id === p.prerequisite_id) errors.push(`skill ${p.skill_id} lists itself as prerequisite`);
  }
  const cycle = findCycle(buildSkillGraph(b.skills, b.prerequisites));
  if (cycle) errors.push(`prerequisite cycle: ${cycle.join(' -> ')}`);

  const roleIds = new Set(b.roles.map((r) => r.id));
  for (const rs of b.role_skills) {
    if (!roleIds.has(rs.role_id)) errors.push(`role_skills references unknown role ${rs.role_id}`);
    if (!skillIds.has(rs.skill_id)) errors.push(`role ${rs.role_id} references unknown skill ${rs.skill_id}`);
  }
  for (const r of b.roles) {
    if (!b.role_skills.some((rs) => rs.role_id === r.id)) errors.push(`role ${r.id} has no skills`);
  }

  const resourceIds = new Set(b.resources.map((r) => r.id));
  for (const r of b.resources) {
    for (const s of r.skill_ids) if (!skillIds.has(s)) errors.push(`resource ${r.id} references unknown skill ${s}`);
    if (/[?&](search_query|q)=/.test(r.url) && /youtube\.com\/results|google\.[a-z.]+\/search/.test(r.url)) {
      errors.push(`resource ${r.id} is a search-results page, not curated content`);
    }
  }
  const lessonIds = new Set(b.lessons.map((l) => l.id));
  for (const l of b.lessons) {
    if (!skillIds.has(l.skill_id)) errors.push(`lesson ${l.id} references unknown skill ${l.skill_id}`);
    for (const r of l.resource_ids) if (!resourceIds.has(r)) errors.push(`lesson ${l.id} references unknown resource ${r}`);
  }
  for (const s of b.skills) {
    if (!b.lessons.some((l) => l.skill_id === s.id)) errors.push(`skill ${s.id} has no lesson`);
    if (!b.practice_items.some((p) => p.skill_id === s.id)) errors.push(`skill ${s.id} has no practice item`);
    if (!b.resources.some((r) => r.skill_ids.includes(s.id))) warnings.push(`skill ${s.id} has no curated resource yet`);
  }
  for (const p of b.practice_items) {
    if (!skillIds.has(p.skill_id)) errors.push(`practice item ${p.id} references unknown skill ${p.skill_id}`);
    if (p.lesson_id && !lessonIds.has(p.lesson_id)) errors.push(`practice item ${p.id} references unknown lesson ${p.lesson_id}`);
    if (p.kind === 'mcq') {
      for (const c of p.correct) if (c >= p.options.length) errors.push(`mcq ${p.id} correct index ${c} out of range`);
      if (new Set(p.options).size !== p.options.length) errors.push(`mcq ${p.id} has duplicate options`);
    }
    if (p.kind === 'fill_in') {
      const blanks = (p.prompt.match(/___/g) ?? []).length;
      if (blanks !== p.blanks.length) errors.push(`fill_in ${p.id} has ${blanks} blanks in prompt but ${p.blanks.length} answer sets`);
    }
    if (p.kind === 'ordering' && new Set(p.items).size !== p.items.length) errors.push(`ordering ${p.id} has duplicate steps`);
    if (p.kind === 'code' && !p.tests.some((t) => !t.hidden)) warnings.push(`code ${p.id} has no visible example test`);
  }
  return { errors, warnings };
}
