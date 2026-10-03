/**
 * Deterministic planner: orders a role's skills by prerequisites and fits them
 * to the user's horizon and daily time. Always returns a valid plan (never a
 * generic fallback). An optional LLM step may only re-explain / reorder within
 * the same skill set; its output is validated and rejected otherwise.
 */
import { z } from 'zod';
import { buildSkillGraph, hardPrerequisiteClosure, topoSort } from './graph';
import { MASTERY_THRESHOLD, type ContentBundle, type MasteryMap, type RoleFamilyId } from './types';

export interface PlanInput {
  bundle: ContentBundle;
  role: RoleFamilyId;
  mastery?: MasteryMap;
  horizonMonths: 1 | 3 | 6;
  dailyHours: 1 | 2 | 4;
  /** Study days per week (default 5). */
  daysPerWeek?: number;
}

export interface PlannedSkill {
  skill_id: string;
  week: number;
  hours: number;
  weight: number;
  /** Included only because a target skill needs it. */
  prerequisite_only: boolean;
}

export interface Plan {
  role: RoleFamilyId;
  weeks: number;
  hours_per_week: number;
  skills: PlannedSkill[];
  /** Role skills that did not fit the horizon (lowest weight first to go). */
  deferred: string[];
  already_mastered: string[];
}

export function planTrack(input: PlanInput): Plan {
  const { bundle, role, horizonMonths, dailyHours } = input;
  const mastery = input.mastery ?? {};
  const graph = buildSkillGraph(bundle.skills, bundle.prerequisites);
  const weights = new Map(bundle.role_skills.filter((r) => r.role_id === role).map((r) => [r.skill_id, r.weight]));
  if (weights.size === 0) throw new Error(`unknown role ${role}`);

  const isMastered = (id: string) => (mastery[id] ?? 0) >= MASTERY_THRESHOLD;
  const weeks = Math.round((horizonMonths * 52) / 12);
  const hoursPerWeek = dailyHours * (input.daysPerWeek ?? 5);
  const budget = weeks * hoursPerWeek;
  const hoursOf = (id: string) => (graph.skills.get(id)?.estimated_hours ?? 0) * (1 - Math.min(mastery[id] ?? 0, 0.9));

  // Greedily keep the highest-weight skills (with their unmastered hard prerequisites) that fit the budget.
  const targets = [...weights.keys()].filter((id) => !isMastered(id) && graph.skills.has(id));
  targets.sort((a, b) => weights.get(b)! - weights.get(a)! || a.localeCompare(b));
  const chosen = new Set<string>();
  const deferred: string[] = [];
  let used = 0;
  for (const id of targets) {
    if (chosen.has(id)) continue;
    const needed = [id, ...hardPrerequisiteClosure(graph, [id])].filter((s) => !chosen.has(s) && !isMastered(s));
    const cost = needed.reduce((n, s) => n + hoursOf(s), 0);
    if (used + cost <= budget) {
      needed.forEach((s) => chosen.add(s));
      used += cost;
    } else if (chosen.size === 0) {
      // Not even the top skill fits: start its prerequisite chain and fit what we can.
      for (const s of topoSort(graph, needed)) {
        if (chosen.size > 0 && used + hoursOf(s) > budget) break;
        chosen.add(s);
        used += hoursOf(s);
      }
      if (!chosen.has(id)) deferred.push(id);
    } else deferred.push(id);
  }

  const order = topoSort(graph, chosen, (a, b) => {
    const la = graph.skills.get(a)!.level;
    const lb = graph.skills.get(b)!.level;
    return la - lb || (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b);
  });

  // Fill weeks sequentially; a skill starts in the week its predecessors' hours end.
  let cursor = 0;
  const scale = used > budget ? budget / used : 1; // only when a single oversized skill was forced in
  const skills = order.map((id) => {
    const hours = Math.round(hoursOf(id) * 10) / 10;
    const week = Math.min(weeks, Math.floor(cursor / hoursPerWeek) + 1);
    cursor += hours * scale;
    return { skill_id: id, week, hours, weight: weights.get(id) ?? 0, prerequisite_only: !weights.has(id) };
  });

  return {
    role,
    weeks,
    hours_per_week: hoursPerWeek,
    skills,
    deferred,
    already_mastered: [...weights.keys()].filter(isMastered).sort(),
  };
}

/** Shape the optional LLM step must return. No URLs, only known skill ids. */
export const PlanAdjustmentSchema = z.object({
  order: z.array(z.string()),
  explanation: z
    .string()
    .max(2000)
    .refine((s) => !/https?:\/\//i.test(s), 'explanations must not contain URLs'),
});
export type PlanAdjustment = z.infer<typeof PlanAdjustmentSchema>;

/**
 * Applies an LLM reordering only if it is a permutation of the plan's skills
 * that keeps every hard prerequisite before its dependent. Otherwise returns
 * the deterministic plan unchanged with ok=false.
 */
export function applyPlanAdjustment(
  plan: Plan,
  bundle: ContentBundle,
  raw: unknown
): { plan: Plan; ok: boolean; explanation?: string; reason?: string } {
  const parsed = PlanAdjustmentSchema.safeParse(raw);
  if (!parsed.success) return { plan, ok: false, reason: 'invalid_shape' };
  const ids = plan.skills.map((s) => s.skill_id);
  const { order } = parsed.data;
  if (order.length !== ids.length || new Set(order).size !== ids.length || !order.every((id) => ids.includes(id))) {
    return { plan, ok: false, reason: 'not_a_permutation' };
  }
  const graph = buildSkillGraph(bundle.skills, bundle.prerequisites);
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const id of order) {
    for (const pre of graph.hard.get(id) ?? []) {
      if (pos.has(pre) && pos.get(pre)! > pos.get(id)!)
        return { plan, ok: false, reason: `prerequisite_order:${pre}->${id}` };
    }
  }
  const byId = new Map(plan.skills.map((s) => [s.skill_id, s]));
  let cursor = 0;
  const skills = order.map((id) => {
    const s = byId.get(id)!;
    const week = Math.min(plan.weeks, Math.floor(cursor / plan.hours_per_week) + 1);
    cursor += s.hours;
    return { ...s, week };
  });
  return { plan: { ...plan, skills }, ok: true, explanation: parsed.data.explanation };
}
