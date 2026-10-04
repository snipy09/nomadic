/** Project Library filters and the events a guided build appends. Pure functions. */
import { projectMinutes, randomUuid, type Project, type ProjectLevel, type RoleFamilyId, type UserProject } from '@job-automator/learning';
import type { LearningEventInput } from '../../../shared/ipc';

export interface ProjectFilters {
  role: RoleFamilyId | 'all';
  level: ProjectLevel | 'all';
  hours: 'all' | 'lt10' | '10to25' | '25plus';
  query: string;
}

export const DEFAULT_FILTERS: ProjectFilters = { role: 'all', level: 'all', hours: 'all', query: '' };

export const HOURS_OPTIONS = [
  { value: 'all', label: 'Any length' },
  { value: 'lt10', label: 'Under 10 h' },
  { value: '10to25', label: '10 to 25 h' },
  { value: '25plus', label: '25 h or more' },
] as const;

export const projectHours = (p: Project) => Math.round((projectMinutes(p) / 60) * 10) / 10;

export function filterProjects(projects: Project[], f: ProjectFilters): Project[] {
  const q = f.query.trim().toLowerCase();
  return projects.filter((p) => {
    if (f.role !== 'all' && !p.role_families.includes(f.role)) return false;
    if (f.level !== 'all' && p.level !== f.level) return false;
    const h = projectHours(p);
    if (f.hours === 'lt10' && h >= 10) return false;
    if (f.hours === '10to25' && (h < 10 || h > 25)) return false;
    if (f.hours === '25plus' && h < 25) return false;
    if (q && ![p.title, p.pitch, ...p.stacks, ...p.skill_ids].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });
}

const LEVEL_RANK: Record<ProjectLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Projects of the student's role first, then by level and title. */
export function sortForRole(projects: Project[], role: RoleFamilyId | null): Project[] {
  return [...projects].sort(
    (a, b) =>
      Number(role ? !a.role_families.includes(role) : 0) - Number(role ? !b.role_families.includes(role) : 0) ||
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.title.localeCompare(b.title)
  );
}

export function stageDoneEvent(project: Project, stageId: string, trackId: string | null, now: Date): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'stage_done',
    skill_id: project.skill_ids[0] ?? null,
    item_id: `${project.id}/${stageId}`,
    payload: { project_id: project.id, stage_id: stageId, ...(trackId ? { track_id: trackId } : {}) },
    duration_s: 0,
    created_at: now.toISOString(),
  };
}

export const activeCount = (mine: UserProject[]) => mine.filter((p) => p.status === 'active').length;
