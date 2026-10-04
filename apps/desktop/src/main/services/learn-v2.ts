/**
 * Learn v2 in the main process: the catalogue (from the reviewed seed bundle),
 * roadmap generation (AI through ai-proxy with the rules planner as fallback),
 * adjustments, acceptance, schedule/project/note saves and the repo check.
 * Plan limits (beginner-only and active projects, company boosts) come from the
 * server's entitlements; signed out or offline counts as the free plan.
 */
import bundleJson from '@job-automator/learning/seed/bundle.json';
import { getPlan, type PlanId } from '@nomadic/config';
import {
  IntakeSchema,
  ProblemNoteSchema,
  RoadmapDiffSchema,
  RoadmapSchema,
  ScheduleSchema,
  UserProjectSchema,
  applyRoadmapDiff,
  buildProblemIndex,
  canStartProject,
  companyBoosts,
  doneEntries,
  enabledStreams,
  expandRoadmap,
  fitRoadmap,
  indexCatalog,
  localToday,
  moduleHardClosure,
  moduleMinutes,
  moduleProgress,
  normaliseAiRoadmap,
  paceFactor,
  planRoadmapRules,
  projectMinutes,
  randomUuid,
  replan,
  usableMinutes,
  buildDays,
  type CatalogIndex,
  type CompanyDataset,
  type ContentBundle,
  type Intake,
  type IntakeInput,
  type LearningEvent,
  type ProblemInfo,
  type ProblemNote,
  type Roadmap,
  type Schedule,
  type UserProject,
} from '@job-automator/learning';
import type {
  LearnAcceptResult,
  LearnAdjustResult,
  LearnDraft,
  LearnGenerateResult,
  LearnNoteSaveResult,
  LearnProjectSaveResult,
  LearnRepoCheckRequest,
  LearnRepoCheckResult,
  SuccessResult,
} from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { callAiProxy } from './ai-proxy.js';
import { errorMessage, log } from './app-context.js';
import { getEntitlements } from './entitlements.js';
import { checkRepo } from './github-check.js';
import { deleteDoc, getDoc, insertEvents, listEvents, putDoc } from './learning-store.js';
import { loadCompanyDataset } from './practice-catalog.js';

const bundle = bundleJson as unknown as ContentBundle;
let index: CatalogIndex | null = null;

export function learnCatalog(): CatalogIndex {
  if (!index) index = indexCatalog(bundle);
  return index;
}

/** Tests swap in a small catalogue. */
export function setLearnCatalogForTests(next: CatalogIndex | null): void {
  index = next;
}

// ── Plan limits ─────────────────────────────────────────────────────────────

export interface LearnPlanLimits {
  plan: PlanId;
  beginnerOnly: boolean;
  activeProjects: number;
  companyBoost: boolean;
}

export async function learnPlanLimits(): Promise<LearnPlanLimits> {
  const res = await getEntitlements();
  const plan: PlanId = res.success && res.entitlements.accountStatus === 'active' ? res.entitlements.plan : 'free';
  const l = getPlan(plan).limits;
  return { plan, beginnerOnly: plan === 'free', activeProjects: l.learnProjectsActive, companyBoost: l.companyQuestionSets };
}

// ── State documents ─────────────────────────────────────────────────────────

const now = () => new Date();

export function readRoadmap(db = getDb(), userId: string): Roadmap | null {
  const doc = getDoc(db, userId, 'roadmap');
  const r = doc ? RoadmapSchema.safeParse(doc.value) : null;
  return r?.success ? r.data : null;
}

export function readSchedule(db = getDb(), userId: string): Schedule | null {
  const doc = getDoc(db, userId, 'schedule');
  const r = doc ? ScheduleSchema.safeParse(doc.value) : null;
  return r?.success ? r.data : null;
}

export function readProjects(db = getDb(), userId: string): UserProject[] {
  const doc = getDoc(db, userId, 'projects');
  const list = Array.isArray(doc?.value) ? doc.value : [];
  return list.flatMap((p) => {
    const r = UserProjectSchema.safeParse(p);
    return r.success ? [r.data] : [];
  });
}

export function readNotes(db = getDb(), userId: string): ProblemNote[] {
  const doc = getDoc(db, userId, 'notes');
  const list = Array.isArray(doc?.value) ? doc.value : [];
  return list.flatMap((p) => {
    const r = ProblemNoteSchema.safeParse(p);
    return r.success ? [r.data] : [];
  });
}

export function readDraft(db = getDb(), userId: string): LearnDraft | null {
  const v = getDoc(db, userId, 'draft')?.value as Partial<LearnDraft> | undefined;
  if (!v) return null;
  const roadmap = RoadmapSchema.safeParse(v.roadmap);
  const schedule = ScheduleSchema.safeParse(v.schedule);
  if (!roadmap.success || !schedule.success) return null;
  return {
    roadmap: roadmap.data,
    schedule: schedule.data,
    notice: typeof v.notice === 'string' ? v.notice : null,
    created_at: typeof v.created_at === 'string' ? v.created_at : roadmap.data.created_at,
  };
}

function events(userId: string): LearningEvent[] {
  return listEvents(getDb(), userId) as unknown as LearningEvent[];
}

// ── AI catalogue ────────────────────────────────────────────────────────────

export const AI_CATALOG_MAX_CHARS = 60_000;

export interface AiCatalog {
  text: string;
  module_ids: string[];
  project_ids: string[];
  topic_ids: string[];
}

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/**
 * The compact catalogue sent to the AI: modules for the student's streams and
 * language (role-specific dev modules only for the role, plus their hard
 * prerequisites), hours per emphasis, prerequisites, topic ids for skipping, and
 * the role's projects. Topic lines are dropped first if the text gets too long.
 */
export function buildAiCatalog(intake: Intake, idx: CatalogIndex = learnCatalog()): AiCatalog {
  const streams = enabledStreams(intake);
  const fits = idx.catalog.modules.filter(
    (m) => streams.includes(m.stream) && (m.language === null || m.language === intake.language) && (m.aims.length === 0 || m.aims.includes(intake.aim))
  );
  const forRole = fits.filter((m) => m.role_families.length === 0 || m.role_families.includes(intake.role));
  const ids = new Set(forRole.map((m) => m.id));
  for (const pre of moduleHardClosure(idx, ids)) if (fits.some((m) => m.id === pre)) ids.add(pre);
  const modules = fits.filter((m) => ids.has(m.id));
  const projects = idx.catalog.projects.filter((p) => p.role_families.includes(intake.role));

  const moduleLine = (m: (typeof modules)[number]) => {
    const h = moduleMinutes(idx, m.id);
    const pre = m.prerequisites.filter((p) => p.kind === 'hard').map((p) => p.module_id);
    return `M|${m.id}|${m.title}|${m.stream}|L${m.level}|h ${hours(h.light)}/${hours(h.standard)}/${hours(h.deep)}${pre.length ? `|pre ${pre.join(',')}` : ''}${m.skill_ids.length ? `|skills ${m.skill_ids.join(',')}` : ''}`;
  };
  const topicLines = (m: (typeof modules)[number]) =>
    (idx.topicsByModule.get(m.id) ?? []).map((t) => `  T|${t.id}|${t.title}|${t.tier}`);
  const projectLines = projects.map(
    (p) => `P|${p.id}|${p.title}|${p.level}|h ${hours(projectMinutes(p))}|after ${p.prerequisite_modules.join(',') || '-'}|skills ${p.skill_ids.join(',')}`
  );
  const header = 'Format: M|module_id|title|stream|level|hours light/standard/deep|pre hard prerequisites|skills; T|topic_id|title|tier; P|project_id|title|level|hours|after modules|skills';
  const withTopics = [header, ...modules.flatMap((m) => [moduleLine(m), ...topicLines(m)]), ...projectLines].join('\n');
  const text =
    withTopics.length <= AI_CATALOG_MAX_CHARS
      ? withTopics
      : [header, ...modules.map(moduleLine), ...projectLines].join('\n').slice(0, AI_CATALOG_MAX_CHARS);
  return {
    text,
    module_ids: modules.map((m) => m.id),
    project_ids: projects.map((p) => p.id),
    topic_ids: text.includes('  T|') ? modules.flatMap((m) => (idx.topicsByModule.get(m.id) ?? []).map((t) => t.id)) : [],
  };
}

function weeksOf(intake: Intake): number {
  return Math.max(1, Math.round((Date.parse(intake.end_date) - Date.parse(intake.start_date)) / (7 * 86_400_000)));
}

// ── Generate ────────────────────────────────────────────────────────────────

let datasetCache: CompanyDataset | null = null;
let problemLookup: Map<string, ProblemInfo> | null = null;

async function companyDataset(): Promise<CompanyDataset | null> {
  if (datasetCache) return datasetCache;
  try {
    datasetCache = (await loadCompanyDataset()) as CompanyDataset;
    return datasetCache;
  } catch (err) {
    log(`[Learn] Company lists not loaded: ${errorMessage(err)}`);
    return null;
  }
}

/** Adds company-boost problems (paid plans) for the roadmap's topics. */
export async function withBoosts(roadmap: Roadmap, allowed: boolean, idx: CatalogIndex = learnCatalog()): Promise<Roadmap> {
  if (!allowed || !roadmap.intake.companies.length) return { ...roadmap, boosts: [] };
  const dataset = await companyDataset();
  if (!dataset) return { ...roadmap, boosts: [] };
  const topicIds = [...new Set(expandRoadmap({ ...roadmap, boosts: [] }, idx).map((t) => t.topic_id).filter((t): t is string => !!t))];
  if (!problemLookup) {
    // Every dataset problem; the catalogue's entries win (they carry the checked paid-only flag).
    problemLookup = new Map(buildProblemIndex(dataset).map((p) => [p.ref, p]));
    for (const [ref, p] of idx.problems) problemLookup.set(ref, p);
  }
  const boosts = companyBoosts({ dataset, index: idx, topicIds, companies: roadmap.intake.companies, problems: problemLookup });
  return { ...roadmap, boosts: boosts.map((b) => ({ topic_id: b.topic_id, problems: b.problems, companies: b.companies })) };
}

function currentPace(userId: string): number {
  const s = readSchedule(getDb(), userId);
  return s?.pace_factor ?? paceFactor(events(userId)) ?? 1;
}

/**
 * Builds a draft roadmap: the AI picks from the catalogue (roadmap_plan), the
 * result is normalised and checked; when the AI is unavailable, refused or its
 * answer is unusable, the rules planner builds it instead. Saves the draft.
 */
export async function generateRoadmap(userId: string, input: IntakeInput): Promise<LearnGenerateResult> {
  const parsed = IntakeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'The plan details are not valid.' };
  const intake = parsed.data;
  const idx = learnCatalog();
  const limits = await learnPlanLimits();
  const at = now();
  const id = randomUuid();
  const cat = buildAiCatalog(intake, idx);
  const usable = usableMinutes(buildDays(intake, { dsa: enabledStreams(intake).includes('dsa') }));

  let roadmap: Roadmap | null = null;
  let notice: string | null = null;
  let quota: LearnGenerateResult['quota'];
  const ai = await callAiProxy(
    'roadmap_plan',
    {
      intake: {
        role: intake.role,
        aim: intake.aim,
        start_date: intake.start_date,
        end_date: intake.end_date,
        weeks: weeksOf(intake),
        study_days: intake.study_days,
        weekday_minutes: intake.weekday_minutes,
        weekend_minutes: intake.weekend_minutes,
        blackout_days: intake.blackouts.length,
        usable_hours: Math.round(usable / 60),
        levels: intake.levels,
        language: intake.language,
        known_skills: intake.known_skill_ids,
        companies: limits.companyBoost ? intake.companies : [],
        note: intake.note,
      },
      catalog: cat.text,
      module_ids: cat.module_ids,
      project_ids: cat.project_ids,
      topic_ids: cat.topic_ids,
    },
    'AI roadmaps'
  );
  if (ai.ok) {
    quota = ai.quota;
    roadmap = normaliseAiRoadmap(ai.result, intake, idx, at, { id, beginnerProjectsOnly: limits.beginnerOnly });
    if (!roadmap) notice = 'Built with the standard planner: the AI answer did not match the catalogue.';
  } else {
    quota = ai.quota ?? null;
    notice = `Built with the standard planner: ${ai.error}`;
  }
  if (!roadmap) roadmap = planRoadmapRules(intake, idx, at, { id, beginnerProjectsOnly: limits.beginnerOnly });

  roadmap = await withBoosts(roadmap, limits.companyBoost, idx);
  const fit = fitRoadmap(roadmap, idx, { pace: currentPace(userId), now: at });
  const draft: LearnDraft = { roadmap: fit.roadmap, schedule: fit.schedule, notice, created_at: at.toISOString() };
  putDoc(getDb(), userId, 'draft', draft, at.toISOString());
  persistDb();
  log(`[Learn] Roadmap draft built (${fit.roadmap.source}, ${fit.roadmap.modules.length} modules, ${fit.schedule.left_out.length} tasks left out).`);
  return { success: true, draft, quota };
}

// ── Adjust ──────────────────────────────────────────────────────────────────

/** Compact text of the current roadmap and progress for roadmap_adjust. */
export function roadmapSummaryText(roadmap: Roadmap, schedule: Schedule, evs: LearningEvent[], idx: CatalogIndex = learnCatalog()): string {
  const tasks = expandRoadmap(roadmap, idx);
  const done = doneEntries(evs);
  const progress = new Map(moduleProgress(tasks, done, schedule).map((m) => [m.module_id, m]));
  const i = roadmap.intake;
  const lines = [
    `role ${i.role}; aim ${i.aim}; ${i.start_date} to ${i.end_date}; weekday ${i.weekday_minutes} min; weekend ${i.weekend_minutes} min; study days ${i.study_days.join(',')}; blackouts ${i.blackouts.length}`,
    `streams ${Object.entries(roadmap.streams).map(([s, p]) => `${s} ${p}%`).join(', ')}`,
    ...roadmap.modules.map((m) => {
      const p = progress.get(m.module_id);
      const title = m.custom ? m.custom.title : idx.modules.get(m.module_id)?.title ?? m.module_id;
      return `module ${m.module_id} (${title}) ${m.emphasis}; ${p ? `${p.percent}% done` : 'not started'}`;
    }),
    ...roadmap.projects.map((p) => `project ${p.project_id}${p.after_module ? ` after ${p.after_module}` : ''}`),
    `left out for time: ${schedule.left_out.filter((l) => l.reason === 'no_time').length} tasks`,
  ];
  return lines.join('\n').slice(0, 24_000);
}

/** Asks the AI for a change and returns the proposal (nothing is saved until accepted). */
export async function adjustRoadmap(userId: string, instruction: string): Promise<LearnAdjustResult> {
  const db = getDb();
  const roadmap = readRoadmap(db, userId);
  const schedule = readSchedule(db, userId);
  if (!roadmap || !schedule) return { success: false, error: 'Accept a roadmap first.' };
  const idx = learnCatalog();
  const evs = events(userId);
  const today = localToday(now(), -now().getTimezoneOffset());
  const moduleIds = idx.catalog.modules.filter((m) => m.language === null || m.language === roadmap.intake.language).map((m) => m.id);
  const ai = await callAiProxy(
    'roadmap_adjust',
    {
      roadmap: roadmapSummaryText(roadmap, schedule, evs, idx),
      instruction: instruction.trim().slice(0, 500),
      today,
      module_ids: moduleIds.slice(0, 200),
      project_ids: idx.catalog.projects.map((p) => p.id),
    },
    'AI roadmap changes'
  );
  if (!ai.ok) return { success: false, error: ai.error, code: ai.code, quota: ai.quota ?? null };
  const diff = RoadmapDiffSchema.safeParse(ai.result);
  if (!diff.success) return { success: false, error: 'The AI answer could not be used. Try again or edit the roadmap yourself.', quota: ai.quota };
  return { ...proposeChange(roadmap, schedule, diff.data, today, evs), quota: ai.quota };
}

/** Applies a diff to the accepted roadmap and re-plans from today (pure apart from reading state). */
export function proposeChange(
  roadmap: Roadmap,
  schedule: Schedule,
  diff: ReturnType<typeof RoadmapDiffSchema.parse>,
  today: string,
  evs: LearningEvent[]
): LearnAdjustResult {
  const idx = learnCatalog();
  const applied = applyRoadmapDiff(roadmap, diff, idx);
  const r = replan({
    schedule,
    roadmap: applied.roadmap,
    index: idx,
    done: doneEntries(evs),
    today,
    templates: applied.calendarChanged ? 'intake' : 'keep',
    now: now(),
  });
  return {
    success: true,
    proposal: {
      roadmap: applied.roadmap,
      schedule: r.schedule,
      diff,
      summary: diff.summary_of_change,
      warnings: applied.warnings,
      moved: r.moved,
      shortfall: r.shortfall,
    },
  };
}

// ── Accept and saves ────────────────────────────────────────────────────────

function knownModules(roadmap: Roadmap, idx: CatalogIndex): string | null {
  for (const m of roadmap.modules) if (!m.custom && !idx.modules.has(m.module_id)) return m.module_id;
  return null;
}

export function acceptRoadmap(userId: string, rawRoadmap: unknown, rawSchedule: unknown): LearnAcceptResult {
  const r = RoadmapSchema.safeParse(rawRoadmap);
  const s = ScheduleSchema.safeParse(rawSchedule);
  if (!r.success || !s.success) return { success: false, error: 'The roadmap could not be saved: it is not valid.' };
  const idx = learnCatalog();
  const unknown = knownModules(r.data, idx);
  if (unknown) return { success: false, error: `The roadmap names a module that is not in the catalogue (${unknown}).` };
  if (s.data.roadmap_id !== r.data.id) return { success: false, error: 'The schedule belongs to a different roadmap.' };
  try {
    const at = now().toISOString();
    const roadmap: Roadmap = { ...r.data, accepted_at: r.data.accepted_at ?? at };
    const db = getDb();
    putDoc(db, userId, 'roadmap', roadmap, at);
    putDoc(db, userId, 'schedule', s.data, at);
    deleteDoc(db, userId, 'draft');
    insertEvents(db, userId, [
      {
        id: randomUuid(),
        type: 'roadmap_accepted',
        skill_id: null,
        item_id: roadmap.id,
        payload: { track_id: roadmap.track_id, source: roadmap.source, modules: roadmap.modules.length },
        duration_s: 0,
        created_at: at,
      },
    ]);
    persistDb();
    return { success: true, roadmap, schedule: s.data };
  } catch (err) {
    log(`[Learn] Roadmap not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your roadmap could not be saved on this device.' };
  }
}

export function saveSchedule(userId: string, raw: unknown): SuccessResult {
  const s = ScheduleSchema.safeParse(raw);
  if (!s.success) return { success: false, error: 'The schedule is not valid.' };
  const db = getDb();
  const roadmap = readRoadmap(db, userId);
  if (!roadmap || roadmap.id !== s.data.roadmap_id) return { success: false, error: 'The schedule does not belong to your roadmap.' };
  try {
    putDoc(db, userId, 'schedule', s.data, now().toISOString());
    persistDb();
    return { success: true };
  } catch (err) {
    log(`[Learn] Schedule not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your schedule could not be saved on this device.' };
  }
}

/** Saves one project's progress; starting a project checks the plan's limits. */
export async function saveProject(userId: string, raw: unknown): Promise<LearnProjectSaveResult> {
  const p = UserProjectSchema.safeParse(raw);
  if (!p.success) return { success: false, error: 'The project progress is not valid.' };
  const idx = learnCatalog();
  const project = idx.projects.get(p.data.project_id);
  if (!project) return { success: false, error: 'That project is not in the library.' };
  const db = getDb();
  const mine = readProjects(db, userId);
  const prev = mine.find((x) => x.project_id === project.id);
  if (p.data.status === 'active' && prev?.status !== 'active') {
    const limits = await learnPlanLimits();
    const can = canStartProject(project, mine, { active: limits.activeProjects, beginnerOnly: limits.beginnerOnly });
    if (!can.ok) return { success: false, error: can.reason, limited: true };
  }
  const projects = [...mine.filter((x) => x.project_id !== project.id), p.data];
  try {
    const at = now().toISOString();
    putDoc(db, userId, 'projects', projects, at);
    if (p.data.status === 'active' && prev?.status !== 'active') {
      insertEvents(db, userId, [{ id: randomUuid(), type: 'project_started', skill_id: null, item_id: project.id, payload: {}, duration_s: 0, created_at: at }]);
    }
    if (p.data.status === 'done' && prev?.status !== 'done') {
      insertEvents(db, userId, [
        { id: randomUuid(), type: 'project_done', skill_id: null, item_id: project.id, payload: { skill_ids: project.skill_ids }, duration_s: 0, created_at: at },
      ]);
    }
    persistDb();
    return { success: true, projects };
  } catch (err) {
    log(`[Learn] Project not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your project progress could not be saved on this device.' };
  }
}

export const MAX_NOTES = 2000;

export function saveProblemNote(userId: string, raw: unknown): LearnNoteSaveResult {
  const n = ProblemNoteSchema.safeParse(raw);
  if (!n.success) return { success: false, error: 'The note is not valid.' };
  const db = getDb();
  const empty = !n.data.note.trim() && !n.data.resolve_later;
  const notes = [...readNotes(db, userId).filter((x) => x.ref !== n.data.ref), ...(empty ? [] : [n.data])].slice(-MAX_NOTES);
  try {
    putDoc(db, userId, 'notes', notes, now().toISOString());
    persistDb();
    return { success: true, notes };
  } catch (err) {
    log(`[Learn] Note not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your note could not be saved on this device.' };
  }
}

export async function checkProjectRepo(userId: string, req: LearnRepoCheckRequest): Promise<LearnRepoCheckResult> {
  const project = learnCatalog().projects.get(req.projectId);
  const stage = project?.stages.find((s) => s.id === req.stageId);
  if (!project || !stage) return { success: false, error: 'That project stage is not in the library.' };
  if (!stage.repo_rules) return { success: false, error: 'This stage has no repository check.' };
  const db = getDb();
  const up = readProjects(db, userId).find((p) => p.project_id === project.id);
  const since = up?.stage_started_at[stage.id] ?? up?.started_at ?? null;
  const res = await checkRepo(req.repoUrl, stage.repo_rules, since);
  if (up && up.repo_url !== req.repoUrl.trim()) {
    const updated = { ...up, repo_url: req.repoUrl.trim().slice(0, 200), updated_at: now().toISOString() };
    putDoc(db, userId, 'projects', [...readProjects(db, userId).filter((p) => p.project_id !== project.id), updated], updated.updated_at);
    persistDb();
  }
  if (!res.ok) return { success: false, error: res.error, rateLimited: res.rateLimited };
  return { success: true, passed: res.passed, checks: res.checks, commits: res.commits, checkedAt: res.checkedAt };
}

