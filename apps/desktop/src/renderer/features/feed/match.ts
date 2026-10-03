/**
 * Job match from shared skill ids (@job-automator/learning): the job and the
 * candidate are both tagged against the same skill catalogue, so the score,
 * matched and missing skills mean the same thing in Feed and in Learn.
 * No profile skills or no tagged job skills => no score (never a made-up number).
 */
import { jobMatch, tagSkills, type ContentBundle, type MasteryMap, type RoleFamilyId } from '@job-automator/learning';
import { roles, role_skills, skills } from '@job-automator/learning/seed/bundle.json';
import type { Job, MasterProfile } from '../../types';

export interface JobMatch {
  score: number;
  matched: string[];
  missing: string[];
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

/** Best role family for a target title, by example titles; undefined when nothing fits. */
export function inferRole(title?: string): RoleFamilyId | undefined {
  const t = (title ?? '').toLowerCase().trim();
  if (!t) return undefined;
  let best: { id: RoleFamilyId; score: number } | undefined;
  for (const r of catalogue.roles) {
    for (const ex of r.example_titles) {
      const words = ex.toLowerCase().split(/\s+/);
      const score = words.filter((w) => t.includes(w)).length / words.length;
      if (score > (best?.score ?? 0.5)) best = { id: r.id as RoleFamilyId, score };
    }
  }
  return best?.id;
}

export function matchJob(job: Job, mastery: MasteryMap, role?: RoleFamilyId): JobMatch | null {
  if (Object.keys(mastery).length === 0) return null;
  const ids = jobSkills(job);
  if (ids.length === 0) return null;
  const r = jobMatch(catalogue as ContentBundle, ids, mastery, role);
  return { score: r.score, matched: r.matched.map(skillName), missing: r.missing.map((m) => skillName(m.skill_id)) };
}
