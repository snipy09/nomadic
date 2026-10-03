/**
 * Readiness and job match from the same skill ids on both sides:
 * role readiness = weighted mastery over the role's skills;
 * job match = weighted mastery over skills tagged on the job.
 */
import { MASTERY_THRESHOLD, type ContentBundle, type MasteryMap, type RoleFamilyId, type Skill } from './types';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tags skills in free text (job title + description) using aliases (word-boundary) and patterns (case-sensitive). */
export function tagSkills(text: string, skills: Skill[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const s of skills) {
    const aliasHit = s.aliases.some((a) =>
      new RegExp(`(^|[^a-z0-9+#.])${escapeRe(a.toLowerCase())}($|[^a-z0-9+#])`).test(lower)
    );
    const patternHit = !aliasHit && s.patterns.some((p) => new RegExp(p).test(text));
    if (aliasHit || patternHit) found.push(s.id);
  }
  return found.sort();
}

export interface MatchResult {
  /** 0..100 */
  score: number;
  matched: string[];
  /** Highest-weight skills below mastery, best first. */
  missing: Array<{ skill_id: string; weight: number; mastery: number }>;
}

function weighted(weights: Map<string, number>, mastery: MasteryMap): MatchResult {
  let num = 0;
  let den = 0;
  const missing: MatchResult['missing'] = [];
  const matched: string[] = [];
  for (const [id, w] of weights) {
    const m = Math.min(1, mastery[id] ?? 0);
    num += w * m;
    den += w;
    if (m >= MASTERY_THRESHOLD) matched.push(id);
    else missing.push({ skill_id: id, weight: w, mastery: m });
  }
  missing.sort(
    (a, b) => b.weight * (1 - b.mastery) - a.weight * (1 - a.mastery) || a.skill_id.localeCompare(b.skill_id)
  );
  return { score: den ? Math.round((num / den) * 100) : 0, matched: matched.sort(), missing };
}

export function roleReadiness(bundle: ContentBundle, role: RoleFamilyId, mastery: MasteryMap): MatchResult {
  return weighted(
    new Map(bundle.role_skills.filter((r) => r.role_id === role).map((r) => [r.skill_id, r.weight])),
    mastery
  );
}

/**
 * Job match. Skills tagged on the job use the role's weight when the job's
 * role family is known (falling back to 0.5), so core skills dominate.
 */
export function jobMatch(
  bundle: ContentBundle,
  jobSkillIds: string[],
  mastery: MasteryMap,
  role?: RoleFamilyId,
  topMissing = 3
): MatchResult {
  const roleWeights = new Map(bundle.role_skills.filter((r) => r.role_id === role).map((r) => [r.skill_id, r.weight]));
  const weights = new Map(jobSkillIds.map((id) => [id, roleWeights.get(id) ?? 0.5]));
  const r = weighted(weights, mastery);
  return { ...r, missing: r.missing.slice(0, topMissing) };
}

/** Jobs whose match crossed `threshold` because of a mastery change (for "new matches" notifications). */
export function newlyMatchingJobs<T extends { id: string; skill_ids: string[]; role?: RoleFamilyId }>(
  bundle: ContentBundle,
  jobs: T[],
  before: MasteryMap,
  after: MasteryMap,
  threshold = 70
): T[] {
  return jobs.filter(
    (j) =>
      jobMatch(bundle, j.skill_ids, before, j.role).score < threshold &&
      jobMatch(bundle, j.skill_ids, after, j.role).score >= threshold
  );
}
