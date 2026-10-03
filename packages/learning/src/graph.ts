/**
 * Skill-graph helpers: prerequisite lookups, closure, cycle detection and a
 * deterministic topological sort. Pure functions over plain arrays.
 */
import type { Skill, SkillPrerequisite } from './types';

export interface SkillGraph {
  skills: Map<string, Skill>;
  /** skill -> hard prerequisites */
  hard: Map<string, string[]>;
  /** skill -> soft prerequisites */
  soft: Map<string, string[]>;
}

export function buildSkillGraph(skills: Skill[], prerequisites: SkillPrerequisite[]): SkillGraph {
  const map = new Map(skills.map((s) => [s.id, s]));
  const hard = new Map<string, string[]>();
  const soft = new Map<string, string[]>();
  for (const p of prerequisites) {
    if (!map.has(p.skill_id) || !map.has(p.prerequisite_id) || p.skill_id === p.prerequisite_id) continue;
    const target = p.strength === 'soft' ? soft : hard;
    const list = target.get(p.skill_id) ?? [];
    if (!list.includes(p.prerequisite_id)) list.push(p.prerequisite_id);
    target.set(p.skill_id, list);
  }
  for (const list of [...hard.values(), ...soft.values()]) list.sort();
  return { skills: map, hard, soft };
}

/** All hard prerequisites of `ids` (transitively), excluding `ids` themselves. */
export function hardPrerequisiteClosure(graph: SkillGraph, ids: Iterable<string>): Set<string> {
  const start = new Set(ids);
  const out = new Set<string>();
  const stack = [...start];
  const seen = new Set<string>(start);
  while (stack.length) {
    const id = stack.pop()!;
    for (const pre of graph.hard.get(id) ?? []) {
      if (seen.has(pre)) continue;
      seen.add(pre);
      if (!start.has(pre)) out.add(pre);
      stack.push(pre);
    }
  }
  return out;
}

/** Returns one cycle (as a list of ids) if the graph has one, else null. */
export function findCycle(graph: SkillGraph, includeSoft = true): string[] | null {
  const color = new Map<string, 0 | 1 | 2>();
  const parent = new Map<string, string>();
  const edges = (id: string) => [...(graph.hard.get(id) ?? []), ...(includeSoft ? graph.soft.get(id) ?? [] : [])];
  for (const root of [...graph.skills.keys()].sort()) {
    if (color.get(root)) continue;
    const stack: Array<{ id: string; i: number }> = [{ id: root, i: 0 }];
    color.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = edges(top.id)[top.i++];
      if (next === undefined) {
        color.set(top.id, 2);
        stack.pop();
        continue;
      }
      const c = color.get(next) ?? 0;
      if (c === 1) {
        const cycle = [next];
        for (let cur = top.id; cur !== next; cur = parent.get(cur)!) cycle.push(cur);
        return cycle.reverse();
      }
      if (c === 0) {
        color.set(next, 1);
        parent.set(next, top.id);
        stack.push({ id: next, i: 0 });
      }
    }
  }
  return null;
}

/**
 * Deterministic topological order of `ids` using hard + soft edges among them.
 * Ties are broken by `compare` (default: level asc, then id). If the subgraph
 * contains a cycle (bad data), the lowest-ranked blocked node is released so the
 * function always returns every id exactly once.
 */
export function topoSort(
  graph: SkillGraph,
  ids: Iterable<string>,
  compare: (a: string, b: string) => number = (a, b) =>
    (graph.skills.get(a)?.level ?? 0) - (graph.skills.get(b)?.level ?? 0) || a.localeCompare(b),
): string[] {
  const set = new Set(ids);
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of set) {
    const pres = new Set([...(graph.hard.get(id) ?? []), ...(graph.soft.get(id) ?? [])].filter((p) => set.has(p)));
    indeg.set(id, pres.size);
    for (const p of pres) {
      const list = dependents.get(p) ?? [];
      list.push(id);
      dependents.set(p, list);
    }
  }
  const out: string[] = [];
  const ready = [...set].filter((id) => indeg.get(id) === 0).sort(compare);
  const remaining = new Set(set);
  while (remaining.size) {
    if (!ready.length) {
      // Cycle: release the best-ranked remaining node.
      const forced = [...remaining].sort(compare)[0];
      indeg.set(forced, 0);
      ready.push(forced);
    }
    const id = ready.shift()!;
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    out.push(id);
    for (const d of dependents.get(id) ?? []) {
      if (!remaining.has(d)) continue;
      const n = (indeg.get(d) ?? 0) - 1;
      indeg.set(d, n);
      if (n === 0) {
        ready.push(d);
        ready.sort(compare);
      }
    }
  }
  return out;
}
