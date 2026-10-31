/**
 * Learn v3: a roadmap for any role. The role's skill set as subjects →
 * modules → topics (what to study, not the material), five best-fit projects
 * and an optional guided capstone. Pure: schemas, normalising the AI's answer,
 * stable ids, progress and edits. Progress is the event log: `task_done` with
 * `item_id` `topic:<module>/<topic>` or `capstone:<project>/<step>`.
 */
import { z } from 'zod';
import { cleanText, slugify } from '../v2/roadmap';

export const ROLE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const RoleLevelSchema = z.enum(ROLE_LEVELS);
export type RoleLevel = z.infer<typeof RoleLevelSchema>;

export const ROLE_PROJECT_LEVELS = ['starter', 'intermediate', 'stretch'] as const;
export const ProjectLevelV3Schema = z.enum(ROLE_PROJECT_LEVELS);
export type ProjectLevelV3 = z.infer<typeof ProjectLevelV3Schema>;

export const ROLE_LIMITS = {
  role: 80,
  note: 500,
  subjects: 6,
  modulesPerSubject: 8,
  topicsPerModule: 12,
  topics: 220,
  projects: 5,
  milestones: 6,
  stepsPerMilestone: 6,
} as const;

const Id = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const RoleTopicSchema = z.object({
  id: Id,
  title: z.string().min(1).max(120),
  /** What the topic covers, one line (also goes into the ChatGPT prompt). */
  covers: z.string().max(240).default(''),
  /** A short YouTube search phrase for this one topic. */
  search: z.string().max(120).default(''),
  custom: z.boolean().optional(),
  removed: z.boolean().optional(),
});
export type RoleTopic = z.infer<typeof RoleTopicSchema>;

export const RoleModuleSchema = z.object({
  id: Id,
  title: z.string().min(1).max(100),
  summary: z.string().max(240).default(''),
  topics: z.array(RoleTopicSchema).max(40),
  removed: z.boolean().optional(),
});
export type RoleModule = z.infer<typeof RoleModuleSchema>;

export const RoleSubjectSchema = z.object({
  id: Id,
  title: z.string().min(1).max(80),
  why: z.string().max(300).default(''),
  modules: z.array(RoleModuleSchema).min(1).max(24),
});
export type RoleSubject = z.infer<typeof RoleSubjectSchema>;

export const RoleProjectSchema = z.object({
  id: Id,
  title: z.string().min(1).max(120),
  brief: z.string().max(300).default(''),
  deliverable: z.string().max(300).default(''),
  level: ProjectLevelV3Schema,
  hours: z.number().int().min(1).max(300),
  /** Module ids of the roadmap the project uses. */
  uses: z.array(Id).max(8).default([]),
  source: z.enum(['ai', 'curated']).default('ai'),
});
export type RoleProject = z.infer<typeof RoleProjectSchema>;

export const CapstoneStepSchema = z.object({
  id: Id,
  title: z.string().min(1).max(140),
  detail: z.string().max(400).default(''),
  done_when: z.string().max(240).default(''),
  search: z.string().max(120).default(''),
});
export type CapstoneStep = z.infer<typeof CapstoneStepSchema>;

export const CapstoneMilestoneSchema = z.object({
  id: Id,
  title: z.string().min(1).max(100),
  steps: z.array(CapstoneStepSchema).min(1).max(10),
});
export type CapstoneMilestone = z.infer<typeof CapstoneMilestoneSchema>;

export const CapstoneSchema = z.object({
  project_id: Id,
  created_at: z.string().min(1).max(40),
  source: z.enum(['ai', 'curated']).default('ai'),
  milestones: z.array(CapstoneMilestoneSchema).min(1).max(10),
});
export type Capstone = z.infer<typeof CapstoneSchema>;

export const RoleRoadmapSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(3),
  role: z.string().min(1).max(ROLE_LIMITS.role),
  level: RoleLevelSchema,
  note: z.string().max(ROLE_LIMITS.note).default(''),
  source: z.enum(['ai', 'catalog']),
  summary: z.string().max(600).default(''),
  created_at: z.string().min(1).max(40),
  subjects: z.array(RoleSubjectSchema).min(1).max(8),
  projects: z.array(RoleProjectSchema).max(ROLE_LIMITS.projects).default([]),
  capstone: CapstoneSchema.nullable().default(null),
});
export type RoleRoadmap = z.infer<typeof RoleRoadmapSchema>;

export const RoleRoadmapRequestSchema = z.object({
  role: z.string().trim().min(2).max(ROLE_LIMITS.role),
  level: RoleLevelSchema,
  note: z.string().trim().max(ROLE_LIMITS.note).default(''),
});
export type RoleRoadmapRequest = z.infer<typeof RoleRoadmapRequestSchema>;

// ── Ids and events ──────────────────────────────────────────────────────────

/** A slug unique among `taken` (adds -2, -3 …). */
export function uniqueSlug(title: string, taken: Set<string>, fallback: string): string {
  const base = slugify(title, fallback).slice(0, 52).replace(/-+$/g, '') || fallback;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export const topicKey = (moduleId: string, topicId: string) => `topic:${moduleId}/${topicId}`;
export const capstoneStepKey = (projectId: string, stepId: string) => `capstone:${projectId}/${stepId}`;

// ── Normalising the AI's answer ─────────────────────────────────────────────

const PLACEHOLDER = /\[[^\]]*\]|lorem ipsum|\bTBD\b/i;
const LINK = /https?:\/\/|\bwww\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** Cleaned text; text that held a link, an email address or a placeholder is dropped whole. */
const text = (v: unknown, max: number) => {
  if (typeof v === 'string' && LINK.test(v)) return '';
  const s = cleanText(v, max);
  return PLACEHOLDER.test(s) ? '' : s;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function projectLevel(v: unknown): ProjectLevelV3 {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('stretch') || s.startsWith('adv') || s.startsWith('hard')) return 'stretch';
  if (s.startsWith('inter') || s.startsWith('med')) return 'intermediate';
  return 'starter';
}

/**
 * The AI's tree, cleaned: titles trimmed, links and placeholders dropped,
 * empties and duplicates removed, counts capped, stable slug ids, project
 * `uses` resolved from module titles to ids. Null when nothing usable is left.
 */
export function normaliseRoleRoadmap(
  raw: unknown,
  req: RoleRoadmapRequest,
  opts: { id: string; now: Date; source?: 'ai' | 'catalog' }
): RoleRoadmap | null {
  const o = obj(raw);
  const moduleIds = new Set<string>();
  const moduleByTitle = new Map<string, string>();
  let topicCount = 0;
  const subjectIds = new Set<string>();
  const subjects: RoleSubject[] = [];
  for (const rs of arr(o.subjects).slice(0, ROLE_LIMITS.subjects)) {
    const s = obj(rs);
    const title = text(s.title, 80);
    if (!title) continue;
    const modules: RoleModule[] = [];
    for (const rm of arr(s.modules).slice(0, ROLE_LIMITS.modulesPerSubject)) {
      const m = obj(rm);
      const mTitle = text(m.title, 100);
      if (!mTitle || moduleByTitle.has(mTitle.toLowerCase())) continue;
      const topicIds = new Set<string>();
      const seen = new Set<string>();
      const topics: RoleTopic[] = [];
      for (const rt of arr(m.topics).slice(0, ROLE_LIMITS.topicsPerModule)) {
        if (topicCount >= ROLE_LIMITS.topics) break;
        const t = obj(rt);
        const tTitle = text(t.title, 120);
        if (!tTitle || seen.has(tTitle.toLowerCase())) continue;
        seen.add(tTitle.toLowerCase());
        topics.push({
          id: uniqueSlug(tTitle, topicIds, 'topic'),
          title: tTitle,
          covers: text(t.covers, 240),
          search: text(t.search, 120) || tTitle,
        });
        topicCount++;
      }
      if (!topics.length) continue;
      const id = uniqueSlug(mTitle, moduleIds, 'module');
      moduleByTitle.set(mTitle.toLowerCase(), id);
      modules.push({ id, title: mTitle, summary: text(m.summary, 240), topics });
    }
    if (!modules.length) continue;
    subjects.push({ id: uniqueSlug(title, subjectIds, 'subject'), title, why: text(s.why, 300), modules });
  }
  if (!subjects.length) return null;

  const projectIds = new Set<string>();
  const projects: RoleProject[] = [];
  for (const rp of arr(o.projects)) {
    if (projects.length >= ROLE_LIMITS.projects) break;
    const p = obj(rp);
    const title = text(p.title, 120);
    if (!title || projects.some((x) => x.title.toLowerCase() === title.toLowerCase())) continue;
    const uses = [...new Set(arr(p.uses).map((u) => moduleByTitle.get(String(u).trim().toLowerCase()) ?? (moduleIds.has(String(u)) ? String(u) : '')).filter(Boolean))].slice(0, 8);
    const hours = Math.round(Number(p.hours));
    projects.push({
      id: uniqueSlug(title, projectIds, 'project'),
      title,
      brief: text(p.brief, 300),
      deliverable: text(p.deliverable, 300),
      level: projectLevel(p.level),
      hours: Number.isFinite(hours) ? Math.min(300, Math.max(1, hours)) : 10,
      uses,
      source: 'ai',
    });
  }

  const roadmap: RoleRoadmap = {
    id: opts.id,
    version: 3,
    role: req.role.trim().slice(0, ROLE_LIMITS.role),
    level: req.level,
    note: req.note,
    source: opts.source ?? 'ai',
    summary: text(o.summary, 600),
    created_at: opts.now.toISOString(),
    subjects,
    projects,
    capstone: null,
  };
  const parsed = RoleRoadmapSchema.safeParse(roadmap);
  return parsed.success ? parsed.data : null;
}

/** The AI's capstone plan for one project, cleaned the same way. Null when nothing usable is left. */
export function normaliseCapstone(raw: unknown, projectId: string, now: Date, source: 'ai' | 'curated' = 'ai'): Capstone | null {
  const o = obj(raw);
  const mIds = new Set<string>();
  const stepIds = new Set<string>();
  const milestones: CapstoneMilestone[] = [];
  for (const rm of arr(o.milestones).slice(0, ROLE_LIMITS.milestones)) {
    const m = obj(rm);
    const title = text(m.title, 100);
    if (!title) continue;
    const steps: CapstoneStep[] = [];
    for (const rs of arr(m.steps).slice(0, ROLE_LIMITS.stepsPerMilestone)) {
      const s = obj(rs);
      const sTitle = text(s.title, 140);
      if (!sTitle) continue;
      steps.push({
        id: uniqueSlug(sTitle, stepIds, 'step'),
        title: sTitle,
        detail: text(s.detail, 400),
        done_when: text(s.done_when, 240),
        search: text(s.search, 120) || sTitle,
      });
    }
    if (steps.length) milestones.push({ id: uniqueSlug(title, mIds, 'milestone'), title, steps });
  }
  if (!milestones.length) return null;
  const parsed = CapstoneSchema.safeParse({ project_id: projectId, created_at: now.toISOString(), source, milestones });
  return parsed.success ? parsed.data : null;
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface TopicRef {
  subject: RoleSubject;
  module: RoleModule;
  topic: RoleTopic;
  key: string;
}

/** Every topic still in the roadmap (removed topics and modules left out), in study order. */
export function roadmapTopics(r: Pick<RoleRoadmap, 'subjects'>): TopicRef[] {
  return r.subjects.flatMap((subject) =>
    subject.modules
      .filter((m) => !m.removed)
      .flatMap((module) => module.topics.filter((t) => !t.removed).map((topic) => ({ subject, module, topic, key: topicKey(module.id, topic.id) })))
  );
}

export interface Count {
  done: number;
  total: number;
}

export interface RoleProgress extends Count {
  percent: number;
  bySubject: Map<string, Count>;
  byModule: Map<string, Count>;
  /** The first topic not done, in study order (null when all are done). */
  next: TopicRef | null;
  capstone: Count | null;
}

export function roleProgress(r: RoleRoadmap, done: Set<string>): RoleProgress {
  const topics = roadmapTopics(r);
  const bySubject = new Map<string, Count>();
  const byModule = new Map<string, Count>();
  let doneCount = 0;
  let next: TopicRef | null = null;
  for (const ref of topics) {
    const isDone = done.has(ref.key);
    if (isDone) doneCount++;
    else if (!next) next = ref;
    for (const [map, id] of [[bySubject, ref.subject.id], [byModule, ref.module.id]] as const) {
      const c = map.get(id) ?? { done: 0, total: 0 };
      c.total++;
      if (isDone) c.done++;
      map.set(id, c);
    }
  }
  let capstone: Count | null = null;
  if (r.capstone) {
    const steps = r.capstone.milestones.flatMap((m) => m.steps);
    capstone = { total: steps.length, done: steps.filter((s) => done.has(capstoneStepKey(r.capstone!.project_id, s.id))).length };
  }
  return {
    done: doneCount,
    total: topics.length,
    percent: topics.length ? Math.round((doneCount / topics.length) * 100) : 0,
    bySubject,
    byModule,
    next,
    capstone,
  };
}

/** Share of a project's modules already done (0–100), to show how ready the student is for it. */
export function projectReadiness(p: RoleProject, progress: RoleProgress): number {
  let done = 0;
  let total = 0;
  for (const id of p.uses) {
    const c = progress.byModule.get(id);
    if (!c) continue;
    done += c.done;
    total += c.total;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

// ── Edits ───────────────────────────────────────────────────────────────────

/** Removes (or brings back) a topic; the topic stays in the document so its id and progress are kept. */
export function setTopicRemoved(r: RoleRoadmap, moduleId: string, topicId: string, removed: boolean): RoleRoadmap {
  return {
    ...r,
    subjects: r.subjects.map((s) => ({
      ...s,
      modules: s.modules.map((m) =>
        m.id !== moduleId ? m : { ...m, topics: m.topics.map((t) => (t.id === topicId ? { ...t, removed: removed || undefined } : t)) }
      ),
    })),
  };
}

export function setModuleRemoved(r: RoleRoadmap, moduleId: string, removed: boolean): RoleRoadmap {
  return {
    ...r,
    subjects: r.subjects.map((s) => ({ ...s, modules: s.modules.map((m) => (m.id === moduleId ? { ...m, removed: removed || undefined } : m)) })),
  };
}

/** Adds the student's own topic to a module (null when the title is empty or already there). */
export function addTopic(r: RoleRoadmap, moduleId: string, title: string): RoleRoadmap | null {
  const t = cleanText(title, 120);
  if (!t) return null;
  let added = false;
  const next = {
    ...r,
    subjects: r.subjects.map((s) => ({
      ...s,
      modules: s.modules.map((m) => {
        if (m.id !== moduleId || m.topics.length >= 40) return m;
        if (m.topics.some((x) => x.title.toLowerCase() === t.toLowerCase() && !x.removed)) return m;
        const existing = m.topics.find((x) => x.title.toLowerCase() === t.toLowerCase());
        added = true;
        if (existing) return { ...m, topics: m.topics.map((x) => (x === existing ? { ...x, removed: undefined } : x)) };
        const id = uniqueSlug(t, new Set(m.topics.map((x) => x.id)), 'topic');
        return { ...m, topics: [...m.topics, { id, title: t, covers: '', search: t, custom: true }] };
      }),
    })),
  };
  return added ? next : null;
}

/** Topics of `previous` done under the same module and topic titles keep their keys in `next` (ids are title slugs). */
export function sameKeys(previous: RoleRoadmap | null, next: RoleRoadmap): number {
  if (!previous) return 0;
  const before = new Set(roadmapTopics(previous).map((t) => t.key));
  return roadmapTopics(next).filter((t) => before.has(t.key)).length;
}
