/**
 * Builds the content bundle (skills, graph, roles, curated resources, lessons,
 * practice) from the authoring sources in scripts/seed-source. Resources come
 * only from URLs already in the repo; the model never generates URLs.
 */
import { PRACTICE_ITEMS } from '../scripts/seed-source/practice';
import { RESOURCE_DEFS } from '../scripts/seed-source/resources';
import { ROLE_DEFS } from '../scripts/seed-source/roles';
import { SKILL_DEFS } from '../scripts/seed-source/skills';
import { ContentBundleSchema, type ContentBundle, type SkillPrerequisite } from './types';

export const SEED_VERSION = '2026.10.1';

export function buildSeedBundle(): ContentBundle {
  const prerequisites: SkillPrerequisite[] = SKILL_DEFS.flatMap((s) => [
    ...(s.hard ?? []).map((p) => ({ skill_id: s.id, prerequisite_id: p, strength: 'hard' as const })),
    ...(s.soft ?? []).map((p) => ({ skill_id: s.id, prerequisite_id: p, strength: 'soft' as const })),
  ]);
  const resources = RESOURCE_DEFS.map((r) => ({ duration_minutes: null, ...r }));
  return ContentBundleSchema.parse({
    version: SEED_VERSION,
    skills: SKILL_DEFS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.desc,
      category: s.cat,
      level: s.level,
      estimated_hours: s.hours,
      aliases: s.aliases,
      patterns: s.patterns ?? [],
    })),
    prerequisites,
    roles: ROLE_DEFS.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      legacy_roadmap_ids: r.legacy,
      example_titles: r.titles,
    })),
    role_skills: ROLE_DEFS.flatMap((r) =>
      Object.entries(r.weights).map(([skill_id, weight]) => ({ role_id: r.id, skill_id, weight }))
    ),
    resources,
    lessons: SKILL_DEFS.map((s) => ({
      id: `lesson-${s.id}`,
      skill_id: s.id,
      title: s.name,
      summary_md: s.lesson,
      key_points: s.points,
      resource_ids: resources
        .filter((r) => r.skill_ids.includes(s.id))
        .sort((a, b) => b.quality - a.quality)
        .slice(0, 5)
        .map((r) => r.id),
      estimated_minutes: Math.max(10, Math.min(45, Math.round(s.hours * 3))),
      is_core: s.level <= 3,
      status: 'draft',
      ai_drafted: true,
    })),
    practice_items: PRACTICE_ITEMS,
  });
}
