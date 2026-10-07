/**
 * Project Library: one card model over the curated catalogue projects and the
 * generated library, filters, sorting, and the events a guided build appends.
 * Pure functions.
 */
import {
  generatedSummaries,
  projectMinutes,
  randomUuid,
  type Project,
  type ProjectLevel,
  type RoleFamilyId,
  type StackKind,
  type UserProject,
} from '@job-automator/learning';
import type { LearningEventInput } from '@nomadic/app-core/shared/ipc';

export interface LibraryCard {
  id: string;
  title: string;
  pitch: string;
  level: ProjectLevel;
  kind: StackKind | 'curated';
  tech: string[];
  roles: RoleFamilyId[];
  minutes: number;
  stages: number;
  /** Curated catalogue projects can also be planned into a roadmap. */
  curated: boolean;
  search: string;
}

export type KindFilter = 'all' | StackKind;

export interface ProjectFilters {
  query: string;
  kind: KindFilter;
  level: ProjectLevel | 'all';
  role: RoleFamilyId | 'all';
  hours: 'all' | 'lt10' | '10to25' | '25plus';
}

export const DEFAULT_FILTERS: ProjectFilters = { query: '', kind: 'all', level: 'all', role: 'all', hours: 'all' };

export const HOURS_OPTIONS = [
  { value: 'all', label: 'Any length' },
  { value: 'lt10', label: 'Under 10 h' },
  { value: '10to25', label: '10 to 25 h' },
  { value: '25plus', label: '25 h or more' },
] as const;

export const KIND_LABEL: Record<StackKind, string> = {
  frontend: 'Frontend',
  backend: 'Backend API',
  fullstack: 'Full stack',
  mobile: 'Mobile',
  cli: 'Command line',
  data: 'Data analysis',
  ml: 'Machine learning',
  devops: 'DevOps',
};

export const projectHours = (p: Project) => Math.round((projectMinutes(p) / 60) * 10) / 10;
export const cardHours = (c: Pick<LibraryCard, 'minutes'>) => Math.round((c.minutes / 60) * 10) / 10;

const PREFIX_KIND: Record<string, StackKind> = { fe: 'frontend', be: 'backend', fs: 'fullstack', do: 'devops', da: 'data', ml: 'ml' };

/** Curated ids start with their kind (fe-, be-, fs-, do-); anything else counts as frontend. */
function curatedKind(p: Project): StackKind {
  return PREFIX_KIND[p.id.split('-')[0]] ?? 'frontend';
}

let cards: LibraryCard[] | null = null;

/** Every library card: curated catalogue projects first, then the generated library. Built once. */
export function libraryCards(curated: Project[]): LibraryCard[] {
  if (cards) return cards;
  const fromCatalog: LibraryCard[] = curated.map((p) => ({
    id: p.id,
    title: p.title,
    pitch: p.pitch,
    level: p.level,
    kind: curatedKind(p),
    tech: p.stacks,
    roles: p.role_families,
    minutes: projectMinutes(p),
    stages: p.stages.length,
    curated: true,
    search: [p.title, p.pitch, ...p.stacks, ...p.skill_ids].join(' ').toLowerCase(),
  }));
  const generated: LibraryCard[] = generatedSummaries().map((s) => ({
    id: s.id,
    title: s.title,
    pitch: s.pitch,
    level: s.level,
    kind: s.kind,
    tech: s.tech,
    roles: s.roles,
    minutes: s.minutes,
    stages: s.stages,
    curated: false,
    search: s.search,
  }));
  cards = [...fromCatalog, ...generated];
  return cards;
}

export function filterCards(list: LibraryCard[], f: ProjectFilters): LibraryCard[] {
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    if (f.kind !== 'all' && c.kind !== f.kind) return false;
    if (f.level !== 'all' && c.level !== f.level) return false;
    if (f.role !== 'all' && !c.roles.includes(f.role)) return false;
    const h = cardHours(c);
    if (f.hours === 'lt10' && h >= 10) return false;
    if (f.hours === '10to25' && (h < 10 || h > 25)) return false;
    if (f.hours === '25plus' && h < 25) return false;
    return words.every((w) => c.search.includes(w));
  });
}

const LEVEL_RANK: Record<ProjectLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Best first: the student's role, curated projects, then easier and shorter ones. Stable for equal keys. */
export function sortCards(list: LibraryCard[], role: RoleFamilyId | null): LibraryCard[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(role ? !a.c.roles.includes(role) : 0) - Number(role ? !b.c.roles.includes(role) : 0) ||
        Number(!a.c.curated) - Number(!b.c.curated) ||
        LEVEL_RANK[a.c.level] - LEVEL_RANK[b.c.level] ||
        a.i - b.i
    )
    .map((x) => x.c);
}

/** How many cards match each kind (for the chips). */
export function kindCounts(list: LibraryCard[]): Map<StackKind | 'curated', number> {
  const out = new Map<StackKind | 'curated', number>();
  for (const c of list) out.set(c.kind, (out.get(c.kind) ?? 0) + 1);
  return out;
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
