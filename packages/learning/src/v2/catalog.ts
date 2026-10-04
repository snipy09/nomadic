/**
 * Learn v2 catalogue: lookups over modules, topics, problems and projects,
 * module prerequisite closure, cycle check and a deterministic topological
 * order. Pure functions; no I/O.
 */
import type { PracticeItem } from '../types';
import type { LearnModule, LearnTopic, ProblemDifficulty, ProblemInfo, Project, Stream } from './types';

export interface Catalog {
  modules: LearnModule[];
  topics: LearnTopic[];
  problems: ProblemInfo[];
  projects: Project[];
  /** Quiz items referenced by topics (optional; only used for lookups). */
  practice_items?: PracticeItem[];
}

export interface CatalogIndex {
  catalog: Catalog;
  modules: Map<string, LearnModule>;
  topics: Map<string, LearnTopic>;
  /** module id -> topics sorted by `order`. */
  topicsByModule: Map<string, LearnTopic[]>;
  problems: Map<string, ProblemInfo>;
  projects: Map<string, Project>;
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const topicsByModule = new Map<string, LearnTopic[]>();
  for (const t of catalog.topics) {
    const list = topicsByModule.get(t.module_id) ?? [];
    list.push(t);
    topicsByModule.set(t.module_id, list);
  }
  for (const list of topicsByModule.values()) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return {
    catalog,
    modules: new Map(catalog.modules.map((m) => [m.id, m])),
    topics: new Map(catalog.topics.map((t) => [t.id, t])),
    topicsByModule,
    problems: new Map(catalog.problems.map((p) => [p.ref, p])),
    projects: new Map(catalog.projects.map((p) => [p.id, p])),
  };
}

const STREAM_ORDER: Stream[] = ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'];

/** Catalogue order: stream, then `order`, then id. */
export function compareModules(a: LearnModule, b: LearnModule): number {
  return (
    STREAM_ORDER.indexOf(a.stream) - STREAM_ORDER.indexOf(b.stream) || a.order - b.order || a.id.localeCompare(b.id)
  );
}

export function hardPrerequisites(index: CatalogIndex, moduleId: string): string[] {
  return (index.modules.get(moduleId)?.prerequisites ?? [])
    .filter((p) => p.kind === 'hard' && index.modules.has(p.module_id))
    .map((p) => p.module_id);
}

/** Hard prerequisites of `ids`, transitively, excluding `ids` themselves. */
export function moduleHardClosure(index: CatalogIndex, ids: Iterable<string>): Set<string> {
  const start = new Set(ids);
  const out = new Set<string>();
  const stack = [...start];
  const seen = new Set(start);
  while (stack.length) {
    const id = stack.pop()!;
    for (const pre of hardPrerequisites(index, id)) {
      if (seen.has(pre)) continue;
      seen.add(pre);
      out.add(pre);
      stack.push(pre);
    }
  }
  return out;
}

/** One prerequisite cycle among modules (hard and soft edges), or null. */
export function findModuleCycle(modules: LearnModule[]): string[] | null {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const color = new Map<string, number>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    path.push(id);
    for (const p of byId.get(id)?.prerequisites ?? []) {
      if (!byId.has(p.module_id)) continue;
      const c = color.get(p.module_id) ?? 0;
      if (c === 1) return [...path.slice(path.indexOf(p.module_id)), p.module_id];
      if (c === 0) {
        const found = visit(p.module_id);
        if (found) return found;
      }
    }
    path.pop();
    color.set(id, 2);
    return null;
  };
  for (const m of [...modules].sort((a, b) => a.id.localeCompare(b.id))) {
    if (color.get(m.id)) continue;
    const cycle = visit(m.id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Topological order of `ids` over prerequisites (hard and soft) that are also
 * in `ids`. Ties keep the order of `ids` (the caller's preference). A cycle in
 * bad data releases the earliest blocked id, so every id is returned once.
 */
export function orderModules(index: CatalogIndex, ids: string[], extraEdges: Map<string, string[]> = new Map()): string[] {
  const list = [...new Set(ids)];
  const rank = new Map(list.map((id, i) => [id, i]));
  const set = new Set(list);
  const pres = new Map<string, Set<string>>();
  for (const id of list) {
    const p = new Set<string>();
    for (const pre of index.modules.get(id)?.prerequisites ?? []) if (set.has(pre.module_id) && pre.module_id !== id) p.add(pre.module_id);
    for (const pre of extraEdges.get(id) ?? []) if (set.has(pre) && pre !== id) p.add(pre);
    pres.set(id, p);
  }
  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < list.length) {
    const ready = list.filter((id) => !done.has(id) && [...pres.get(id)!].every((p) => done.has(p)));
    const next = ready.length
      ? ready.reduce((a, b) => (rank.get(a)! <= rank.get(b)! ? a : b))
      : list.find((id) => !done.has(id))!;
    done.add(next);
    out.push(next);
  }
  return out;
}

export const SOLVE_MINUTES: Record<ProblemDifficulty, number> = { easy: 20, medium: 40, hard: 60 };

export function slugOfRef(ref: string): string {
  return ref.startsWith('lc:') ? ref.slice(3) : ref;
}

/** Practice items by id (quiz lookups for topics). */
export function practiceItemMap(catalog: Catalog): Map<string, PracticeItem> {
  return new Map((catalog.practice_items ?? []).map((p) => [p.id, p]));
}
