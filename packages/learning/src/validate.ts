/**
 * Referential and structural checks for a content bundle. Used by the seed
 * builder, the seed script and tests; the admin editor can reuse it.
 */
import { buildSkillGraph, findCycle } from './graph';
import { ContentBundleSchema, type ContentBundle } from './types';
import { findModuleCycle } from './v2/catalog';

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
  dup(
    'skill',
    b.skills.map((s) => s.id)
  );
  dup(
    'resource',
    b.resources.map((r) => r.id)
  );
  dup(
    'lesson',
    b.lessons.map((l) => l.id)
  );
  dup(
    'practice item',
    b.practice_items.map((p) => p.id)
  );
  dup(
    'resource url',
    b.resources.map((r) => r.url)
  );

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
    for (const r of l.resource_ids)
      if (!resourceIds.has(r)) errors.push(`lesson ${l.id} references unknown resource ${r}`);
  }
  for (const s of b.skills) {
    if (!b.lessons.some((l) => l.skill_id === s.id)) errors.push(`skill ${s.id} has no lesson`);
    if (!b.practice_items.some((p) => p.skill_id === s.id)) errors.push(`skill ${s.id} has no practice item`);
    if (!b.resources.some((r) => r.skill_ids.includes(s.id)))
      warnings.push(`skill ${s.id} has no curated resource yet`);
  }
  for (const p of b.practice_items) {
    if (!skillIds.has(p.skill_id)) errors.push(`practice item ${p.id} references unknown skill ${p.skill_id}`);
    if (p.lesson_id && !lessonIds.has(p.lesson_id))
      errors.push(`practice item ${p.id} references unknown lesson ${p.lesson_id}`);
    if (p.kind === 'mcq') {
      for (const c of p.correct) if (c >= p.options.length) errors.push(`mcq ${p.id} correct index ${c} out of range`);
      if (new Set(p.options).size !== p.options.length) errors.push(`mcq ${p.id} has duplicate options`);
    }
    if (p.kind === 'fill_in') {
      const blanks = (p.prompt.match(/___/g) ?? []).length;
      if (blanks !== p.blanks.length)
        errors.push(`fill_in ${p.id} has ${blanks} blanks in prompt but ${p.blanks.length} answer sets`);
    }
    if (p.kind === 'ordering' && new Set(p.items).size !== p.items.length)
      errors.push(`ordering ${p.id} has duplicate steps`);
    if (p.kind === 'code' && !p.tests.some((t) => !t.hidden)) warnings.push(`code ${p.id} has no visible example test`);
  }
  validateV2(b, errors, warnings);
  return { errors, warnings };
}

/** Learn v2 catalogue checks: ids, references, module cycles, problem refs and paid-only placement. */
function validateV2(b: ContentBundle, errors: string[], warnings: string[]): void {
  const skillIds = new Set(b.skills.map((s) => s.id));
  const resourceIds = new Set(b.resources.map((r) => r.id));
  const itemIds = new Set(b.practice_items.map((p) => p.id));
  const moduleIds = new Set(b.modules.map((m) => m.id));
  const topicIds = new Set(b.topics.map((t) => t.id));
  const problems = new Map(b.problems.map((p) => [p.ref, p]));
  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id: ${id}`);
      seen.add(id);
    }
  };
  dup('module', b.modules.map((m) => m.id));
  dup('topic', b.topics.map((t) => t.id));
  dup('project', b.projects.map((p) => p.id));
  dup('problem', b.problems.map((p) => p.ref));

  for (const m of b.modules) {
    for (const p of m.prerequisites) {
      if (!moduleIds.has(p.module_id)) errors.push(`module ${m.id} requires unknown module ${p.module_id}`);
      if (p.module_id === m.id) errors.push(`module ${m.id} lists itself as prerequisite`);
    }
    for (const s of m.skill_ids) if (!skillIds.has(s)) errors.push(`module ${m.id} references unknown skill ${s}`);
    if (!b.topics.some((t) => t.module_id === m.id)) errors.push(`module ${m.id} has no topics`);
  }
  const cycle = findModuleCycle(b.modules);
  if (cycle) errors.push(`module prerequisite cycle: ${cycle.join(' -> ')}`);

  for (const t of b.topics) {
    if (!moduleIds.has(t.module_id)) errors.push(`topic ${t.id} references unknown module ${t.module_id}`);
    if (!t.id.startsWith(`${t.module_id}.`)) errors.push(`topic ${t.id} must start with its module id ${t.module_id}`);
    for (const s of t.skill_ids) if (!skillIds.has(s)) errors.push(`topic ${t.id} references unknown skill ${s}`);
    for (const r of t.resource_ids) if (!resourceIds.has(r)) errors.push(`topic ${t.id} references unknown resource ${r}`);
    for (const q of t.quiz_item_ids) if (!itemIds.has(q)) errors.push(`topic ${t.id} references unknown practice item ${q}`);
    const keys = new Set<string>();
    for (const k of t.tasks) {
      if (keys.has(k.key)) errors.push(`topic ${t.id} has duplicate task key ${k.key}`);
      keys.add(k.key);
    }
    const all = [...t.problems.must, ...t.problems.good, ...t.problems.stretch];
    if (new Set(all).size !== all.length) errors.push(`topic ${t.id} lists a problem twice`);
    for (const ref of all) if (!problems.has(ref)) errors.push(`topic ${t.id} references problem ${ref} that is not in the dataset`);
    for (const ref of [...t.problems.must, ...t.problems.good]) {
      if (problems.get(ref)?.paid_only === true) errors.push(`topic ${t.id} lists paid-only ${ref} outside stretch`);
    }
    if (!t.resource_ids.length) warnings.push(`topic ${t.id} has no resource yet`);
  }

  for (const p of b.projects) {
    for (const s of p.skill_ids) if (!skillIds.has(s)) errors.push(`project ${p.id} references unknown skill ${s}`);
    for (const m of p.prerequisite_modules) if (!moduleIds.has(m)) errors.push(`project ${p.id} requires unknown module ${m}`);
    dup(`stage in ${p.id}`, p.stages.map((s) => s.id));
    for (const st of p.stages) {
      for (const t of st.topic_ids) if (!topicIds.has(t)) errors.push(`project ${p.id} stage ${st.id} references unknown topic ${t}`);
      for (const r of st.resource_ids) if (!resourceIds.has(r)) errors.push(`project ${p.id} stage ${st.id} references unknown resource ${r}`);
      dup(`acceptance in ${p.id}/${st.id}`, st.acceptance.map((a) => a.id));
    }
  }
}
