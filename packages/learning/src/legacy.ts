/**
 * One-time import of the old localStorage progress into learning events.
 * Keys: nomadic_cached_roadmap (JSON roadmap {id, title, ...}),
 * nomadic_completed_concepts (JSON string[] of concept names).
 * Event ids are UUIDv5 of (user, concept) so re-running is idempotent.
 * Self-reported ticks become skill_marked_known at mastery 0.5 (below the
 * mastered threshold): the user is offered a placement quiz to confirm.
 */
import { uuidV5 } from './ids';
import { tagSkills } from './readiness';
import type { ContentBundle, LearningEvent, RoleFamilyId } from './types';

export const LEGACY_KEYS = [
  'nomadic_cached_roadmap',
  'nomadic_completed_concepts',
  'nomadic_user_deleted_all_roadmaps',
] as const;
export const LEGACY_MASTERY = 0.5;

export interface LegacyImport {
  events: LearningEvent[];
  track: RoleFamilyId | null;
  unmatchedConcepts: string[];
  /** Keys the caller should delete after the events are saved. */
  keysToRemove: string[];
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function migrateLegacyLocalStorage(
  storage: Record<string, string | null | undefined>,
  userId: string,
  bundle: ContentBundle,
  now: Date = new Date()
): LegacyImport {
  const roadmap = parseJson<{ id?: string; title?: string; role?: string }>(storage.nomadic_cached_roadmap);
  const concepts = parseJson<unknown[]>(storage.nomadic_completed_concepts) ?? [];

  const hay = `${roadmap?.id ?? ''} ${roadmap?.role ?? ''} ${roadmap?.title ?? ''}`.toLowerCase();
  const track =
    bundle.roles.find((r) => r.legacy_roadmap_ids.some((id) => hay.includes(id.toLowerCase())))?.id ??
    bundle.roles.find((r) => r.example_titles.some((t) => hay.includes(t.toLowerCase())))?.id ??
    null;

  const events: LearningEvent[] = [];
  const unmatched: string[] = [];
  const seenSkills = new Set<string>();
  for (const c of concepts) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const skills = tagSkills(c, bundle.skills);
    if (skills.length === 0) unmatched.push(c);
    for (const skill_id of skills) {
      if (seenSkills.has(skill_id)) continue;
      seenSkills.add(skill_id);
      events.push({
        id: uuidV5(`legacy:${userId}:${skill_id}`),
        user_id: userId,
        type: 'skill_marked_known',
        skill_id,
        item_id: null,
        payload: {
          source: 'legacy_import',
          mastery: LEGACY_MASTERY,
          ...(track ? { track_id: track } : {}),
          concept: c,
        },
        duration_s: 0,
        created_at: now.toISOString(),
      });
    }
  }
  return {
    events,
    track,
    unmatchedConcepts: unmatched,
    keysToRemove: LEGACY_KEYS.filter((k) => storage[k] !== undefined && storage[k] !== null),
  };
}
