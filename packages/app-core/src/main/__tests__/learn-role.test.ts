import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

const h = vi.hoisted(() => ({
  db: null as unknown as Database,
  ai: null as unknown as import('vitest').Mock<(...args: unknown[]) => Promise<unknown>>,
}));

vi.mock('../db', () => ({ getDb: () => h.db, persistDb: () => {} }));
vi.mock('../services/app-context', () => ({ log: () => {}, errorMessage: (e: unknown) => String(e) }));
vi.mock('../services/ai-proxy', () => ({ callAiProxy: (...a: unknown[]) => h.ai(...a), aiErrorMessage: (code: string) => `error ${code}` }));
vi.mock('../services/entitlements', () => ({ getEntitlements: async () => ({ success: true, entitlements: { plan: 'free', accountStatus: 'active' } }) }));

import { RoleRoadmapSchema, setTopicRemoved } from '@job-automator/learning';
import { getDoc, listEvents, migrateLearnV2Schema, migrateLearningSchema, putDoc } from '../services/learning-store';
import { askCapstoneHelp, generateCapstone, generateRoleRoadmap, readRoleRoadmap, saveRoleRoadmap } from '../services/learn-role';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const U = 'u1';
const QUOTA = { used: 1, limit: 2, remaining: 1 };
const TREE = {
  summary: 'What a quant trader needs.',
  subjects: [
    { title: 'Mathematics', why: 'Pricing is probability.', modules: [{ title: 'Probability', summary: '', topics: [{ title: 'Basic probability', covers: 'Counting', search: 'basic probability' }, { title: 'Bayes theorem', covers: '', search: 'bayes' }] }] },
    { title: 'Programming', why: '', modules: [{ title: 'Python', summary: '', topics: [{ title: 'NumPy', covers: '', search: 'numpy' }] }] },
  ],
  projects: [{ title: 'Backtest a strategy', brief: 'Test a crossover', deliverable: 'A notebook', level: 'starter', hours: 12, uses: ['Python', 'Probability'] }],
};

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  h.db = new SQL.Database();
  migrateLearningSchema(h.db);
  migrateLearnV2Schema(h.db);
  h.ai = vi.fn(async () => ({ ok: false, code: 'not_signed_in', error: 'Sign in to use AI roadmaps.' }));
});

describe('generateRoleRoadmap', () => {
  it('asks the AI for the whole tree of any role with a long time limit, then saves it', async () => {
    h.ai.mockResolvedValueOnce({ ok: true, result: TREE, quota: QUOTA });
    const res = await generateRoleRoadmap(U, { role: 'Quant trader', level: 'beginner', note: 'I know Python' });
    expect(res.success).toBe(true);
    expect(h.ai).toHaveBeenCalledWith('roadmap_plan', { format: 'tree', role: 'Quant trader', level: 'beginner', note: 'I know Python' }, 'AI roadmaps', { timeoutMs: expect.any(Number) });
    expect((h.ai.mock.calls[0][3] as { timeoutMs: number }).timeoutMs).toBeGreaterThan(120_000);
    expect(res.roadmap).toMatchObject({ role: 'Quant trader', source: 'ai', version: 3 });
    expect(res.quota).toEqual(QUOTA);
    expect(RoleRoadmapSchema.parse(getDoc(h.db, U, 'roadmap')!.value).role).toBe('Quant trader');
    expect(readRoleRoadmap(h.db, U)?.projects[0].uses).toEqual(['python', 'probability']);
    expect(listEvents(h.db, U).some((e) => e.type === 'roadmap_accepted' && e.payload.version === 3)).toBe(true);
  });

  it('falls back to the reviewed library for built-in roles when the AI cannot answer', async () => {
    const res = await generateRoleRoadmap(U, { role: 'Frontend developer', level: 'beginner', note: '' });
    expect(res.success).toBe(true);
    expect(res.roadmap?.source).toBe('catalog');
    expect(res.notice).toMatch(/reviewed library/);
  });

  it('explains the failure for other roles and saves nothing', async () => {
    const res = await generateRoleRoadmap(U, { role: 'Quant trader', level: 'beginner', note: '' });
    expect(res).toMatchObject({ success: false, error: 'Sign in to use AI roadmaps.' });
    expect(getDoc(h.db, U, 'roadmap')).toBeNull();
  });

  it('rejects a role that is too short', async () => {
    expect((await generateRoleRoadmap(U, { role: 'x', level: 'beginner', note: '' })).success).toBe(false);
    expect(h.ai).not.toHaveBeenCalled();
  });
});

describe('edits and the capstone', () => {
  async function built() {
    h.ai.mockResolvedValueOnce({ ok: true, result: TREE, quota: QUOTA });
    return (await generateRoleRoadmap(U, { role: 'Quant trader', level: 'beginner', note: '' })).roadmap!;
  }

  it('saves edits to the same roadmap and refuses a replaced one', async () => {
    const r = await built();
    const edited = setTopicRemoved(r, 'probability', 'bayes-theorem', true);
    expect(saveRoleRoadmap(U, edited).success).toBe(true);
    expect(readRoleRoadmap(h.db, U)?.subjects[0].modules[0].topics[1].removed).toBe(true);
    expect(saveRoleRoadmap(U, { ...edited, id: '00000000-0000-4000-8000-0000000000ff' }).success).toBe(false);
    expect(saveRoleRoadmap(U, { nope: true }).success).toBe(false);
  });

  it('builds a capstone plan for a project of the roadmap and saves it', async () => {
    const r = await built();
    h.ai.mockResolvedValueOnce({ ok: true, quota: QUOTA, result: { milestones: [{ title: 'Get the data', steps: [{ title: 'Download prices', detail: 'Use a free source', done_when: 'You have a table', search: 'download prices python' }] }] } });
    const res = await generateCapstone(U, r.projects[0].id);
    expect(res.success).toBe(true);
    expect(h.ai.mock.calls[1][1]).toMatchObject({ format: 'capstone', role: 'Quant trader', project: { title: 'Backtest a strategy' }, modules: ['Probability', 'Python'] });
    expect(readRoleRoadmap(h.db, U)?.capstone?.milestones[0].steps[0]).toMatchObject({ id: 'download-prices', done_when: 'You have a table' });
    expect((await generateCapstone(U, 'missing')).success).toBe(false);
  });

  it('asks for help on a capstone step with the role, so the mentor fits any field', async () => {
    const r = await built();
    h.ai.mockResolvedValueOnce({ ok: true, quota: QUOTA, result: { milestones: [{ title: 'Get the data', steps: [{ title: 'Download prices', detail: '', done_when: 'x', search: 'y' }] }] } });
    await generateCapstone(U, r.projects[0].id);
    h.ai.mockResolvedValueOnce({ ok: true, quota: QUOTA, result: { answer: 'Try this.', next_steps: ['a'], code: null } });
    const res = await askCapstoneHelp(U, { stepId: 'download-prices', question: 'Where do I get data?' });
    expect(res).toMatchObject({ success: true, answer: 'Try this.', nextSteps: ['a'] });
    expect(h.ai.mock.calls[2][0]).toBe('project_help');
    expect(h.ai.mock.calls[2][1]).toMatchObject({ role: 'Quant trader', project: 'Backtest a strategy', stage: 'Get the data' });
    expect((await askCapstoneHelp(U, { stepId: 'nope', question: 'Where?' })).success).toBe(false);
  });

  it('does not read a v2 roadmap document as a role roadmap', () => {
    putDoc(h.db, U, 'roadmap', { id: 'x', version: 2 }, new Date().toISOString());
    expect(readRoleRoadmap(h.db, U)).toBeNull();
  });
});
