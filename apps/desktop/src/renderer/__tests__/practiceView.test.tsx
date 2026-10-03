// @vitest-environment jsdom
import './radixShims';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import type { PracticeAttempt } from '@job-automator/learning';
import { PracticeView } from '../features/practice/PracticeView';
import type { PracticeCatalog, PracticeEntry } from '../../shared/ipc';

afterEach(() => { cleanup(); delete (window as any).api; });

const base: Pick<PracticeEntry, 'prompt' | 'roles' | 'companies' | 'link' | 'skillId' | 'referenceAnswer' | 'quiz' | 'source'> = {
  prompt: '', roles: [], companies: [], link: null, skillId: null, referenceAnswer: null, quiz: null, source: 'test',
};
const entries: PracticeEntry[] = [
  { ...base, id: 'lc:two-sum', kind: 'problem', title: 'Two Sum', difficulty: 'easy', topics: ['Array', 'Hash Table'], companies: [{ name: 'Acme', frequency: 90 }], link: 'https://leetcode.com/problems/two-sum/', skillId: 'dsa' },
  { ...base, id: 'roleq:virtual-dom', kind: 'question', title: 'Explain the virtual DOM', difficulty: null, topics: ['Frontend & UI Engineering'], roles: ['frontend'] },
  {
    ...base, id: 'sql-q1', kind: 'quiz', title: 'Which clause filters groups?', prompt: 'Which clause filters groups?', difficulty: 'easy', topics: ['SQL'], skillId: 'sql', referenceAnswer: 'HAVING filters after GROUP BY.',
    quiz: { id: 'sql-q1', kind: 'mcq', skill_id: 'sql', lesson_id: null, prompt: 'Which clause filters groups?', explanation: 'HAVING filters after GROUP BY.', difficulty: 'easy', company_tags: [], status: 'published', ai_drafted: false, version: 1, options: ['WHERE', 'HAVING'], correct: [1] },
  },
];
const catalog: PracticeCatalog = { version: 't', entries, companies: [{ name: 'Acme', problemCount: 1 }] };

const pastAttempt = (entry_id: string, topics: string[], score: number, i: number): PracticeAttempt => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, entry_id, entry_kind: 'problem', skill_id: 'dsa', topics, difficulty: 'easy',
  grading: 'self', outcome: score === 1 ? 'solved' : 'unsolved', score, mode: 'single', mock_id: null, duration_s: 10, created_at: new Date().toISOString(),
});

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    practiceGetCatalog: vi.fn().mockResolvedValue({ success: true, catalog }),
    practiceGetState: vi.fn().mockResolvedValue({ success: true, state: { attempts: [], usedToday: 3, signedIn: true } }),
    practiceRecordAttempt: vi.fn().mockImplementation(async (attempt: PracticeAttempt) => ({ success: true, attempt, usedToday: 4 })),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderView = (user: any = { tier: 'free' }, onOpenUpgrade = vi.fn()) =>
  render(<UIProvider><PracticeView currentUser={user} onOpenUpgrade={onOpenUpgrade} /></UIProvider>);

describe('PracticeView', () => {
  it('lists practice from the main process and shows the daily limit', async () => {
    mockApi();
    renderView();
    expect(await screen.findByText('Two Sum')).toBeTruthy();
    expect(screen.getByText('Explain the virtual DOM')).toBeTruthy();
    expect(screen.getByText('7 of 10 attempts left today')).toBeTruthy();
  });

  it('shows an error state with retry when the catalog fails', async () => {
    const api = mockApi({ practiceGetCatalog: vi.fn().mockResolvedValue({ success: false, error: 'Dataset missing' }) });
    renderView();
    expect(await screen.findByText(/could not load practice questions/i)).toBeTruthy();
    api.practiceGetCatalog.mockResolvedValue({ success: true, catalog });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Two Sum')).toBeTruthy();
  });

  it('filters by search and shows an empty state', async () => {
    mockApi();
    renderView();
    await screen.findByText('Two Sum');
    await userEvent.type(screen.getByLabelText('Search practice'), 'virtual');
    expect(screen.queryByText('Two Sum')).toBeNull();
    expect(screen.getByText('Explain the virtual DOM')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search practice'), 'zzz');
    expect(await screen.findByText(/nothing matches these filters/i)).toBeTruthy();
  });

  it('opens the dataset link and records a self-graded attempt through the main process', async () => {
    const api = mockApi();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /two sum/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /open problem on leetcode.com/i }));
    expect(api.openExternalUrl).toHaveBeenCalledWith('https://leetcode.com/problems/two-sum/');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Solved it' }));
    await waitFor(() => expect(api.practiceRecordAttempt).toHaveBeenCalledTimes(1));
    expect(api.practiceRecordAttempt.mock.calls[0][0]).toMatchObject({ entry_id: 'lc:two-sum', grading: 'self', outcome: 'solved', score: 1, mode: 'single', skill_id: 'dsa' });
    expect(await within(dialog).findByText('Attempt saved.')).toBeTruthy();
    expect(screen.getByText('6 of 10 attempts left today')).toBeTruthy();
  });

  it('grades a quiz item locally', async () => {
    const api = mockApi();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /which clause filters groups/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'WHERE' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check answer' }));
    expect(await within(dialog).findByText('Not correct')).toBeTruthy();
    expect(within(dialog).getByText('HAVING filters after GROUP BY.')).toBeTruthy();
    await waitFor(() => expect(api.practiceRecordAttempt).toHaveBeenCalledTimes(1));
    expect(api.practiceRecordAttempt.mock.calls[0][0]).toMatchObject({ entry_id: 'sql-q1', grading: 'quiz', outcome: 'unsolved', score: 0 });
  });

  it('shows AI feedback as unavailable outside the desktop app and never fakes it', async () => {
    const api = mockApi();
    renderView({ tier: 'pro' });
    await userEvent.click(await screen.findByRole('button', { name: /explain the virtual dom/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/your answer/i), 'It diffs a tree.');
    expect(within(dialog).getByText('Not available')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Get AI feedback' }) as HTMLButtonElement).disabled).toBe(true);
    expect(Object.keys(api).some((k) => /feedback|evaluate/i.test(k))).toBe(false);
  });

  const feedbackFor = (quote: string) => ({
    success: true,
    quota: { plan: 'pro', limit: 30, used: 1, remaining: 29, resetsAt: null },
    feedback: {
      summary: 'A good start; add trade-offs.',
      items: ['correctness', 'structure', 'depth', 'communication'].map((id, i) => ({ criterionId: id, score: i, quote: id === 'correctness' ? quote : '', comment: `Comment ${id}` })),
    },
  });

  async function askFeedback(api: ReturnType<typeof mockApi>, onOpenUpgrade = vi.fn()) {
    renderView({ tier: 'pro' }, onOpenUpgrade);
    await userEvent.click(await screen.findByRole('button', { name: /explain the virtual dom/i }));
    const dialog = await screen.findByRole('dialog');
    const button = within(dialog).getByRole('button', { name: 'Get AI feedback' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/your answer/i), 'It diffs a  virtual tree and patches the real DOM.');
    await userEvent.click(button);
    return { dialog, api };
  }

  it('requests rubric feedback through the main process and shows scores with verbatim quotes', async () => {
    const aiRubricFeedback = vi.fn().mockResolvedValue(feedbackFor('diffs a virtual tree'));
    const { dialog } = await askFeedback(mockApi({ aiRubricFeedback }));
    expect(await within(dialog).findByText('“diffs a virtual tree”')).toBeTruthy();
    expect(within(dialog).getByText('A good start; add trade-offs.')).toBeTruthy();
    expect(within(dialog).getByText('3/4')).toBeTruthy();
    expect(aiRubricFeedback).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'roleq:virtual-dom',
      question: 'Explain the virtual DOM',
      answer: 'It diffs a  virtual tree and patches the real DOM.',
      rubric: expect.arrayContaining([expect.objectContaining({ id: 'correctness' })]),
    }));
  });

  it('does not show feedback whose quote is not in the answer', async () => {
    const api = mockApi({ aiRubricFeedback: vi.fn().mockResolvedValue(feedbackFor('uses a shadow DOM')) });
    const { dialog } = await askFeedback(api);
    expect(await within(dialog).findByText(/did not match your answer/i)).toBeTruthy();
    expect(within(dialog).queryByText('A good start; add trade-offs.')).toBeNull();
  });

  it.each([
    ['plan_required', 'AI feedback is part of the Pro and Max plans.'],
    ['quota_exceeded', "You have used today's 30 AI feedback requests."],
  ])('shows the %s refusal with an upgrade action', async (code, error) => {
    const onOpenUpgrade = vi.fn();
    const api = mockApi({ aiRubricFeedback: vi.fn().mockResolvedValue({ success: false, code, error }) });
    const { dialog } = await askFeedback(api, onOpenUpgrade);
    expect(await within(dialog).findByText(error)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upgrade' }));
    expect(onOpenUpgrade).toHaveBeenCalled();
  });

  it('offers no upgrade for a network failure', async () => {
    const api = mockApi({ aiRubricFeedback: vi.fn().mockResolvedValue({ success: false, code: 'network', error: 'Could not reach Nomadic AI.' }) });
    const { dialog } = await askFeedback(api);
    expect(await within(dialog).findByText('Could not reach Nomadic AI.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect((within(dialog).getByRole('button', { name: 'Get AI feedback' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('stops grading once the server reports the daily limit', async () => {
    const onOpenUpgrade = vi.fn();
    mockApi({ practiceRecordAttempt: vi.fn().mockResolvedValue({ success: false, code: 'daily_limit', error: 'Daily limit reached.' }) });
    renderView({ tier: 'free' }, onOpenUpgrade);
    await userEvent.click(await screen.findByRole('button', { name: /two sum/i }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Could not solve' }));
    expect(await within(dialog).findByText(/not saved: daily limit reached/i)).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /explain the virtual dom/i }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/today’s free practice is used up/i)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Solved it' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upgrade' }));
    expect(onOpenUpgrade).toHaveBeenCalledWith('Unlimited practice');
  });

  it('locks company sets on the free plan', async () => {
    const onOpenUpgrade = vi.fn();
    mockApi();
    renderView({ tier: 'free' }, onOpenUpgrade);
    await userEvent.click(await screen.findByRole('button', { name: /company question sets are on pro/i }));
    expect(onOpenUpgrade).toHaveBeenCalledWith('Company question sets');
  });

  it('shows weak topics from past attempts and filters to one', async () => {
    mockApi({
      practiceGetState: vi.fn().mockResolvedValue({
        success: true,
        state: { attempts: [pastAttempt('lc:a', ['Graph'], 0, 1), pastAttempt('lc:b', ['Graph'], 0, 2), pastAttempt('lc:two-sum', ['Array'], 1, 3), pastAttempt('lc:c', ['Array'], 1, 4)], usedToday: 4, signedIn: true },
      }),
    });
    renderView({ tier: 'pro' });
    expect(await screen.findByText('Graph')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Practise Array' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Practise Graph' }));
    expect(await screen.findByText(/nothing matches these filters/i)).toBeTruthy();
  });

  it('runs a timed mock and shows a summary', async () => {
    const api = mockApi();
    renderView({ tier: 'pro' });
    await screen.findByText('Two Sum');
    await userEvent.type(screen.getByLabelText('Search practice'), 'two sum');
    await userEvent.click(screen.getByRole('tab', { name: 'Mock interview' }));
    expect(screen.getByText(/1 question available/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Start mock' }));
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('Question 1 of 1')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Partly' }));
    await waitFor(() => expect(api.practiceRecordAttempt).toHaveBeenCalledTimes(1));
    expect(api.practiceRecordAttempt.mock.calls[0][0]).toMatchObject({ mode: 'mock', outcome: 'partial' });
    expect(api.practiceRecordAttempt.mock.calls[0][0].mock_id).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Mock finished')).toBeTruthy();
    expect(screen.getByText(/0 solved, 1 partly, 0 not solved, 0 not answered, out of 1/)).toBeTruthy();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('tells signed-out users attempts are not saved', async () => {
    mockApi({
      practiceGetState: vi.fn().mockResolvedValue({ success: true, state: { attempts: [], usedToday: null, signedIn: false } }),
      practiceRecordAttempt: vi.fn().mockResolvedValue({ success: false, code: 'not_signed_in', error: 'Sign in to save practice attempts.' }),
    });
    renderView();
    expect(await screen.findByText('Sign in to save attempts')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /two sum/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Solved it' }));
    expect(await within(dialog).findByText(/not saved: sign in/i)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
