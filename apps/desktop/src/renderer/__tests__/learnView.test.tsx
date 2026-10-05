// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { IntakeSchema, addDays, entryKey, fitRoadmap, planRoadmapRules, type Roadmap, type Schedule } from '@job-automator/learning';
import './radixShims';
import { LearnView } from '../features/learn/LearnView';
import { learnIndex } from '../features/learn/catalog';
import { todayOf } from '../features/learn/learnModel';

afterEach(() => { cleanup(); delete (window as any).api; });

const today = todayOf(new Date());

/** A real roadmap and schedule from the seed catalogue, starting `startOffset` days from today. */
function plan(startOffset = 0, patch: Record<string, unknown> = {}): { roadmap: Roadmap; schedule: Schedule } {
  const start = addDays(today, startOffset);
  const intake = IntakeSchema.parse({
    role: 'frontend', aim: 'internship', start_date: start, end_date: addDays(start, 27), study_days: [0, 1, 2, 3, 4, 5, 6],
    weekday_minutes: 60, weekend_minutes: 120, streams: ['dsa', 'core_cs', 'dev', 'interview'], ...patch,
  });
  const r = planRoadmapRules(intake, learnIndex(), new Date(), { id: '00000000-0000-4000-8000-0000000000aa' });
  const fit = fitRoadmap(r, learnIndex(), { now: new Date() });
  return { roadmap: { ...fit.roadmap, accepted_at: new Date().toISOString() }, schedule: fit.schedule };
}

function mockApi(state: Partial<{ roadmap: Roadmap | null; schedule: Schedule | null; events: any[]; draft: any; projects: any[] }> = {}, over: Record<string, unknown> = {}) {
  const api = {
    learningGetState: vi.fn().mockResolvedValue({
      events: state.events ?? [], pendingSync: 0, roadmap: state.roadmap ?? null, schedule: state.schedule ?? null,
      projects: state.projects ?? [], notes: [], draft: state.draft ?? null,
    }),
    learningRecordEvents: vi.fn(async (events: any[]) => ({ success: true, events: events.map((e) => ({ ...e, user_id: 'u1' })) })),
    learningSync: vi.fn().mockResolvedValue({ success: false, pushed: 0, pulled: 0, rejected: 0 }),
    learnRoadmapGenerate: vi.fn(async (intake: any) => {
      const r = planRoadmapRules(IntakeSchema.parse(intake), learnIndex(), new Date());
      const fit = fitRoadmap(r, learnIndex());
      return { success: true, draft: { roadmap: fit.roadmap, schedule: fit.schedule, notice: 'Built with the standard planner: Sign in to use AI roadmaps.', created_at: 'x' } };
    }),
    learnRoadmapAccept: vi.fn(async (roadmap: Roadmap, schedule: Schedule) => ({ success: true, roadmap: { ...roadmap, accepted_at: 'now' }, schedule })),
    learnRoadmapAdjust: vi.fn().mockResolvedValue({ success: false, error: 'Sign in to use AI roadmap changes.' }),
    learnScheduleSave: vi.fn().mockResolvedValue({ success: true }),
    learnProjectSave: vi.fn(async (p: any) => ({ success: true, projects: [p] })),
    learnProblemNoteSave: vi.fn(async (n: any) => ({ success: true, notes: [n] })),
    learnProjectCheckRepo: vi.fn().mockResolvedValue({ success: false, error: 'offline' }),
    practiceGetCatalog: vi.fn().mockResolvedValue({ success: true, catalog: { version: 'x', entries: [], companies: [{ name: 'Amazon', problemCount: 10 }] } }),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderLearn = (tier = 'free', onOpenUpgrade = vi.fn()) =>
  render(<UIProvider><LearnView currentUser={{ tier }} suggestedRole="frontend" onOpenUpgrade={onOpenUpgrade} /></UIProvider>);

/** Lands on the path, then switches to Today. */
async function openToday() {
  await screen.findByRole('tab', { name: /today/i });
  await userEvent.click(screen.getByRole('tab', { name: /today/i }));
  return screen.findByText(/week 1 · day \d+ ·/i);
}

/** Clicks Continue until the last intake page. */
async function walkIntake() {
  for (let i = 0; i < 12; i++) {
    const next = screen.queryByRole('button', { name: /^continue$/i });
    if (!next) break;
    await userEvent.click(next);
  }
}

describe('LearnView (Learn v2)', () => {
  it('takes a new user page by page through the intake and review to the week-by-week path', async () => {
    const api = mockApi();
    renderLearn();
    expect(await screen.findByRole('heading', { name: /which role are you preparing for/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /frontend engineer/i }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByRole('heading', { name: /what are you preparing for/i })).toBeTruthy();
    await walkIntake();
    expect(await screen.findByRole('heading', { name: /your plan at a glance/i })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/h of study time/);
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }));
    await waitFor(() => expect(api.learnRoadmapGenerate).toHaveBeenCalledTimes(1));
    expect(api.learnRoadmapGenerate.mock.calls[0][0]).toMatchObject({ role: 'frontend', weekday_minutes: 60, weekend_minutes: 150 });

    expect(await screen.findByRole('heading', { name: /review your roadmap/i })).toBeTruthy();
    expect(screen.getByText(/built with the standard planner/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /week by week \(\d+ weeks\)/i })).toBeTruthy();
    expect(screen.getAllByText(/^week 1$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /modules \(\d+\)/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /accept roadmap/i }));
    await waitFor(() => expect(api.learnRoadmapAccept).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('list', { name: /week 1 days/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^week 1, day 1:/i }).length).toBe(1);
  });

  it('keeps the intake on a page until its question is answered', async () => {
    mockApi();
    renderLearn();
    await screen.findByRole('heading', { name: /which role are you preparing for/i });
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByRole('heading', { name: /when can you study/i })).toBeTruthy();
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await userEvent.click(screen.getByRole('button', { name: day }));
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByText('Pick at least one study day.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /when can you study/i })).toBeTruthy();
  });

  it('lets the student remove a module on review and re-fits the plan', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ draft: { roadmap: { ...roadmap, accepted_at: null }, schedule, notice: null, created_at: 'x' } });
    renderLearn();
    const heading = await screen.findByRole('heading', { name: /modules \((\d+)\)/i });
    const before = Number(/\((\d+)\)/.exec(heading.textContent ?? '')![1]);
    await userEvent.click(within(screen.getByRole('region', { name: /modules/i })).getAllByRole('button', { name: /^remove /i }).at(-1)!);
    expect(screen.getByRole('heading', { name: /modules \(\d+\)/i }).textContent).toContain(`(${before - 1})`);
    await userEvent.click(screen.getByRole('button', { name: /accept roadmap/i }));
    await waitFor(() => expect(api.learnRoadmapAccept).toHaveBeenCalledTimes(1));
    expect(api.learnRoadmapAccept.mock.calls[0][0].modules).toHaveLength(before - 1);
  });

  it('opens a day from the path and shows exactly what to learn', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ roadmap, schedule });
    renderLearn();
    const node = (await screen.findAllByRole('button', { name: /^week 1, day 2:/i }))[0];
    await userEvent.click(node);
    const details = await screen.findByRole('region', { name: /day 2 details/i });
    await userEvent.click(within(details).getByRole('button', { name: /preview|start|continue/i }));
    expect(await screen.findByRole('button', { name: /back to path/i })).toBeTruthy();
    expect(screen.getByText(/week 1 · day 2 ·/i)).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: /^tick /i }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /back to path/i }));
    expect(await screen.findByRole('list', { name: /week 1 days/i })).toBeTruthy();
  });

  it('shows today\'s tasks with their learn lists and records a tick with planned minutes, then an untick', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await openToday();
    const first = schedule.days[0].tasks[0];
    const boxes = screen.getAllByRole('checkbox', { name: /^tick /i });
    expect(boxes.length).toBe(schedule.days[0].tasks.length);
    expect(screen.getAllByText(/what to learn/i).length).toBeGreaterThan(0);
    await userEvent.click(boxes[0]);
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(1));
    expect(api.learningRecordEvents.mock.calls[0][0][0]).toMatchObject({
      type: 'task_done', item_id: entryKey(first), payload: expect.objectContaining({ planned_minutes: first.minutes }),
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: /^untick /i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(2));
    expect(api.learningRecordEvents.mock.calls[1][0][0].payload).toMatchObject({ undone: true });
  });

  it('moves missed work forward with Re-plan', async () => {
    const { roadmap, schedule } = plan(-3);
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await screen.findByRole('tab', { name: /today/i });
    await userEvent.click(screen.getByRole('tab', { name: /today/i }));
    expect(await screen.findByText(/from earlier days not done/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^re-plan$/i }));
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
    const saved: Schedule = api.learnScheduleSave.mock.calls[0][0];
    expect(saved.days.filter((d) => d.date < today).every((d) => d.tasks.length === 0)).toBe(true);
    expect(await screen.findByText(/tasks moved/i)).toBeTruthy();
  });

  it('"Can\'t study today" empties today and re-plans', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await openToday();
    await userEvent.click(await screen.findByRole('button', { name: /can't study today/i }));
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
    const saved: Schedule = api.learnScheduleSave.mock.calls[0][0];
    expect(saved.days.find((d) => d.date === today)).toMatchObject({ capacity: 0, tasks: [] });
  });

  it('opens a lesson from Today, shows no resources, and marks it learned with "I already know this"', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await openToday();
    await userEvent.click(screen.getAllByRole('button', { name: /^open lesson$/i })[0]);
    expect(await screen.findByRole('heading', { name: /what to learn/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /resources/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /i already know this/i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalled());
    const ev = api.learningRecordEvents.mock.calls[0][0][0];
    expect(ev).toMatchObject({ type: 'task_done', payload: expect.objectContaining({ source: 'placement' }) });
    expect(ev.item_id).toMatch(/\/learn$/);
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(await screen.findByText(/week 1 · day \d+ ·/i)).toBeTruthy();
  });

  it('opens a problem in the browser from a solve task', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await openToday();
    const solve = screen.queryAllByRole('button', { name: /^solve$/i });
    if (solve.length) {
      await userEvent.click(solve[0]);
      expect(api.openExternalUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/leetcode\.com\/problems\//));
    }
  });

  it('moves a task to another day from a day page', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click((await screen.findAllByRole('button', { name: /^week 1, day 2:/i }))[0]);
    await userEvent.click(within(await screen.findByRole('region', { name: /day 2 details/i })).getByRole('button'));
    await screen.findByRole('button', { name: /back to path/i });
    const moveSelects = screen.getAllByRole('combobox', { name: /^move /i });
    expect(moveSelects.length).toBeGreaterThan(0);
    await userEvent.click(moveSelects[0]);
    const options = await screen.findAllByRole('option');
    await userEvent.click(options[0]);
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
  });

  it('shows the free daily limit on a topic quiz and offers an upgrade', async () => {
    const { roadmap, schedule } = plan();
    const used = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, user_id: 'u1', type: 'quiz_passed', skill_id: 'oop',
      item_id: `x-${i}`, payload: {}, duration_s: 0, created_at: new Date().toISOString(),
    }));
    mockApi({ roadmap, schedule, events: used });
    renderLearn();
    await openToday();
    await userEvent.click(screen.getAllByRole('button', { name: /^open lesson$/i })[0]);
    await screen.findByRole('heading', { name: /what to learn/i });
    if (screen.queryByRole('heading', { name: /^quiz$/i }) && !screen.queryByText(/no quiz for this topic yet/i)) {
      expect(await screen.findByText(/daily practice limit reached/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /^upgrade$/i })).toBeTruthy();
    }
  });

  it('shows an error with a working retry when progress cannot be loaded', async () => {
    const api = mockApi();
    api.learningGetState.mockRejectedValueOnce(new Error('Database is locked.'));
    renderLearn();
    expect(await screen.findByText('Database is locked.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: /which role are you preparing for/i })).toBeTruthy();
  });

  it('opens on the review screen when a draft is waiting', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ draft: { roadmap: { ...roadmap, accepted_at: null }, schedule, notice: null, created_at: 'x' } });
    renderLearn();
    expect(await screen.findByRole('heading', { name: /review your roadmap/i })).toBeTruthy();
  });

  it('is usable from the keyboard: tick the first task with the space bar', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await openToday();
    const box = screen.getAllByRole('checkbox', { name: /^tick /i })[0];
    box.focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(1));
  });
});
