/**
 * Roadmaps: the rules planner (no AI), the normaliser that turns raw AI output
 * into a valid roadmap grounded in the catalogue, and the diff used by
 * "Adjust" and manual edits on the Review screen.
 */
import { z } from 'zod';
import { randomUuid } from '../ids';
import type { RoleFamilyId } from '../primitives';
import { compareModules, hardPrerequisites, moduleHardClosure, orderModules, type CatalogIndex } from './catalog';
import { daysBetween } from './dates';
import { expandRoadmap, moduleMinutes, totalMinutes } from './expand';
import { buildDays, usableMinutes } from './scheduler';
import {
  STREAMS,
  STREAM_LABELS,
  type Aim,
  type CustomModule,
  type Emphasis,
  type Intake,
  type LearnModule,
  type Level,
  type Project,
  type ProjectLevel,
  type Roadmap,
  type RoadmapModule,
  type Stream,
} from './types';

// ── Streams ─────────────────────────────────────────────────────────────────

export const AIM_STREAMS: Record<Aim, Stream[]> = {
  campus: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
  internship: ['dsa', 'core_cs', 'dev', 'interview'],
  offcampus: ['dsa', 'core_cs', 'dev', 'interview'],
  switch: ['dsa', 'dev', 'core_cs', 'interview'],
};

type Shares = Record<Stream, number>;
const SDE: Shares = { dsa: 40, core_cs: 15, dev: 35, interview: 5, aptitude: 5 };

export const ROLE_SHARES: Record<RoleFamilyId, Shares> = {
  frontend: SDE,
  backend: SDE,
  fullstack: SDE,
  devops: { dsa: 20, core_cs: 20, dev: 50, interview: 5, aptitude: 5 },
  'data-ml': { dsa: 25, core_cs: 10, dev: 55, interview: 5, aptitude: 5 },
  'data-analyst': { dsa: 10, core_cs: 10, dev: 65, interview: 5, aptitude: 10 },
  'product-manager': { dsa: 0, core_cs: 0, dev: 80, interview: 10, aptitude: 10 },
  design: { dsa: 0, core_cs: 0, dev: 85, interview: 10, aptitude: 5 },
};

/** Largest-remainder rounding of non-negative weights to integers summing to 100. */
export function normaliseShares(weights: Partial<Record<Stream, number>>): Partial<Record<Stream, number>> {
  const entries = STREAMS.map((s) => [s, Math.max(0, Number(weights[s]) || 0)] as const).filter(([, v]) => v > 0);
  const total = entries.reduce((n, [, v]) => n + v, 0);
  if (!total) return {};
  const raw = entries.map(([s, v]) => ({ s, exact: (v / total) * 100 }));
  const out = raw.map((r) => ({ s: r.s, v: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let left = 100 - out.reduce((n, r) => n + r.v, 0);
  for (const r of [...out].sort((a, b) => b.rem - a.rem || STREAMS.indexOf(a.s) - STREAMS.indexOf(b.s))) {
    if (left <= 0) break;
    r.v += 1;
    left--;
  }
  return Object.fromEntries(out.filter((r) => r.v > 0).map((r) => [r.s, r.v]));
}

/** Streams the plan covers: the aim's streams, narrowed by the student's choice, without zero-share streams. */
export function enabledStreams(intake: Pick<Intake, 'aim' | 'role' | 'streams'>): Stream[] {
  const byAim = AIM_STREAMS[intake.aim];
  const chosen = byAim.filter((s) => intake.streams.includes(s));
  const list = chosen.length ? chosen : byAim;
  const shares = ROLE_SHARES[intake.role];
  const nonZero = list.filter((s) => shares[s] > 0);
  return nonZero.length ? nonZero : list;
}

export function roleShares(intake: Pick<Intake, 'aim' | 'role' | 'streams'>): Partial<Record<Stream, number>> {
  const streams = enabledStreams(intake);
  const shares = ROLE_SHARES[intake.role];
  return normaliseShares(Object.fromEntries(streams.map((s) => [s, shares[s] || 1])));
}

// ── Text helpers ────────────────────────────────────────────────────────────

/** Strips URLs and emails, collapses whitespace and clips to `max` characters. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  const s = input
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bwww\.\S+/gi, '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

export function slugify(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || fallback;
}

// ── Module selection ────────────────────────────────────────────────────────

export function moduleFitsIntake(
  m: LearnModule,
  intake: Pick<Intake, 'role' | 'aim' | 'language'>,
  streams: Stream[]
): boolean {
  return (
    streams.includes(m.stream) &&
    (m.role_families.length === 0 || m.role_families.includes(intake.role)) &&
    (m.aims.length === 0 || m.aims.includes(intake.aim)) &&
    (m.language === null || m.language === intake.language)
  );
}

function streamLevel(intake: Pick<Intake, 'levels'>, stream: Stream): Level {
  return stream === 'interview' ? 'new' : intake.levels[stream];
}

/** Default emphasis for a module given the student's level and known skills. */
export function defaultEmphasis(m: LearnModule, intake: Pick<Intake, 'levels' | 'known_skill_ids'>): Emphasis {
  const level = streamLevel(intake, m.stream);
  const known = new Set(intake.known_skill_ids);
  if (level === 'comfortable') return 'light';
  if (m.level <= 2 && level !== 'new') return 'light';
  if (m.skill_ids.length > 0 && m.skill_ids.every((s) => known.has(s))) return 'light';
  return 'standard';
}

/** Modules the rules planner picks for an intake, in catalogue order. */
export function selectModules(intake: Intake, index: CatalogIndex): LearnModule[] {
  const streams = enabledStreams(intake);
  return index.catalog.modules.filter((m) => moduleFitsIntake(m, intake, streams)).sort(compareModules);
}

function projectLevelFor(level: Level): ProjectLevel[] {
  return level === 'new' ? ['beginner'] : level === 'some' ? ['intermediate', 'beginner'] : ['intermediate', 'advanced'];
}

/** 1–2 library projects for the role and dev level (`beginnerOnly` for the free plan). */
export function pickProjects(
  intake: Intake,
  index: CatalogIndex,
  opts: { count?: number; beginnerOnly?: boolean } = {}
): Project[] {
  const levels = opts.beginnerOnly ? ['beginner'] : projectLevelFor(intake.levels.dev);
  const forRole = index.catalog.projects.filter((p) => p.role_families.includes(intake.role) && p.status !== 'archived');
  const ranked = [...forRole].sort((a, b) => {
    const la = levels.indexOf(a.level);
    const lb = levels.indexOf(b.level);
    return (la < 0 ? 99 : la) - (lb < 0 ? 99 : lb) || a.id.localeCompare(b.id);
  });
  return ranked.filter((p) => levels.includes(p.level)).slice(0, opts.count ?? 2);
}

/** The last of the project's prerequisite modules that is in the roadmap. */
export function projectAnchor(project: Project, moduleIds: string[]): string | null {
  let best: string | null = null;
  let bestIdx = -1;
  for (const pre of project.prerequisite_modules) {
    const i = moduleIds.indexOf(pre);
    if (i > bestIdx) {
      bestIdx = i;
      best = pre;
    }
  }
  return best;
}

function weeksOf(intake: Pick<Intake, 'start_date' | 'end_date'>): number {
  return Math.max(1, Math.round((daysBetween(intake.start_date, intake.end_date) + 1) / 7));
}

function hoursPerWeek(intake: Intake): number {
  const weekend = intake.study_days.filter((d) => d === 0 || d === 6).length;
  const weekday = intake.study_days.length - weekend;
  return Math.round(((weekday * intake.weekday_minutes + weekend * intake.weekend_minutes) / 60) * 10) / 10;
}

function streamList(streams: Partial<Record<Stream, number>>): string {
  const names = STREAMS.filter((s) => (streams[s] ?? 0) > 0).map((s) => STREAM_LABELS[s]);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ── Rules planner ───────────────────────────────────────────────────────────

/**
 * Builds a roadmap without AI: role/aim streams and shares, modules from the
 * catalogue with level-based emphasis, deep emphasis on the top modules when
 * 30%+ of the time is spare, 1–2 projects, then topological order.
 */
export function planRoadmapRules(
  intake: Intake,
  index: CatalogIndex,
  now: Date,
  opts: { beginnerProjectsOnly?: boolean; id?: string } = {}
): Roadmap {
  const streams = roleShares(intake);
  const picked = selectModules(intake, index);
  const emphasis = new Map(picked.map((m) => [m.id, defaultEmphasis(m, intake)]));
  const ordered = orderModules(
    index,
    picked.map((m) => m.id)
  );
  const usable = usableMinutes(buildDays(intake, { dsa: picked.some((m) => m.stream === 'dsa') }));
  const minutesFor = (id: string) => moduleMinutes(index, id)[emphasis.get(id)!];
  let total = ordered.reduce((n, id) => n + minutesFor(id), 0);
  if (usable > 0 && total <= usable * 0.7) {
    // Spare time: deepen modules of the largest streams first, keeping 15% slack.
    const priority = [...ordered].sort(
      (a, b) =>
        (streams[index.modules.get(b)!.stream] ?? 0) - (streams[index.modules.get(a)!.stream] ?? 0) ||
        ordered.indexOf(a) - ordered.indexOf(b)
    );
    for (const id of priority) {
      if (emphasis.get(id) !== 'standard') continue;
      const extra = moduleMinutes(index, id).deep - minutesFor(id);
      if (total + extra > usable * 0.85) continue;
      emphasis.set(id, 'deep');
      total += extra;
    }
  }
  const projects = pickProjects(intake, index, {
    count: usable >= 60 * 60 ? 2 : 1,
    beginnerOnly: opts.beginnerProjectsOnly,
  }).map((p) => ({ project_id: p.id, after_module: projectAnchor(p, ordered), why: `Builds ${p.skill_ids.slice(0, 3).join(', ')} into something you can show.` }));
  const modules: RoadmapModule[] = ordered.map((id) => ({
    module_id: id,
    emphasis: emphasis.get(id)!,
    skip_topics: [],
    why: '',
    added_for: null,
    custom: null,
  }));
  const roadmap: Roadmap = {
    id: opts.id ?? randomUuid(),
    version: 2,
    track_id: intake.role,
    intake,
    source: 'rules',
    summary: '',
    streams,
    modules,
    projects,
    boosts: [],
    warnings: [],
    created_at: now.toISOString(),
    accepted_at: null,
  };
  return { ...roadmap, summary: rulesSummary(roadmap, index), warnings: budgetWarnings(roadmap, index) };
}

function rulesSummary(roadmap: Roadmap, index: CatalogIndex): string {
  const role = roadmap.intake.role.replace(/-/g, ' ');
  const n = roadmap.modules.length;
  const project = roadmap.projects.length
    ? ` You also build ${roadmap.projects.map((p) => index.projects.get(p.project_id)?.title ?? p.project_id).join(' and ')}.`
    : '';
  return cleanText(
    `A ${weeksOf(roadmap.intake)}-week ${role} plan at about ${hoursPerWeek(roadmap.intake)} h a week: ${n} modules across ${streamList(roadmap.streams)}.${project}`,
    600
  );
}

/** "Needs about X h; you have about Y h" when the plan is over budget. */
export function budgetWarnings(roadmap: Roadmap, index: CatalogIndex): string[] {
  const usable = usableMinutes(buildDays(roadmap.intake, { dsa: true }));
  const need = totalMinutes(expandRoadmap(roadmap, index));
  if (need <= usable) return [];
  return [
    `This plan needs about ${Math.round(need / 60)} h and you have about ${Math.round(usable / 60)} h. Optional work and some depth will be left out; the review screen lists what.`,
  ];
}

// ── AI normaliser ───────────────────────────────────────────────────────────

const looseString = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());
const looseArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())).transform((xs) =>
    xs.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data as z.infer<T>] : [];
    })
  );
const emphasisLoose = z.preprocess(
  (v) => (typeof v === 'string' && ['light', 'standard', 'deep'].includes(v) ? v : 'standard'),
  z.enum(['light', 'standard', 'deep'])
);

export const AiRoadmapRawSchema = z.object({
  summary: looseString,
  streams: looseArray(z.object({ stream: z.string(), percent: z.number() })),
  modules: looseArray(
    z.object({
      module_id: z.string(),
      emphasis: emphasisLoose,
      skip_topics: z.array(z.string()).optional(),
      why: looseString.optional(),
    })
  ),
  custom_modules: looseArray(
    z.object({
      title: z.string(),
      summary: looseString.optional(),
      stream: z.string(),
      topics: looseArray(
        z.object({
          title: z.string(),
          summary: looseString.optional(),
          tasks: looseArray(z.object({ kind: z.string(), title: z.string(), minutes: z.number() })),
        })
      ),
    })
  ),
  projects: looseArray(z.object({ project_id: z.string(), after_module: z.string().nullish(), why: looseString.optional() })),
  warnings: looseArray(z.string()),
});
export type AiRoadmapRaw = z.input<typeof AiRoadmapRawSchema>;

const CUSTOM_KINDS = ['learn', 'read', 'build', 'practice'] as const;

function toCustomModule(raw: z.infer<typeof AiRoadmapRawSchema>['custom_modules'][number]): CustomModule | null {
  const stream = (STREAMS as readonly string[]).includes(raw.stream) ? (raw.stream as Stream) : 'dev';
  const topicKeys = new Set<string>();
  const topics = raw.topics.slice(0, 8).flatMap((t, ti) => {
    const title = cleanText(t.title, 100);
    if (!title) return [];
    let key = slugify(title, `topic-${ti + 1}`);
    while (topicKeys.has(key)) key = `${key}-${ti + 1}`;
    topicKeys.add(key);
    const tasks = t.tasks.slice(0, 6).flatMap((k, ki) => {
      const taskTitle = cleanText(k.title, 140);
      if (!taskTitle) return [];
      const kind = (CUSTOM_KINDS as readonly string[]).includes(k.kind) ? (k.kind as (typeof CUSTOM_KINDS)[number]) : 'learn';
      return [{ key: `t${ki + 1}`, kind, title: taskTitle, minutes: Math.min(60, Math.max(10, Math.round(k.minutes || 30))) }];
    });
    if (!tasks.length) return [];
    return [{ key, title, summary: cleanText(t.summary, 600), tasks }];
  });
  const title = cleanText(raw.title, 80);
  if (!title || !topics.length) return null;
  return { title, summary: cleanText(raw.summary, 400), stream, topics };
}

/**
 * Turns raw AI output into a roadmap grounded in the catalogue: unknown ids are
 * dropped (with a warning), missing hard prerequisites are added at light
 * emphasis, modules are ordered topologically (AI order breaks ties) and stream
 * shares become integers summing to 100. Returns null when no catalogue module
 * survives (the caller then uses the rules planner).
 */
export function normaliseAiRoadmap(
  raw: unknown,
  intake: Intake,
  index: CatalogIndex,
  now: Date,
  opts: { id?: string; beginnerProjectsOnly?: boolean } = {}
): Roadmap | null {
  const parsed = AiRoadmapRawSchema.safeParse(raw ?? {});
  if (!parsed.success) return null;
  const ai = parsed.data;
  const warnings: string[] = [];
  const streamsAllowed = enabledStreams(intake);

  const chosen: RoadmapModule[] = [];
  const seen = new Set<string>();
  for (const m of ai.modules) {
    const mod = index.modules.get(m.module_id);
    if (!mod) {
      warnings.push(cleanText(`Skipped an unknown module the AI suggested (${m.module_id}).`, 300));
      continue;
    }
    if (seen.has(mod.id)) continue;
    if (mod.language && mod.language !== intake.language) continue;
    if (!streamsAllowed.includes(mod.stream)) continue;
    seen.add(mod.id);
    const topicIds = new Set((index.topicsByModule.get(mod.id) ?? []).map((t) => t.id));
    chosen.push({
      module_id: mod.id,
      emphasis: m.emphasis,
      skip_topics: [...new Set((m.skip_topics ?? []).filter((t) => topicIds.has(t)))],
      why: cleanText(m.why, 300),
      added_for: null,
      custom: null,
    });
  }
  if (!chosen.length) return null;

  // Missing hard prerequisites, recursively, at light emphasis.
  const addFor = (id: string, forTitle: string) => {
    for (const pre of hardPrerequisites(index, id)) {
      if (seen.has(pre)) continue;
      const mod = index.modules.get(pre)!;
      if (mod.language && mod.language !== intake.language) continue;
      seen.add(pre);
      chosen.push({ module_id: pre, emphasis: 'light', skip_topics: [], why: '', added_for: forTitle, custom: null });
      addFor(pre, mod.title);
    }
  };
  for (const m of [...chosen]) addFor(m.module_id, index.modules.get(m.module_id)!.title);

  // AI order is the tie-break; prerequisites added later sort before their dependants.
  const ordered = orderModules(
    index,
    chosen.map((m) => m.module_id)
  );
  const byId = new Map(chosen.map((m) => [m.module_id, m]));
  const modules: RoadmapModule[] = ordered.map((id) => byId.get(id)!);

  const customs = ai.custom_modules
    .slice(0, 3)
    .map(toCustomModule)
    .filter((c): c is CustomModule => !!c);
  customs.forEach((c, i) => {
    modules.push({
      module_id: `custom.${i + 1}`,
      emphasis: 'standard',
      skip_topics: [],
      why: 'AI-generated module, not reviewed.',
      added_for: null,
      custom: c,
    });
  });

  const roadmapIds = modules.map((m) => m.module_id);
  const projects: Roadmap['projects'] = [];
  for (const p of ai.projects) {
    const project = index.projects.get(p.project_id);
    if (!project) {
      warnings.push(cleanText(`Skipped an unknown project the AI suggested (${p.project_id}).`, 300));
      continue;
    }
    if (projects.some((x) => x.project_id === project.id) || projects.length >= 3) continue;
    if (opts.beginnerProjectsOnly && project.level !== 'beginner') continue;
    const anchor =
      p.after_module && roadmapIds.includes(p.after_module) && index.modules.get(p.after_module)?.stream === 'dev'
        ? p.after_module
        : null;
    projects.push({ project_id: project.id, after_module: anchor, why: cleanText(p.why, 300) });
  }

  const present = new Set<Stream>(
    modules.map((m) => (m.custom ? m.custom.stream : index.modules.get(m.module_id)!.stream))
  );
  const aiShares: Partial<Record<Stream, number>> = {};
  for (const s of ai.streams) {
    if ((STREAMS as readonly string[]).includes(s.stream) && present.has(s.stream as Stream)) {
      aiShares[s.stream as Stream] = Math.min(100, Math.max(0, s.percent));
    }
  }
  let streams = normaliseShares(aiShares);
  const fallback = roleShares(intake);
  for (const s of present) if (!(s in streams)) streams = { ...streams, [s]: fallback[s] ?? 5 };
  streams = normaliseShares(streams);

  const roadmap: Roadmap = {
    id: opts.id ?? randomUuid(),
    version: 2,
    track_id: intake.role,
    intake,
    source: 'ai',
    summary: cleanText(ai.summary, 600),
    streams,
    modules: modules.slice(0, 80),
    projects,
    boosts: [],
    warnings: [...warnings, ...ai.warnings.map((w) => cleanText(w, 300)).filter(Boolean)].slice(0, 30),
    created_at: now.toISOString(),
    accepted_at: null,
  };
  if (!roadmap.summary) roadmap.summary = rulesSummary(roadmap, index);
  return roadmap;
}

// ── Diff (Adjust and manual edits) ──────────────────────────────────────────

export const RoadmapDiffSchema = z.object({
  summary_of_change: z.string().max(400).default(''),
  warnings: z.array(z.string().max(300)).max(10).default([]),
  add: z
    .array(z.object({ module_id: z.string(), emphasis: z.enum(['light', 'standard', 'deep']).default('standard'), why: z.string().max(300).default('') }))
    .max(20)
    .default([]),
  remove: z.array(z.string()).max(40).default([]),
  emphasis: z
    .array(z.object({ module_id: z.string(), emphasis: z.enum(['light', 'standard', 'deep']) }))
    .max(80)
    .default([]),
  streams: z.array(z.object({ stream: z.string(), percent: z.number() })).nullable().default(null),
  blackouts_add: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).default([]),
  weekday_minutes: z.number().int().min(0).max(600).nullable().default(null),
  weekend_minutes: z.number().int().min(0).max(600).nullable().default(null),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  project_add: z.array(z.string()).max(3).default([]),
  project_remove: z.array(z.string()).max(4).default([]),
  /** Manual edit on the Review screen: explicit module order. */
  order: z.array(z.string()).max(80).nullable().default(null),
});
export type RoadmapDiff = z.infer<typeof RoadmapDiffSchema>;
export type RoadmapDiffInput = z.input<typeof RoadmapDiffSchema>;

export interface DiffResult {
  roadmap: Roadmap;
  warnings: string[];
  /** Whether the calendar changed (dates, minutes, blackouts), so future days need rebuilding. */
  calendarChanged: boolean;
}

/**
 * Applies a diff. Removing a module that another module needs (hard
 * prerequisite) keeps it and warns; added modules bring their missing hard
 * prerequisites; the result is reordered topologically (current order breaks ties).
 */
export function applyRoadmapDiff(roadmap: Roadmap, diffInput: RoadmapDiffInput, index: CatalogIndex): DiffResult {
  const diff = RoadmapDiffSchema.parse(diffInput);
  const warnings = diff.warnings.map((w) => cleanText(w, 300)).filter(Boolean);
  let modules = roadmap.modules.map((m) => ({ ...m }));
  const has = (id: string) => modules.some((m) => m.module_id === id);

  for (const a of diff.add) {
    const mod = index.modules.get(a.module_id);
    if (!mod) {
      warnings.push(`Skipped an unknown module (${cleanText(a.module_id, 60)}).`);
      continue;
    }
    if (mod.language && mod.language !== roadmap.intake.language) continue;
    if (has(mod.id)) continue;
    modules.push({ module_id: mod.id, emphasis: a.emphasis, skip_topics: [], why: cleanText(a.why, 300), added_for: null, custom: null });
    for (const pre of moduleHardClosure(index, [mod.id])) {
      if (has(pre)) continue;
      const pm = index.modules.get(pre)!;
      if (pm.language && pm.language !== roadmap.intake.language) continue;
      modules.push({ module_id: pre, emphasis: 'light', skip_topics: [], why: '', added_for: mod.title, custom: null });
    }
  }

  const removing = new Set(diff.remove);
  for (const id of diff.remove) {
    if (!has(id)) continue;
    const needers = modules.filter(
      (m) => !removing.has(m.module_id) && !m.custom && hardPrerequisites(index, m.module_id).includes(id)
    );
    if (needers.length) {
      removing.delete(id);
      const title = index.modules.get(id)?.title ?? id;
      warnings.push(`Kept ${title}: ${index.modules.get(needers[0].module_id)?.title ?? needers[0].module_id} needs it.`);
    }
  }
  modules = modules.filter((m) => !removing.has(m.module_id));

  for (const e of diff.emphasis) {
    modules = modules.map((m) => (m.module_id === e.module_id && !m.custom ? { ...m, emphasis: e.emphasis } : m));
  }

  const preference = diff.order
    ? [...diff.order.filter((id) => modules.some((m) => m.module_id === id)), ...modules.map((m) => m.module_id)]
    : modules.map((m) => m.module_id);
  const catalogIds = [...new Set(preference)].filter((id) => index.modules.has(id));
  const ordered = orderModules(index, catalogIds);
  const byId = new Map(modules.map((m) => [m.module_id, m]));
  const customs = modules.filter((m) => m.custom);
  modules = [...ordered.map((id) => byId.get(id)!), ...customs];
  if (!modules.length) {
    warnings.push('A roadmap needs at least one module, so nothing was removed.');
    modules = roadmap.modules;
  }

  let projects = roadmap.projects.filter((p) => !diff.project_remove.includes(p.project_id));
  for (const pid of diff.project_add) {
    const project = index.projects.get(pid);
    if (!project || projects.some((p) => p.project_id === pid)) continue;
    if (projects.length >= 3) {
      warnings.push('A roadmap holds at most 3 projects.');
      break;
    }
    projects.push({ project_id: pid, after_module: projectAnchor(project, modules.map((m) => m.module_id)), why: '' });
  }
  const ids = modules.map((m) => m.module_id);
  projects = projects.map((p) => (p.after_module && !ids.includes(p.after_module) ? { ...p, after_module: null } : p));

  const present = new Set<Stream>(modules.map((m) => (m.custom ? m.custom.stream : index.modules.get(m.module_id)!.stream)));
  let streams: Partial<Record<Stream, number>> = Object.fromEntries(
    Object.entries(roadmap.streams).filter(([s]) => present.has(s as Stream))
  );
  if (diff.streams) {
    for (const s of diff.streams) {
      if ((STREAMS as readonly string[]).includes(s.stream) && present.has(s.stream as Stream)) {
        streams[s.stream as Stream] = Math.max(0, Math.min(100, s.percent));
      }
    }
  }
  const fallback = roleShares(roadmap.intake);
  for (const s of present) if (!streams[s]) streams = { ...streams, [s]: fallback[s] ?? 5 };
  streams = normaliseShares(streams);

  const intake: Intake = { ...roadmap.intake };
  let calendarChanged = false;
  if (diff.blackouts_add.length) {
    const blackouts = [...new Set([...intake.blackouts, ...diff.blackouts_add.filter((d) => d >= intake.start_date)])].sort().slice(0, 60);
    calendarChanged ||= blackouts.length !== intake.blackouts.length;
    intake.blackouts = blackouts;
  }
  if (diff.weekday_minutes !== null && diff.weekday_minutes !== intake.weekday_minutes) {
    intake.weekday_minutes = diff.weekday_minutes;
    calendarChanged = true;
  }
  if (diff.weekend_minutes !== null && diff.weekend_minutes !== intake.weekend_minutes) {
    intake.weekend_minutes = diff.weekend_minutes;
    calendarChanged = true;
  }
  if (diff.end_date !== null && diff.end_date !== intake.end_date) {
    if (diff.end_date > intake.start_date) {
      intake.end_date = diff.end_date;
      calendarChanged = true;
    } else warnings.push('The end date must be after the start date, so it was not changed.');
  }
  return {
    roadmap: {
      ...roadmap,
      intake,
      streams,
      modules,
      projects,
      warnings: warnings.slice(0, 30),
    },
    warnings,
    calendarChanged,
  };
}
