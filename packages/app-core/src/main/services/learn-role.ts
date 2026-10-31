/**
 * Learn v3 in the main process: a roadmap for any role (ai-proxy `roadmap_plan`
 * in the `tree` format, the reviewed catalogue as fallback for built-in roles),
 * the guided capstone (`capstone` format, or a curated project's own stages) and
 * help on a capstone step (`project_help` with the role). The roadmap is the
 * synced `roadmap` document; progress is the event log.
 */
import { z } from 'zod';
import {
  RoleRoadmapRequestSchema,
  RoleRoadmapSchema,
  catalogCapstone,
  catalogRoleRoadmap,
  normaliseCapstone,
  normaliseRoleRoadmap,
  randomUuid,
  roadmapTopics,
  type RoleRoadmap,
} from '@job-automator/learning';
import type { LearnCapstoneHelpRequest, LearnProjectHelpResult, LearnRoleRoadmapResult } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { aiErrorMessage, callAiProxy } from './ai-proxy.js';
import { errorMessage, log } from './app-context.js';
import { learnCatalog } from './learn-v2.js';
import { deleteDoc, getDoc, insertEvents, putDoc } from './learning-store.js';

/** Long enough for two model attempts on the proxy (each up to 65 s). */
const TREE_TIMEOUT_MS = 150_000;
const CAPSTONE_TIMEOUT_MS = 110_000;

const now = () => new Date();

export function readRoleRoadmap(db = getDb(), userId: string): RoleRoadmap | null {
  const doc = getDoc(db, userId, 'roadmap');
  const r = doc ? RoleRoadmapSchema.safeParse(doc.value) : null;
  return r?.success ? r.data : null;
}

function store(userId: string, roadmap: RoleRoadmap, event?: { type: 'roadmap_accepted'; payload: Record<string, unknown> }): void {
  const db = getDb();
  const at = now().toISOString();
  putDoc(db, userId, 'roadmap', roadmap, at);
  if (event) {
    // A new roadmap replaces the v2 schedule and any v2 draft.
    deleteDoc(db, userId, 'schedule');
    deleteDoc(db, userId, 'draft');
    insertEvents(db, userId, [{ id: randomUuid(), type: event.type, skill_id: null, item_id: roadmap.id, payload: event.payload, duration_s: 0, created_at: at }]);
  }
  persistDb();
}

/** Builds and saves the roadmap for the typed role: AI first, the catalogue for built-in roles when the AI cannot answer. */
export async function generateRoleRoadmap(userId: string, raw: unknown): Promise<LearnRoleRoadmapResult> {
  const parsed = RoleRoadmapRequestSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Type the role you want to prepare for.' };
  const req = parsed.data;
  const at = now();
  const id = randomUuid();
  let roadmap: RoleRoadmap | null = null;
  let notice: string | null = null;
  const ai = await callAiProxy('roadmap_plan', { format: 'tree', role: req.role, level: req.level, note: req.note }, 'AI roadmaps', { timeoutMs: TREE_TIMEOUT_MS });
  if (ai.ok) {
    roadmap = normaliseRoleRoadmap(ai.result, req, { id, now: at });
    if (!roadmap) notice = 'The AI answer could not be used.';
  } else {
    notice = ai.error;
  }
  if (!roadmap) {
    roadmap = catalogRoleRoadmap(req, learnCatalog(), { id, now: at });
    if (!roadmap) return { success: false, error: notice ?? 'The roadmap could not be built.', quota: ai.quota ?? null };
    notice = `Built from Nomadic's reviewed library because the AI could not answer (${notice ?? 'no answer'}).`;
  }
  try {
    store(userId, roadmap, { type: 'roadmap_accepted', payload: { role: roadmap.role, source: roadmap.source, version: 3, topics: roadmapTopics(roadmap).length } });
  } catch (err) {
    log(`[Learn] Roadmap not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your roadmap could not be saved on this device.' };
  }
  log(`[Learn] Roadmap built for "${roadmap.role}" (${roadmap.source}, ${roadmapTopics(roadmap).length} topics, ${roadmap.projects.length} projects).`);
  return { success: true, roadmap, notice, quota: ai.quota ?? null };
}

/** Saves the student's edits (removed or added topics, the capstone choice). */
export function saveRoleRoadmap(userId: string, raw: unknown): LearnRoleRoadmapResult {
  const r = RoleRoadmapSchema.safeParse(raw);
  if (!r.success) return { success: false, error: 'The roadmap could not be saved: it is not valid.' };
  const current = readRoleRoadmap(getDb(), userId);
  if (current && current.id !== r.data.id) return { success: false, error: 'This roadmap was replaced on another device. Reload Learn.' };
  try {
    store(userId, r.data);
    return { success: true, roadmap: r.data, notice: null };
  } catch (err) {
    log(`[Learn] Roadmap not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your roadmap could not be saved on this device.' };
  }
}

/** Builds the guided plan for one of the roadmap's projects and makes it the capstone. */
export async function generateCapstone(userId: string, projectId: string): Promise<LearnRoleRoadmapResult> {
  const roadmap = readRoleRoadmap(getDb(), userId);
  if (!roadmap) return { success: false, error: 'Build your roadmap first.' };
  const project = roadmap.projects.find((p) => p.id === projectId);
  if (!project) return { success: false, error: 'That project is not in your roadmap.' };
  if (roadmap.capstone?.project_id === projectId) return { success: true, roadmap, notice: null };
  const at = now();
  let capstone = null;
  let quota = null;
  if (project.source === 'curated') {
    const curated = learnCatalog().catalog.projects.find((p) => p.title === project.title);
    if (curated) capstone = catalogCapstone(curated, project.id, at);
  }
  if (!capstone) {
    const modules = roadmap.subjects.flatMap((s) => s.modules).filter((m) => project.uses.includes(m.id)).map((m) => m.title);
    const ai = await callAiProxy(
      'roadmap_plan',
      {
        format: 'capstone',
        role: roadmap.role,
        level: roadmap.level,
        project: { title: project.title, brief: project.brief, deliverable: project.deliverable, level: project.level, hours: project.hours },
        modules,
      },
      'AI roadmaps',
      { timeoutMs: CAPSTONE_TIMEOUT_MS }
    );
    if (!ai.ok) return { success: false, error: ai.error, quota: ai.quota ?? null };
    quota = ai.quota ?? null;
    capstone = normaliseCapstone(ai.result, project.id, at);
    if (!capstone) return { success: false, error: aiErrorMessage('failed', 'AI roadmaps'), quota };
  }
  const next: RoleRoadmap = { ...roadmap, capstone };
  try {
    store(userId, next);
  } catch (err) {
    log(`[Learn] Capstone not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your capstone could not be saved on this device.' };
  }
  return { success: true, roadmap: next, notice: null, quota };
}

const helpSchema = z.object({
  answer: z.string().min(1),
  next_steps: z.array(z.string()).default([]),
  code: z.string().nullable().default(null),
});

/** Asks Nomadic AI about one capstone step; the daily project-help quota is enforced by the proxy. */
export async function askCapstoneHelp(userId: string, req: LearnCapstoneHelpRequest): Promise<LearnProjectHelpResult> {
  const feature = 'project help';
  const roadmap = readRoleRoadmap(getDb(), userId);
  const cap = roadmap?.capstone;
  const project = roadmap?.projects.find((p) => p.id === cap?.project_id);
  const milestone = cap?.milestones.find((m) => m.steps.some((s) => s.id === req.stepId));
  const step = milestone?.steps.find((s) => s.id === req.stepId);
  if (!roadmap || !project || !milestone || !step) return { success: false, code: 'not_found', error: 'That step is not in your capstone.' };
  const payload: Record<string, unknown> = {
    project: project.title.slice(0, 200),
    stack: `Free tools for a ${roadmap.role}`.slice(0, 200),
    stage: milestone.title,
    goal: (project.deliverable || project.brief || project.title).slice(0, 500),
    step: `${step.title}: ${step.detail} Done when: ${step.done_when}`.slice(0, 1500),
    role: roadmap.role,
    question: req.question.trim(),
  };
  if (req.code?.trim()) payload.code = req.code.slice(0, 6000);
  const res = await callAiProxy('project_help', payload, feature);
  if (!res.ok) return { success: false, code: res.code, error: res.error, quota: res.quota ?? null };
  const parsed = helpSchema.safeParse(res.result);
  if (!parsed.success) return { success: false, code: 'failed', error: aiErrorMessage('failed', feature), quota: res.quota };
  return { success: true, answer: parsed.data.answer, nextSteps: parsed.data.next_steps, code: parsed.data.code, quota: res.quota };
}
