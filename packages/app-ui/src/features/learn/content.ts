/**
 * The curated Learn catalogue (skills, roles, lessons, resources, practice)
 * from @job-automator/learning's seed bundle. Every link the app shows comes
 * from `resources` here; nothing is generated. Coding items are left out
 * (no code runner at launch, decision 7).
 */
import type {
  ContentBundle,
  LearningResource,
  Lesson,
  PracticeItem,
  RoleFamily,
  RoleFamilyId,
  Skill,
} from '@job-automator/learning';
import seed from '@job-automator/learning/seed/bundle.json';

export type QuizItem = Exclude<PracticeItem, { kind: 'code' }>;

export const bundle = seed as unknown as ContentBundle;

const skills = new Map<string, Skill>(bundle.skills.map((s) => [s.id, s]));
const lessons = new Map<string, Lesson>(bundle.lessons.map((l) => [l.id, l]));
const lessonsBySkill = new Map<string, Lesson>(bundle.lessons.map((l) => [l.skill_id, l]));
const resources = new Map<string, LearningResource>(bundle.resources.map((r) => [r.id, r]));
const roles = new Map<string, RoleFamily>(bundle.roles.map((r) => [r.id, r]));

export const ROLES: RoleFamily[] = bundle.roles;

export const skillById = (id: string): Skill | undefined => skills.get(id);
export const skillName = (id: string): string => skills.get(id)?.name ?? id;
export const lessonById = (id: string): Lesson | undefined => lessons.get(id);
export const lessonForSkill = (skillId: string): Lesson | undefined => lessonsBySkill.get(skillId);
export const roleById = (id: string): RoleFamily | undefined => roles.get(id);
export const isRoleId = (id: string): id is RoleFamilyId => roles.has(id);

/**
 * Whether a curated resource may be shown. Broken or retired links (failed the
 * link check or removed by an editor) are never shown. Seed resources that the
 * link checker has not visited yet ('unverified') are shown when they are URLs
 * that were already in the repo; Learn v2 additions ('learn-v2' source) wait
 * until the link checker marks them active.
 */
export function isShowableResource(r: LearningResource): boolean {
  if (!r.url.startsWith('https://')) return false;
  if (r.status === 'active') return true;
  return r.status === 'unverified' && !r.source.startsWith('learn-v2');
}

export function lessonResources(lesson: Lesson): LearningResource[] {
  return lesson.resource_ids
    .map((id) => resources.get(id))
    .filter((r): r is LearningResource => Boolean(r && isShowableResource(r)));
}

const quizItems: QuizItem[] = bundle.practice_items.filter(
  (p): p is QuizItem => p.kind !== 'code' && p.status !== 'archived'
);
const itemsById = new Map<string, QuizItem>(quizItems.map((p) => [p.id, p]));

export const quizItemById = (id: string): QuizItem | undefined => itemsById.get(id);

/** The check for a lesson: every quiz item of its skill, in catalogue order. */
export function checkItemsFor(lesson: Lesson): QuizItem[] {
  return quizItems.filter((p) => p.skill_id === lesson.skill_id);
}

/** Skill ids named in free text or a list of skill names (exact names first, then aliases). */
export function skillIdsFromNames(names: string[]): string[] {
  const byName = new Map(bundle.skills.map((s) => [s.name.toLowerCase(), s.id]));
  const out = new Set<string>();
  for (const n of names) {
    const t = n.trim().toLowerCase();
    if (!t) continue;
    const exact = byName.get(t);
    if (exact) { out.add(exact); continue; }
    for (const s of bundle.skills) if (s.aliases.some((a) => a.toLowerCase() === t)) out.add(s.id);
  }
  return [...out].sort();
}
