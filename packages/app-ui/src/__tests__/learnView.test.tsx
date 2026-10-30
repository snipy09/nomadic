// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { IntakeSchema, addDays, entryKey, expandRoadmap, fitRoadmap, formatDay, planRoadmapRules, type Roadmap, type Schedule } from '@job-automator/learning';
import './radixShims';
import { LearnView } from '../features/learn/LearnView';
import { learnIndex } from '../features/learn/catalog';
import { todayOf } from '../features/learn/learnModel';

afterEach(() => { cleanup(); delete (window as any).api; localStorage.clear(); });

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

const renderLearn = (tier = 'free', onOpenUpgrade = vi.fn(), initialTab: string | null = null) =>
  render(<UIProvider><LearnView currentUser={{ tier }} suggestedRole="frontend" onOpenUpgrade={onOpenUpgrade} initialTab={initialTab} /></UIProvider>);

/** Clicks Continue until the last intake page. */
async function walkIntake() {
  for (let i = 0; i < 12; i++) {
    const next = screen.queryByRole('button', { name: /^continue$/i });
    if (!next) break;
    await userEvent.click(next);
  }
}

/** Opens the lesson from "Next up" and walks to the first screen after the points (the lesson is ticked there). */
async function studyFirstLesson() {
  await userEvent.click(await screen.findByRole('button', { name: /^start lesson$/i }));
  const player = await screen.findByRole('region', { name: /^lesson: /i });
  await userEvent.click(within(player).getByRole('button', { name: /^(start|mark as learned)$/i }));
  for (let i = 0; i < 6 && within(player).queryByRole('button', { name: /^got it$/i }); i++) {
    await userEvent.click(within(player).getByRole('button', { name: /^got it$/i }));
  }
  return player;
}

/** The first future date with a solve task of a topic, and that entry. */
function futureSolve(schedule: Schedule, roadmap: Roadmap) {
  const tasks = new Map(expandRoadmap(roadmap, learnIndex()).map((t) => [t.id, t]));
  for (const d of schedule.days) {
    if (d.date <= today) continue;
    const e = d.tasks.find((x) => tasks.get(x.task_id)?.kind === 'solve' && tasks.get(x.task_id)?.topic_id);
    if (e) return { date: d.date, entry: e };
  }
  return null;
}

describe('LearnView', () => {
  it('takes a new user through six questions and the review to Today', async () => {
    const api = mockApi();
    renderLearn();
    expect(await screen.findByRole('heading', { name: /which role are you preparing for/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /frontend engineer/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/step 1 of 7/i)).toBeTruthy();
    await walkIntake();
    expect(await screen.findByRole('heading', { name: /your plan at a glance/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /what should the plan cover/i })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/h of study time/);
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }));
    await waitFor(() => expect(api.learnRoadmapGenerate).toHaveBeenCalledTimes(1));
    expect(api.learnRoadmapGenerate.mock.calls[0][0]).toMatchObject({ role: 'frontend', weekday_minutes: 60, weekend_minutes: 150 });

    expect(await screen.findByRole('heading', { name: /your plan is ready/i })).toBeTruthy();
    expect(screen.getByText(/built with the standard planner/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /your first week/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /modules \(\d+\)/i })).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: /start my plan/i })[0]);
    await waitFor(() => expect(api.learnRoadmapAccept).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/^next up$/i)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /today/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the intake on a page until its question is answered', async () => {
    mockApi();
    renderLearn();
    await screen.findByRole('heading', { name: /which role are you preparing for/i });
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByRole('heading', { name: /when can you study/i })).toBeTruthy();
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await userEvent.click(screen.getByRole('button', { name: day }));
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByText('Pick at least one study day.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /when can you study/i })).toBeTruthy();
  });

  it('opens optional intake pages from the summary and comes back to it', async () => {
    mockApi();
    renderLearn();
    await screen.findByRole('heading', { name: /which role are you preparing for/i });
    await walkIntake();
    await userEvent.click(await screen.findByRole('button', { name: /change covers/i }));
    expect(await screen.findByRole('heading', { name: /what should the plan cover/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(await screen.findByRole('heading', { name: /your plan at a glance/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /change duration/i }));
    expect(await screen.findByRole('heading', { name: /how long do you have/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(await screen.findByRole('heading', { name: /your plan at a glance/i })).toBeTruthy();
  });

  it('lets the student remove a module under "See everything" and re-fits the plan', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ draft: { roadmap: { ...roadmap, accepted_at: null }, schedule, notice: null, created_at: 'x' } });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /see everything/i }));
    const heading = await screen.findByRole('heading', { name: /modules \((\d+)\)/i });
    const before = Number(/\((\d+)\)/.exec(heading.textContent ?? '')![1]);
    await userEvent.click(within(screen.getByRole('region', { name: /modules/i })).getAllByRole('button', { name: /^remove /i }).at(-1)!);
    expect(screen.getByRole('heading', { name: /modules \(\d+\)/i }).textContent).toContain(`(${before - 1})`);
    await userEvent.click(screen.getAllByRole('button', { name: /start my plan/i })[0]);
    await waitFor(() => expect(api.learnRoadmapAccept).toHaveBeenCalledTimes(1));
    expect(api.learnRoadmapAccept.mock.calls[0][0].modules).toHaveLength(before - 1);
  });

  it('starts today\'s lesson in one click and ticks it with planned minutes after the last points screen', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    expect(await screen.findByText(/^next up$/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /today's session/i })).toBeTruthy();
    const player = await studyFirstLesson();
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalled());
    const ev = api.learningRecordEvents.mock.calls[0][0][0];
    expect(ev).toMatchObject({ type: 'task_done', payload: expect.objectContaining({ task_kind: expect.stringMatching(/learn|read/) }) });
    const entry = schedule.days[0].tasks.find((e) => e.task_id === ev.item_id.replace(/@\d+$/, ''))!;
    expect(ev.item_id).toBe(entryKey(entry));
    expect(ev.payload.planned_minutes).toBe(entry.minutes);
    expect(within(player).queryByRole('button', { name: /^got it$/i })).toBeNull();
  });

  it('opens a lesson\'s points on YouTube and in ChatGPT', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /^start lesson$/i }));
    const player = await screen.findByRole('region', { name: /^lesson: /i });
    await userEvent.click(within(player).getByRole('button', { name: /^start$/i }));
    await userEvent.click(within(player).getByRole('button', { name: /^youtube$/i }));
    expect(api.openExternalUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/www\.youtube\.com\/results\?search_query=/));
    await userEvent.click(within(player).getByRole('button', { name: /^chatgpt$/i }));
    await waitFor(() => expect(api.openExternalUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/chatgpt\.com\/\?q=/)));
  });

  it('marks a lesson learned with "I already know this"', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /^start lesson$/i }));
    const player = await screen.findByRole('region', { name: /^lesson: /i });
    await userEvent.click(within(player).getByRole('button', { name: /i already know this/i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalled());
    const ev = api.learningRecordEvents.mock.calls[0][0][0];
    expect(ev).toMatchObject({ type: 'task_done', payload: expect.objectContaining({ source: 'placement' }) });
    expect(ev.item_id).toMatch(/\/learn$/);
  });

  it('is usable from the keyboard: Enter opens the lesson, arrows move, Esc closes', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ roadmap, schedule });
    renderLearn();
    const start = await screen.findByRole('button', { name: /^start lesson$/i });
    start.focus();
    await userEvent.keyboard('{Enter}');
    const player = await screen.findByRole('region', { name: /^lesson: /i });
    expect(within(player).getByText(/^1 \/ \d+$/)).toBeTruthy();
    within(player).getByRole('button', { name: /^start$/i }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(player).getByText(/^2 \/ \d+$/)).toBeTruthy();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(player).getByText(/^1 \/ \d+$/)).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText(/^next up$/i)).toBeTruthy();
  });

  it('resumes a lesson on the screen it was left on', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /^start lesson$/i }));
    let player = await screen.findByRole('region', { name: /^lesson: /i });
    await userEvent.click(within(player).getByRole('button', { name: /^start$/i }));
    await userEvent.click(within(player).getByRole('button', { name: /close lesson/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^continue lesson$/i }));
    player = await screen.findByRole('region', { name: /^lesson: /i });
    expect(within(player).getByText(/^2 \/ \d+$/)).toBeTruthy();
  });

  it('marks a problem solved from its practice card, the one way to tick it', async () => {
    const { roadmap, schedule } = plan();
    const found = futureSolve(schedule, roadmap);
    expect(found).not.toBeNull();
    const api = mockApi({ roadmap, schedule });
    renderLearn('free', vi.fn(), 'plan');
    await screen.findByRole('heading', { name: /this week/i });
    const label = formatDay(found!.date);
    const strip = screen.queryByRole('button', { name: new RegExp(`^${label}:`) });
    if (strip) await userEvent.click(strip);
    else {
      const week = Math.floor((Date.parse(found!.date) - Date.parse(schedule.start_date)) / (7 * 86_400_000)) + 1;
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^week ${week} ·`, 'i') }));
      await userEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes(formatDay(found!.date, false)) && b.textContent.includes('·'))!);
    }
    const sheet = await screen.findByRole('dialog');
    const item = within(sheet).getAllByRole('listitem').find((li) => /^Practice:/.test(li.textContent ?? ''))!;
    await userEvent.click(within(item).getByRole('button', { name: /^open$/i }));
    const player = await screen.findByRole('region', { name: /^lesson: /i });
    await userEvent.click(within(player).getAllByRole('button', { name: /^solved$/i })[0]);
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalled());
    const ev = api.learningRecordEvents.mock.calls[0][0][0];
    expect(ev).toMatchObject({ type: 'task_done', payload: expect.objectContaining({ quality: 4, hint: false }) });
    expect(ev.item_id).toMatch(/\/solve\//);
  });

  it('moves unfinished work forward by itself, with Undo', async () => {
    const { roadmap, schedule } = plan(-3);
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
    const saved: Schedule = api.learnScheduleSave.mock.calls[0][0];
    expect(saved.days.filter((d) => d.date < today).every((d) => d.tasks.length === 0)).toBe(true);
    expect(await screen.findByText(/unfinished tasks? forward/i)).toBeTruthy();
    expect(screen.queryByText(/from earlier days not done/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^undo/i }));
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(2));
    expect(api.learnScheduleSave.mock.calls[1][0]).toEqual(schedule);
  });

  it('"Can\'t study today" empties today and re-plans', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /can't study today/i }));
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
    const saved: Schedule = api.learnScheduleSave.mock.calls[0][0];
    expect(saved.days.find((d) => d.date === today)).toMatchObject({ capacity: 0, tasks: [] });
  });

  it('shows the week and moves a step to another day from a session sheet', async () => {
    const { roadmap, schedule } = plan();
    const api = mockApi({ roadmap, schedule });
    renderLearn();
    await userEvent.click(await screen.findByRole('tab', { name: /plan/i }));
    expect(await screen.findByRole('heading', { name: /this week/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /roadmap/i })).toBeTruthy();
    const tomorrow = schedule.days.find((d) => d.date > today && d.tasks.length)!;
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${formatDay(tomorrow.date)}:`) }));
    const sheet = await screen.findByRole('dialog');
    const moves = within(sheet).getAllByRole('combobox', { name: /^move /i });
    await userEvent.click(moves[0]);
    await userEvent.click((await screen.findAllByRole('option'))[0]);
    await waitFor(() => expect(api.learnScheduleSave).toHaveBeenCalledTimes(1));
  });

  it('opens Plan for the old "path" and "progress" links', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ roadmap, schedule });
    renderLearn('free', vi.fn(), 'path');
    expect(await screen.findByRole('heading', { name: /this week/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /plan/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('goes straight into the next step when Home asks to continue', async () => {
    const { roadmap, schedule } = plan();
    mockApi({ roadmap, schedule });
    renderLearn('free', vi.fn(), 'continue');
    expect(await screen.findByRole('region', { name: /^lesson: /i })).toBeTruthy();
  });

  it('shows the free daily limit on a lesson check and offers an upgrade', async () => {
    const { roadmap, schedule } = plan();
    const used = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, user_id: 'u1', type: 'quiz_passed', skill_id: 'oop',
      item_id: `x-${i}`, payload: {}, duration_s: 0, created_at: new Date().toISOString(),
    }));
    const onUpgrade = vi.fn();
    mockApi({ roadmap, schedule, events: used });
    renderLearn('free', onUpgrade);
    const player = await studyFirstLesson();
    for (let i = 0; i < 3 && !within(player).queryByRole('heading', { name: /check yourself/i }); i++) {
      const next = within(player).queryByRole('button', { name: /^continue$/i });
      if (!next) break;
      await userEvent.click(next);
    }
    expect(within(player).getByRole('heading', { name: /check yourself/i })).toBeTruthy();
    expect(within(player).getByText(/daily practice limit reached/i)).toBeTruthy();
    await userEvent.click(within(player).getByRole('button', { name: /^upgrade$/i }));
    expect(onUpgrade).toHaveBeenCalledWith('Unlimited practice');
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
    expect(await screen.findByRole('heading', { name: /your plan is ready/i })).toBeTruthy();
  });
});
