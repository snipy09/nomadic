// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { LearnView } from '../features/learn/LearnView';

afterEach(() => { cleanup(); delete (window as any).api; });

const DAY = 86_400_000;
const frontendGoal = { track_id: 'frontend', horizon_months: 3, daily_hours: 2, started_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };

function mockApi(state: { goal?: any; events?: any[] } = {}, over: Record<string, unknown> = {}) {
  const api = {
    learningGetState: vi.fn().mockResolvedValue({ goal: state.goal ?? null, events: state.events ?? [], pendingSync: 0 }),
    learningSaveGoal: vi.fn(async (g: any) => ({ success: true, goal: { ...g, started_at: 'now', updated_at: 'now' } })),
    learningRecordEvents: vi.fn(async (events: any[]) => ({ success: true, events: events.map((e) => ({ ...e, user_id: 'u1' })) })),
    learningSync: vi.fn().mockResolvedValue({ success: false, pushed: 0, pulled: 0, rejected: 0 }),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderLearn = (tier = 'free', onOpenUpgrade = vi.fn()) =>
  render(<UIProvider><LearnView currentUser={{ tier }} onOpenUpgrade={onOpenUpgrade} /></UIProvider>);

/** A failed html-q1 / html-q2 attempt `daysAgo` days ago (item-level events). */
const failedHtml = (daysAgo: number) =>
  ['html-q1', 'html-q2'].map((item_id, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`, user_id: 'u1', type: 'quiz_failed', skill_id: 'html', item_id,
    payload: { lesson_id: 'lesson-html', quality: 1, score: 0 }, duration_s: 0,
    created_at: new Date(Date.now() - daysAgo * DAY + i).toISOString(),
  }));

describe('LearnView', () => {
  it('sets a goal for a new user and shows the planned path', async () => {
    const api = mockApi();
    renderLearn();
    expect(await screen.findByRole('heading', { name: /set your learning goal/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /create my path/i }));
    expect(await screen.findByText('Choose a role.')).toBeTruthy();
    expect(api.learningSaveGoal).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: 'Frontend Engineer' }));
    expect(screen.getByRole('region', { name: /roadmap preview/i }).textContent).toMatch(/skills over/);
    await userEvent.click(screen.getByRole('button', { name: /create my path/i }));
    await waitFor(() => expect(api.learningSaveGoal).toHaveBeenCalledWith({ track_id: 'frontend', horizon_months: 3, daily_hours: 2 }));
    expect(await screen.findByRole('heading', { name: /your path/i })).toBeTruthy();
    expect(screen.getByText(/up next/i)).toBeTruthy();
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
  });

  it('lets a new user complete the first lesson check', async () => {
    const api = mockApi({ goal: frontendGoal });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /start lesson/i }));
    expect(await screen.findByRole('heading', { name: /html5 & semantic markup/i, level: 2 })).toBeTruthy();
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(1));
    expect(api.learningRecordEvents.mock.calls[0][0][0]).toMatchObject({ type: 'lesson_viewed', skill_id: 'html' });

    // Curated resource opens in the browser.
    await userEvent.click(screen.getByRole('button', { name: /open mdn web docs: learn html in your browser/i }));
    expect(api.openExternalUrl).toHaveBeenCalledWith('https://developer.mozilla.org/en-US/docs/Learn/HTML');

    const check = screen.getByRole('form', { name: /lesson check/i });
    await userEvent.click(within(check).getByRole('radio', { name: '<button>' }));
    await userEvent.click(within(check).getByRole('radio', { name: /text alternative/i }));
    await userEvent.click(within(check).getByRole('button', { name: /check answers/i }));

    expect(await screen.findByText('Lesson complete.')).toBeTruthy();
    const recorded = api.learningRecordEvents.mock.calls[1][0];
    expect(recorded.filter((e: any) => e.type === 'quiz_passed' && e.item_id).length).toBe(2);
    expect(recorded.find((e: any) => !e.item_id)).toMatchObject({ type: 'quiz_passed', skill_id: 'html', payload: { lesson_id: 'lesson-html' } });
    // The path moved on: the next lesson is offered.
    expect(screen.getByRole('button', { name: /^next: /i })).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: /back to my path/i })[0]);
    expect(await screen.findByText(/1 of \d+ skills mastered/)).toBeTruthy();
  });

  it('records a failed check, explains the answer and offers a retry', async () => {
    const api = mockApi({ goal: frontendGoal });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /start lesson/i }));
    const check = await screen.findByRole('form', { name: /lesson check/i });
    await userEvent.click(within(check).getByRole('button', { name: /check answers/i }));
    expect(await screen.findByText('Answer question 1 first.')).toBeTruthy();
    await userEvent.click(within(check).getByRole('radio', { name: '<span>' }));
    await userEvent.click(within(check).getByRole('radio', { name: 'Lazy loading' }));
    await userEvent.click(within(check).getByRole('button', { name: /check answers/i }));
    expect(await screen.findByText(/0 of 2 correct/)).toBeTruthy();
    expect(screen.getAllByText(/not quite/i).length).toBe(2);
    const recorded = api.learningRecordEvents.mock.calls.at(-1)![0];
    expect(recorded.map((e: any) => e.type)).toEqual(['quiz_failed', 'quiz_failed']);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('brings failed questions back on Today the next day, reviews first', async () => {
    const api = mockApi({ goal: frontendGoal, events: failedHtml(2) });
    renderLearn();
    expect(await screen.findByText('2 questions due')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /next lesson/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /start review/i }));
    const form = screen.getByRole('form', { name: /review/i });
    await userEvent.click(within(form).getByRole('radio', { name: '<button>' }));
    await userEvent.click(within(form).getByRole('radio', { name: /text alternative/i }));
    await userEvent.click(within(form).getByRole('button', { name: /check answers/i }));
    expect(await screen.findByText(/2 of 2 remembered/)).toBeTruthy();
    const recorded = api.learningRecordEvents.mock.calls[0][0];
    expect(recorded.map((e: any) => [e.type, e.item_id])).toEqual([['review_done', 'html-q1'], ['review_done', 'html-q2']]);
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(await screen.findByText(/no reviews due/i)).toBeTruthy();
  });

  it('does not show failed questions again on the same day', async () => {
    mockApi({ goal: frontendGoal, events: failedHtml(0) });
    renderLearn();
    expect(await screen.findByText(/no reviews due/i)).toBeTruthy();
  });

  it('stops practice at the free daily limit and offers an upgrade', async () => {
    const used = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, user_id: 'u1', type: 'quiz_passed', skill_id: 'css',
      item_id: `css-q${i}`, payload: {}, duration_s: 0, created_at: new Date(Date.now() - i * 1000).toISOString(),
    }));
    const onOpenUpgrade = vi.fn();
    mockApi({ goal: frontendGoal, events: used });
    renderLearn('free', onOpenUpgrade);
    await userEvent.click(await screen.findByRole('tab', { name: /my path/i }));
    await userEvent.click(await screen.findByRole('button', { name: /start lesson/i }));
    expect(await screen.findByText(/daily practice limit reached/i)).toBeTruthy();
    expect(screen.queryByRole('form', { name: /lesson check/i })).toBe(null);
    await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));
    expect(onOpenUpgrade).toHaveBeenCalled();
  });

  it('shows an error with a working retry when progress cannot be loaded', async () => {
    const api = mockApi({}, { learningGetState: vi.fn().mockRejectedValueOnce(new Error('Database is locked')) });
    renderLearn();
    expect(await screen.findByText(/could not load your learning path/i)).toBeTruthy();
    api.learningGetState.mockResolvedValue({ goal: frontendGoal, events: [], pendingSync: 0 });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: /your path/i })).toBeTruthy();
  });

  it('changes pace without losing mastered skills', async () => {
    const mastered = [{
      id: '00000000-0000-4000-8000-000000000200', user_id: 'u1', type: 'skill_marked_known', skill_id: 'html', item_id: null,
      payload: { source: 'placement', mastery: 0.8 }, duration_s: 0, created_at: new Date(Date.now() - DAY).toISOString(),
    }];
    const api = mockApi({ goal: frontendGoal, events: mastered });
    renderLearn();
    await userEvent.click(await screen.findByRole('tab', { name: /my path/i }));
    await userEvent.click(await screen.findByRole('button', { name: /change goal or pace/i }));
    expect(await screen.findByRole('heading', { name: /change your goal/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: /20 hours a week/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(api.learningSaveGoal).toHaveBeenCalledWith({ track_id: 'frontend', horizon_months: 3, daily_hours: 4 }));
    expect(await screen.findByText(/1 of \d+ skills mastered · 20 hours a week/)).toBeTruthy();
  });

  it('is usable from the keyboard: open a lesson and answer with arrow keys', async () => {
    const api = mockApi({ goal: frontendGoal });
    renderLearn();
    const start = await screen.findByRole('button', { name: /start lesson/i });
    start.focus();
    await userEvent.keyboard('{Enter}');
    const check = await screen.findByRole('form', { name: /lesson check/i });
    const [q1, q2] = within(check).getAllByRole('radiogroup');
    // Radix moves roving focus on the next tick and selects while the arrow key is down.
    const arrowTo = async (group: HTMLElement, index: number) => {
      await userEvent.keyboard('{ArrowDown>}');
      await waitFor(() => expect(within(group).getAllByRole('radio')[index].getAttribute('aria-checked')).toBe('true'));
      await userEvent.keyboard('{/ArrowDown}');
    };
    within(q1).getAllByRole('radio')[0].focus();
    await arrowTo(q1, 1);
    await arrowTo(q1, 2); // <button>
    within(q2).getAllByRole('radio')[0].focus();
    await arrowTo(q2, 1); // text alternative
    within(check).getByRole('button', { name: /check answers/i }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Lesson complete.')).toBeTruthy();
    expect(api.learningRecordEvents).toHaveBeenCalledTimes(2);
  });
});
