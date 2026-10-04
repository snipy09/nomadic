/**
 * Roadmap expansion: turns a roadmap (modules + emphasis + projects) into the
 * ordered list of plan tasks the scheduler packs into days.
 */
import { SOLVE_MINUTES, slugOfRef, type CatalogIndex } from './catalog';
import type { Emphasis, PlanTask, ProblemInfo, Project, Roadmap, RoadmapModule, TopicTier } from './types';

const TIERS: Record<Emphasis, TopicTier[]> = {
  light: ['core'],
  standard: ['core', 'standard'],
  deep: ['core', 'standard', 'optional'],
};

export function tiersFor(emphasis: Emphasis): TopicTier[] {
  return TIERS[emphasis];
}

export const MODULE_MOCK_MINUTES = 40;
export const PROJECT_CHUNK_MINUTES = 60;

/** Consecutive steps of a stage grouped into chunks of at most 60 minutes. */
export function stageChunks(project: Project, stageId: string): Array<{ k: number; steps: number[]; minutes: number }> {
  const stage = project.stages.find((s) => s.id === stageId);
  if (!stage) return [];
  const out: Array<{ k: number; steps: number[]; minutes: number }> = [];
  let cur: { k: number; steps: number[]; minutes: number } | null = null;
  stage.steps.forEach((step, i) => {
    if (!cur || cur.minutes + step.minutes > PROJECT_CHUNK_MINUTES) {
      cur = { k: out.length + 1, steps: [], minutes: 0 };
      out.push(cur);
    }
    cur.steps.push(i);
    cur.minutes += step.minutes;
  });
  return out;
}

/** Build tasks for a whole project, stage by stage. */
export function projectTasks(project: Project, moduleId: string): PlanTask[] {
  const out: PlanTask[] = [];
  for (const stage of [...project.stages].sort((a, b) => a.order - b.order)) {
    const chunks = stageChunks(project, stage.id);
    for (const c of chunks) {
      out.push({
        id: `proj/${project.id}/${stage.id}/${c.k}`,
        kind: 'build',
        title:
          chunks.length > 1
            ? `${project.title}: ${stage.title} (part ${c.k} of ${chunks.length})`
            : `${project.title}: ${stage.title}`,
        minutes: c.minutes,
        stream: 'dev',
        module_id: moduleId,
        topic_id: null,
        optional: false,
        splittable: false,
        project_id: project.id,
        stage_id: stage.id,
        steps: c.steps,
      });
    }
  }
  return out;
}

function solveTask(topicId: string, moduleId: string, p: ProblemInfo, optional: boolean, note?: string): PlanTask {
  const slug = slugOfRef(p.ref);
  return {
    id: `${topicId}/solve/${slug}`,
    kind: 'solve',
    title: p.title,
    minutes: SOLVE_MINUTES[p.difficulty],
    stream: 'dsa',
    module_id: moduleId,
    topic_id: topicId,
    optional,
    splittable: false,
    problem_ref: p.ref,
    ...(note ? { note } : {}),
  };
}

function quizMinutes(items: number): number {
  return items <= 5 ? 10 : 15;
}

/** Tasks for one catalogue module at an emphasis (no projects). `seen` dedupes problem slugs. */
export function moduleTasks(
  index: CatalogIndex,
  rm: Pick<RoadmapModule, 'module_id' | 'emphasis' | 'skip_topics'>,
  seen: Set<string> = new Set(),
  boosts: Roadmap['boosts'] = []
): PlanTask[] {
  const mod = index.modules.get(rm.module_id);
  if (!mod) return [];
  const tiers = new Set(TIERS[rm.emphasis]);
  const skip = new Set(rm.skip_topics);
  const boostByTopic = new Map(boosts.map((b) => [b.topic_id, b]));
  const out: PlanTask[] = [];
  for (const topic of index.topicsByModule.get(mod.id) ?? []) {
    if (!tiers.has(topic.tier) || skip.has(topic.id)) continue;
    const base = { stream: mod.stream, module_id: mod.id, topic_id: topic.id };
    out.push({
      ...base,
      id: `${topic.id}/learn`,
      kind: topic.learn_kind,
      title: topic.title,
      minutes: topic.learn_minutes,
      optional: false,
      splittable: topic.learn_minutes >= 30,
    });
    for (const t of topic.tasks) {
      out.push({
        ...base,
        id: `${topic.id}/t/${t.key}`,
        kind: t.kind,
        title: t.title,
        minutes: t.minutes,
        optional: t.optional,
        splittable: false,
      });
    }
    const tiersOf: Array<[string[], boolean, boolean]> = [
      [topic.problems.must, true, false],
      [topic.problems.good, rm.emphasis !== 'light', false],
      [topic.problems.stretch, rm.emphasis === 'deep', true],
    ];
    const paid: string[] = [];
    for (const [refs, include, optional] of tiersOf) {
      for (const ref of refs) {
        const p = index.problems.get(ref);
        if (!p) continue;
        // Paid-only problems only ever appear as stretch.
        if (p.paid_only === true && !optional) {
          paid.push(ref);
          continue;
        }
        if (!include) continue;
        const slug = slugOfRef(ref);
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ ...solveTask(topic.id, mod.id, p, optional), stream: mod.stream });
      }
    }
    if (rm.emphasis === 'deep') {
      for (const ref of paid) {
        const slug = slugOfRef(ref);
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ ...solveTask(topic.id, mod.id, index.problems.get(ref)!, true, 'LeetCode Premium'), stream: mod.stream });
      }
    }
    const boost = boostByTopic.get(topic.id);
    for (const p of boost?.problems ?? []) {
      const slug = slugOfRef(p.ref);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const company = boost?.companies?.[p.ref];
      out.push({ ...solveTask(topic.id, mod.id, p, true, company ? `On ${company}'s list` : 'On a target company list'), stream: mod.stream });
    }
    if (topic.quiz_item_ids.length >= 2) {
      out.push({
        ...base,
        id: `${topic.id}/quiz`,
        kind: 'quiz',
        title: `${topic.title}: quiz`,
        minutes: quizMinutes(topic.quiz_item_ids.length),
        optional: false,
        splittable: false,
      });
    }
  }
  if (mod.stream === 'dsa' && !mod.language && out.length) {
    out.push({
      id: `mock/${mod.id}`,
      kind: 'mock',
      title: `${mod.title}: timed module check`,
      minutes: MODULE_MOCK_MINUTES,
      stream: 'dsa',
      module_id: mod.id,
      topic_id: null,
      optional: false,
      splittable: false,
    });
  }
  return out;
}

/** Tasks for an AI custom module (`custom.<n>`). */
export function customModuleTasks(rm: RoadmapModule): PlanTask[] {
  if (!rm.custom) return [];
  const out: PlanTask[] = [];
  for (const topic of rm.custom.topics) {
    const topicId = `${rm.module_id}.${topic.key}`;
    for (const t of topic.tasks) {
      out.push({
        id: `${topicId}/t/${t.key}`,
        kind: t.kind,
        title: t.title,
        minutes: t.minutes,
        stream: rm.custom.stream,
        module_id: rm.module_id,
        topic_id: topicId,
        optional: false,
        splittable: false,
        note: 'AI-generated, not reviewed',
      });
    }
  }
  return out;
}

/**
 * All tasks of a roadmap in order: modules in roadmap order (emphasis picks the
 * topic tiers), problems deduped across the roadmap, a module check after each
 * DSA module, and project stages after their `after_module` (or at the end).
 */
export function expandRoadmap(roadmap: Pick<Roadmap, 'modules' | 'projects' | 'boosts'>, index: CatalogIndex): PlanTask[] {
  const seen = new Set<string>();
  const byModule = new Map<string, PlanTask[]>();
  for (const rm of roadmap.modules) {
    byModule.set(rm.module_id, rm.custom ? customModuleTasks(rm) : moduleTasks(index, rm, seen, roadmap.boosts));
  }
  const after = new Map<string, PlanTask[]>();
  const tail: PlanTask[] = [];
  for (const rp of roadmap.projects) {
    const project = index.projects.get(rp.project_id);
    if (!project) continue;
    const anchor = rp.after_module && byModule.has(rp.after_module) ? rp.after_module : null;
    const tasks = projectTasks(project, `project.${project.id}`);
    if (anchor) after.set(anchor, [...(after.get(anchor) ?? []), ...tasks]);
    else tail.push(...tasks);
  }
  const out: PlanTask[] = [];
  for (const rm of roadmap.modules) {
    out.push(...byModule.get(rm.module_id)!);
    out.push(...(after.get(rm.module_id) ?? []));
  }
  out.push(...tail);
  return out;
}

export function totalMinutes(tasks: Array<Pick<PlanTask, 'minutes'>>): number {
  return tasks.reduce((n, t) => n + t.minutes, 0);
}

/** Minutes of one module at each emphasis (problems deduped within the module only). */
export function moduleMinutes(index: CatalogIndex, moduleId: string): Record<Emphasis, number> {
  const at = (emphasis: Emphasis) => totalMinutes(moduleTasks(index, { module_id: moduleId, emphasis, skip_topics: [] }));
  return { light: at('light'), standard: at('standard'), deep: at('deep') };
}
