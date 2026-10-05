import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

const h = vi.hoisted(() => ({
  db: null as unknown as Database,
  ai: null as unknown as import('vitest').Mock<(...args: unknown[]) => Promise<unknown>>,
  plan: 'free' as 'free' | 'pro' | 'max',
}));

vi.mock('../db', () => ({ getDb: () => h.db, persistDb: () => {} }));
vi.mock('../services/app-context', () => ({ log: () => {}, errorMessage: (e: unknown) => String(e) }));
vi.mock('../services/ai-proxy', () => ({ callAiProxy: (...a: unknown[]) => h.ai(...a), aiErrorMessage: (code: string) => `error ${code}` }));
vi.mock('../services/entitlements', () => ({
  getEntitlements: async () => ({ success: true, entitlements: { plan: h.plan, accountStatus: 'active' } }),
}));

import { IntakeSchema, RoadmapSchema, ScheduleSchema, expandRoadmap } from '@job-automator/learning';
import { migrateLearnV2Schema, migrateLearningSchema, getDoc, listEvents } from '../services/learning-store';
import {
  AI_CATALOG_MAX_CHARS,
  acceptRoadmap,
  askProjectHelp,
  buildAiCatalog,
  generateRoadmap,
  learnCatalog,
  projectFor,
  proposeChange,
  readDraft,
  readProjects,
  saveProblemNote,
  saveProject,
  saveSchedule,
} from '../services/learn-v2';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const U = 'u1';
const intake = (patch: Record<string, unknown> = {}) =>
  IntakeSchema.parse({
    role: 'fullstack',
    aim: 'campus',
    start_date: '2026-10-05',
    end_date: '2026-12-27',
    study_days: [0, 1, 2, 3, 4, 5, 6],
    weekday_minutes: 60,
    weekend_minutes: 150,
    streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
    ...patch,
  });

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  h.db = new SQL.Database();
  migrateLearningSchema(h.db);
  migrateLearnV2Schema(h.db);
  h.plan = 'free';
  h.ai = vi.fn(async () => ({ ok: false, code: 'not_signed_in', error: 'Sign in to use AI roadmaps.' }));
});

describe('AI catalogue', () => {
  it.each(['frontend', 'backend', 'fullstack', 'devops', 'data-ml', 'data-analyst', 'product-manager', 'design'])('stays under 64 KB for %s', (role) => {
    const c = buildAiCatalog(intake({ role }));
    expect(c.text.length).toBeLessThanOrEqual(AI_CATALOG_MAX_CHARS);
    expect(c.module_ids.length).toBeGreaterThan(0);
    expect(c.module_ids.length).toBeLessThanOrEqual(200);
  });
  it('lists modules with hours and topics, and only the chosen language', () => {
    const c = buildAiCatalog(intake({ language: 'java' }));
    expect(c.text).toMatch(/M\|dsa\.arrays\|Arrays\|dsa\|L1\|h [\d.]+\/[\d.]+\/[\d.]+/);
    expect(c.text).toContain('  T|dsa.arrays.prefix-sums|');
    expect(c.module_ids).toContain('lang.java');
    expect(c.module_ids).not.toContain('lang.cpp');
    expect(c.text).not.toMatch(/https?:\/\//);
  });
  it('leaves aptitude out for off-campus aims', () => {
    expect(buildAiCatalog(intake({ aim: 'offcampus' })).module_ids.some((m) => m.startsWith('apt.'))).toBe(false);
  });
});

describe('generate', () => {
  it('falls back to the rules planner with a notice when AI is unavailable', async () => {
    const res = await generateRoadmap(U, intake());
    expect(res.success).toBe(true);
    expect(res.draft!.roadmap.source).toBe('rules');
    expect(res.draft!.notice).toMatch(/standard planner: Sign in/);
    expect(RoadmapSchema.safeParse(res.draft!.roadmap).success).toBe(true);
    expect(ScheduleSchema.safeParse(res.draft!.schedule).success).toBe(true);
    expect(readDraft(h.db, U)?.roadmap.id).toBe(res.draft!.roadmap.id);
  });

  it('uses a valid AI answer, normalised against the catalogue', async () => {
    h.ai = vi.fn(async () => ({
      ok: true,
      quota: { plan: 'free', limit: 2, used: 1, remaining: 1, resetsAt: null },
      result: {
        summary: 'Focus on arrays first.',
        streams: [{ stream: 'dsa', percent: 70 }, { stream: 'dev', percent: 30 }],
        modules: [{ module_id: 'dsa.graphs', emphasis: 'standard', skip_topics: [], why: 'Graphs are common.' }, { module_id: 'dev.react', emphasis: 'light', why: 'UI work.' }],
        custom_modules: [],
        projects: [{ project_id: 'fe-placement-tracker-ui', after_module: 'dev.react', why: 'Portfolio.' }],
        warnings: [],
      },
    }));
    const res = await generateRoadmap(U, intake());
    const r = res.draft!.roadmap;
    expect(r.source).toBe('ai');
    expect(res.draft!.notice).toBeNull();
    // Hard prerequisites came along at light emphasis.
    expect(r.modules.map((m) => m.module_id)).toEqual(expect.arrayContaining(['dsa.trees', 'dsa.recursion', 'dev.javascript', 'dsa.graphs']));
    expect(r.modules.find((m) => m.module_id === 'dev.javascript')!.added_for).toBeTruthy();
    // The free plan gets beginner projects only, so the intermediate pick was dropped.
    expect(r.projects).toEqual([]);
    const call = h.ai.mock.calls[0];
    expect(call[0]).toBe('roadmap_plan');
    expect((call[1] as { intake: { companies: string[] } }).intake.companies).toEqual([]);
  });

  it('pro plans keep intermediate projects and get company boosts', async () => {
    h.plan = 'pro';
    const res = await generateRoadmap(U, intake({ companies: ['Amazon'] }));
    expect(res.draft!.roadmap.boosts.length).toBeGreaterThan(0);
    const boosted = res.draft!.roadmap.boosts.flatMap((b) => b.problems.map((p) => p.paid_only));
    expect(boosted.every((p) => p !== true)).toBe(true);
  });

  it('rejects an invalid intake', async () => {
    expect((await generateRoadmap(U, { ...intake(), end_date: '2026-01-01' })).success).toBe(false);
  });
});

describe('accept, saves and limits', () => {
  const draft = async () => (await generateRoadmap(U, intake())).draft!;

  it('accepting stores roadmap and schedule, clears the draft and records roadmap_accepted', async () => {
    const d = await draft();
    const res = acceptRoadmap(U, d.roadmap, d.schedule);
    expect(res.success).toBe(true);
    expect(res.roadmap!.accepted_at).toBeTruthy();
    expect(getDoc(h.db, U, 'roadmap')).not.toBeNull();
    expect(getDoc(h.db, U, 'draft')).toBeNull();
    expect(listEvents(h.db, U).map((e) => e.type)).toContain('roadmap_accepted');
  });

  it('refuses a roadmap with a module that is not in the catalogue', async () => {
    const d = await draft();
    const bad = { ...d.roadmap, modules: [...d.roadmap.modules, { ...d.roadmap.modules[0], module_id: 'made.up' }] };
    expect(acceptRoadmap(U, bad, d.schedule)).toMatchObject({ success: false });
  });

  it('refuses a schedule for another roadmap', async () => {
    const d = await draft();
    expect(acceptRoadmap(U, d.roadmap, { ...d.schedule, roadmap_id: '00000000-0000-4000-8000-000000000009' }).success).toBe(false);
  });

  it('saves a schedule only for the accepted roadmap', async () => {
    const d = await draft();
    expect(saveSchedule(U, d.schedule).success).toBe(false);
    acceptRoadmap(U, d.roadmap, d.schedule);
    expect(saveSchedule(U, { ...d.schedule, pace_factor: 1.4 }).success).toBe(true);
  });

  const started = (id: string) => ({
    project_id: id, status: 'active', repo_url: null, started_at: '2026-10-05T00:00:00Z', finished_at: null,
    stage_started_at: {}, steps_done: [], criteria_done: [], hints_shown: {}, stages_done: [], resume_inputs: {}, updated_at: '2026-10-05T00:00:00Z',
  });

  it('free plan: beginner projects only, one at a time', async () => {
    expect((await saveProject(U, started('fe-placement-tracker-ui'))).limited).toBe(true);
    expect((await saveProject(U, started('fe-portfolio-site'))).success).toBe(true);
    expect((await saveProject(U, started('be-notes-api'))).limited).toBe(true);
    expect(listEvents(h.db, U).filter((e) => e.type === 'project_started')).toHaveLength(1);
  });

  it('pro plan: three active projects of any level', async () => {
    h.plan = 'pro';
    for (const id of ['fe-placement-tracker-ui', 'be-placement-api', 'fs-campus-events']) expect((await saveProject(U, started(id))).success).toBe(true);
    expect((await saveProject(U, started('be-url-shortener'))).limited).toBe(true);
  });

  it('finishing a project records project_done with its skills', async () => {
    await saveProject(U, started('fe-portfolio-site'));
    await saveProject(U, { ...started('fe-portfolio-site'), status: 'done', finished_at: '2026-11-01T00:00:00Z' });
    const done = listEvents(h.db, U).find((e) => e.type === 'project_done')!;
    expect(done.payload.skill_ids).toEqual(expect.arrayContaining(['html', 'css']));
    expect(readProjects(h.db, U)[0].status).toBe('done');
  });

  it('refuses unknown projects', async () => {
    expect((await saveProject(U, started('ghost-project'))).success).toBe(false);
  });

  it('saves and removes problem notes', () => {
    expect(saveProblemNote(U, { ref: 'lc:two-sum', note: 'map', resolve_later: false, updated_at: '2026-10-05T00:00:00Z' }).notes).toHaveLength(1);
    expect(saveProblemNote(U, { ref: 'lc:two-sum', note: '  ', resolve_later: false, updated_at: '2026-10-05T00:00:00Z' }).notes).toHaveLength(0);
  });

  it('a proposed change re-plans from today without saving', async () => {
    const d = await draft();
    acceptRoadmap(U, d.roadmap, d.schedule);
    const diff = { summary_of_change: 'Exams', warnings: [], add: [], remove: [], emphasis: [], streams: null, blackouts_add: ['2026-11-10', '2026-11-11'], weekday_minutes: null, weekend_minutes: null, end_date: null, project_add: [], project_remove: [], order: null };
    const res = proposeChange(d.roadmap, d.schedule, diff, '2026-10-20', []);
    expect(res.success).toBe(true);
    const days = res.proposal!.schedule.days.filter((x) => x.date === '2026-11-10' || x.date === '2026-11-11');
    expect(days.every((x) => x.capacity === 0 && x.tasks.length === 0)).toBe(true);
    expect(getDoc(h.db, U, 'roadmap')!.value).toMatchObject({ intake: { blackouts: [] } });
    expect(expandRoadmap(res.proposal!.roadmap, learnCatalog()).length).toBeGreaterThan(0);
  });
});

describe('generated projects and project help', () => {
  const id = 'g.expense-tracker.react.b';

  it('resolves generated projects for saves, and still refuses unknown ids', async () => {
    expect(projectFor(id)?.title).toBe('Expense tracker (React)');
    expect(projectFor('g.nope.react.b')).toBeNull();
    const now = new Date().toISOString();
    const res = await saveProject(U, { project_id: id, status: 'active', started_at: now, updated_at: now });
    expect(res.success).toBe(true);
    expect(readProjects(h.db, U).map((p) => p.project_id)).toEqual([id]);
  });

  it('asks the AI proxy with the stage and step as context and returns the answer', async () => {
    h.ai = vi.fn(async () => ({ ok: true, result: { answer: 'Use useState.', next_steps: ['Add state'], code: null }, quota: { plan: 'free', limit: 5, used: 1, remaining: 4, resetsAt: 'x' } }));
    const res = await askProjectHelp({ projectId: id, stageId: 'model', stepIndex: 2, question: 'How do I render the list?' });
    expect(res).toMatchObject({ success: true, answer: 'Use useState.', nextSteps: ['Add state'], code: null });
    const [kind, payload] = h.ai.mock.calls[0] as [string, Record<string, string>];
    expect(kind).toBe('project_help');
    expect(payload).toMatchObject({ project: 'Expense tracker (React)', stage: 'Model the expense and show a list', question: 'How do I render the list?' });
    expect(payload.step).toMatch(/^Render the list: /);
    expect(payload).not.toHaveProperty('code');
  });

  it('passes quota refusals through with the reset time', async () => {
    h.ai = vi.fn(async () => ({ ok: false, code: 'quota_exceeded', error: 'limit', quota: { resetsAt: '2026-10-05T18:30:00Z' } }));
    const res = await askProjectHelp({ projectId: id, stageId: 'model', question: 'Help please' });
    expect(res).toMatchObject({ success: false, code: 'quota_exceeded', quota: { resetsAt: '2026-10-05T18:30:00Z' } });
  });

  it('refuses unknown stages and malformed AI replies', async () => {
    expect(await askProjectHelp({ projectId: id, stageId: 'nope', question: 'Help please' })).toMatchObject({ success: false, code: 'not_found' });
    h.ai = vi.fn(async () => ({ ok: true, result: { nothing: true }, quota: null }));
    expect(await askProjectHelp({ projectId: id, stageId: 'model', question: 'Help please' })).toMatchObject({ success: false, code: 'failed' });
  });
});
