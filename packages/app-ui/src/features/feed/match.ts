/**
 * Job match from shared skill ids (@job-automator/learning): the job and the
 * candidate are both tagged against the same skill catalogue, so the score,
 * matched and missing skills mean the same thing in Feed and in Learn.
 * No profile skills, or no job skills and no known role in the title => no score (never a made-up number).
 */
import { jobMatch, tagSkills, type ContentBundle, type MasteryMap, type RoleFamilyId } from '@job-automator/learning';
import { roles, role_skills, skills } from '@job-automator/learning/seed/bundle.json';
import type { Job, MasterProfile } from '../../types';

export interface JobMatch {
  score: number;
  matched: string[];
  missing: string[];
  /** True when the listing names no skills and the score uses the core skills of the role in its title. */
  estimated?: boolean;
}

const catalogue = { skills, roles, role_skills } as unknown as Pick<ContentBundle, 'skills' | 'roles' | 'role_skills'>;
const nameOf = new Map(catalogue.skills.map((s) => [s.id, s.name]));
const tagCache = new Map<string, string[]>();

export const skillName = (id: string) => nameOf.get(id) ?? id;

export function jobSkills(job: Pick<Job, 'title' | 'description' | 'tags' | 'applyUrl'>): string[] {
  const key = `${job.applyUrl}|${job.title}`;
  const hit = tagCache.get(key);
  if (hit) return hit;
  const ids = tagSkills([job.title, job.description, ...(job.tags ?? [])].filter(Boolean).join('\n'), catalogue.skills);
  if (tagCache.size > 5000) tagCache.clear();
  tagCache.set(key, ids);
  return ids;
}

/** Candidate skills declared on the profile, as mastery 1 (until Learn progress supplies real mastery). */
export function profileMastery(profile: Pick<MasterProfile, 'techStack'> & { skills?: string[] }): MasteryMap {
  const text = [profile.techStack, ...(profile.skills ?? [])].filter(Boolean).join(', ');
  return Object.fromEntries(tagSkills(text, catalogue.skills).map((id) => [id, 1]));
}

/**
 * Profile skills (declared, mastery 1) combined with Learn progress (0..1 per skill from lessons,
 * quizzes and placement): the higher value wins, so finishing lessons raises the match.
 */
export function combinedMastery(profile: MasteryMap, learned: MasteryMap): MasteryMap {
  const out: MasteryMap = { ...profile };
  for (const [id, m] of Object.entries(learned)) if (m > 0 && m > (out[id] ?? 0)) out[id] = m;
  return out;
}

/** Whole words with simple suffixes removed, so "Development" and "Developer" both read as "develop". */
function titleWords(title: string): Set<string> {
  const stem = (w: string) => w.replace(/(ment|ing|er|s)$/, '').replace(/(ment|ing|er)$/, '');
  return new Set(title.toLowerCase().split(/[^a-z0-9+#.]+/).map((w) => stem(w.replace(/^\.+|\.+$/g, ''))).filter(Boolean));
}

/** Best role family for a title, by whole-word overlap with example titles; undefined when nothing fits. */
export function inferRole(title?: string): RoleFamilyId | undefined {
  const t = titleWords(title ?? '');
  if (t.size === 0) return undefined;
  let best: { id: RoleFamilyId; score: number } | undefined;
  for (const r of catalogue.roles) {
    for (const ex of r.example_titles) {
      const words = [...titleWords(ex)];
      if (words.length === 0) continue;
      const score = words.filter((w) => t.has(w)).length / words.length;
      if (score > (best?.score ?? 0.5)) best = { id: r.id as RoleFamilyId, score };
    }
  }
  return best?.id;
}

/** Weight from which a role skill counts as core to that role (the catalogue's 1.0 and 0.8+ skills). */
const CORE_WEIGHT = 0.8;

/** Core skills of a role family, used when a listing names no skills but its title names a known role. */
export function coreRoleSkills(role: RoleFamilyId): string[] {
  return catalogue.role_skills.filter((r) => r.role_id === role && r.weight >= CORE_WEIGHT).map((r) => r.skill_id);
}

/**
 * Skills named in the listing decide the match. When the listing names none (short or missing
 * descriptions), a title that maps to a role family is scored against that role's core skills and
 * the result is marked `estimated`. A title with no known role and no skills stays unscored.
 */
export function matchJob(job: Job, mastery: MasteryMap, role?: RoleFamilyId): JobMatch | null {
  if (Object.keys(mastery).length === 0) return null;
  let ids = jobSkills(job);
  let estimated = false;
  if (ids.length === 0) {
    const titleRole = inferRole(job.title);
    if (!titleRole) return null;
    ids = coreRoleSkills(titleRole);
    role = titleRole;
    estimated = true;
  }
  if (ids.length === 0) return null;
  const r = jobMatch(catalogue as ContentBundle, ids, mastery, role);
  const out: JobMatch = { score: r.score, matched: r.matched.map(skillName), missing: r.missing.map((m) => skillName(m.skill_id)) };
  return estimated ? { ...out, estimated } : out;
}
