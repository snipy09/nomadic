// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import type { AutoApplyProgressEvent, BatchSnapshot } from '../../shared/ipc';
import { useApplyRunner, type ApplyTarget } from '../features/apply/useApplyRunner';

afterEach(() => { cleanup(); delete (window as any).api; });

const profile = { firstName: 'Asha', lastName: 'K', email: 'asha@x.in', phone: '9876543210', linkedin: '', github: '', sponsorship: 'No', desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {}, resumeFilePath: 'C:/cv.pdf' } as any;
const targets: ApplyTarget[] = [
  { url: 'https://jobs.acme.co/1', company: 'Acme', title: 'Frontend Developer' },
  { url: 'https://jobs.beta.co/2', company: 'Beta', title: 'Data Analyst' },
];

const acme: BatchSnapshot = {
  id: 'app_1', company: 'Acme', jobTitle: 'Frontend Developer', applyUrl: targets[0].url, status: 'needs_attention', submittable: true, walls: [], pageErrors: [],
  fields: [
    { fieldKey: 'q_email', label: 'Email address', value: 'asha@x.in', fieldType: 'text', required: true, status: 'filled', source: 'profile', confidence: 0.97 },
    { fieldKey: 'q_why', label: 'Why Acme?', value: 'I build accessible UIs.', fieldType: 'textarea', required: false, status: 'filled', source: 'llm', confidence: 0.6 },
    { fieldKey: 'q_notice', label: 'Notice period', value: '', fieldType: 'text', required: true, status: 'needs_user', reason: 'No saved answer for this question' },
  ],
};
const beta: BatchSnapshot = {
  id: 'app_2', company: 'Beta', jobTitle: 'Data Analyst', applyUrl: targets[1].url, status: 'failed', submittable: false, walls: [], pageErrors: [], fields: [],
  errorMessage: 'No application form was found on this page.',
};

function mockApi(over: Record<string, unknown> = {}) {
  let progress: ((e: AutoApplyProgressEvent) => void) | null = null;
  const api = {
    getResumes: vi.fn().mockResolvedValue([{ id: 1 }]),
    startBatchCoPilot: vi.fn().mockResolvedValue({ success: true, snapshots: [acme, beta] }),
    submitAllBatchCoPilot: vi.fn().mockResolvedValue({ success: true, applied: 1, failed: 0, total: 1, results: [{ id: 'app_1', submitted: true, confirmed: true }] }),
    cancelAutonomousApply: vi.fn().mockResolvedValue({ success: true }),
    launchAutonomous: vi.fn(),
    onAutoApplyProgress: vi.fn((cb: (e: AutoApplyProgressEvent) => void) => { progress = cb; return () => { progress = null; }; }),
    ...over,
  };
  (window as any).api = api;
  return { api, emit: (e: AutoApplyProgressEvent) => act(() => progress?.(e)) };
}

function Harness({ onSubmitted }: { onSubmitted?: () => void }) {
  const runner = useApplyRunner({ profile, currentUser: { tier: 'pro' } as any, onLog: () => {}, onSubmitted });
  return (
    <>
      <button type="button" onClick={() => void runner.start(targets)}>Start apply</button>
      {runner.element}
    </>
  );
}

const renderHarness = (onSubmitted?: () => void) => render(<UIProvider><Harness onSubmitted={onSubmitted} /></UIProvider>);
const submitButton = () => screen.getByRole('button', { name: /submit .*reviewed/i }) as HTMLButtonElement;
const reviewedBox = () => screen.getByRole('checkbox', { name: /i reviewed this application/i });

async function openReview() {
  const user = userEvent.setup();
  renderHarness();
  await user.click(screen.getByRole('button', { name: 'Start apply' }));
  await screen.findByText('Review before submitting');
  return user;
}

describe('apply run view', () => {
  it('shows every filled field with its source and confidence, and highlights what needs the user', async () => {
    mockApi();
    await openReview();
    expect(screen.getByText('Email address')).toBeTruthy();
    expect(screen.getByText('asha@x.in')).toBeTruthy();
    expect(screen.getByText('From your profile')).toBeTruthy();
    expect(screen.getByText('Confidence 97%')).toBeTruthy();
    expect(screen.getByText('AI drafted')).toBeTruthy();
    const needs = screen.getByRole('region', { name: 'Fields that need you' });
    expect(within(needs).getByRole('textbox', { name: /notice period/i })).toBeTruthy();
    expect(screen.getByText(/1 required field needs your answer/i)).toBeTruthy();
  });

  it('never submits without the review action', async () => {
    const { api } = mockApi();
    const user = await openReview();

    expect(submitButton().disabled).toBe(true);
    await user.click(submitButton());
    // Answering the missing field alone is not a review.
    await user.type(screen.getByRole('textbox', { name: /notice period/i }), '30 days');
    expect(submitButton().disabled).toBe(true);
    await user.click(submitButton());
    await user.keyboard('{Enter}');
    expect(api.submitAllBatchCoPilot).not.toHaveBeenCalled();
    expect(api.launchAutonomous).not.toHaveBeenCalled();

    await user.click(reviewedBox());
    expect(submitButton().disabled).toBe(false);
    await user.click(submitButton());
    await waitFor(() => expect(api.submitAllBatchCoPilot).toHaveBeenCalledTimes(1));
    // Only the reviewed application, with only the value the user supplied.
    expect(api.submitAllBatchCoPilot).toHaveBeenCalledWith({ app_1: { q_notice: '30 days' } }, ['app_1']);
    expect(await screen.findByText(/submitted\. the portal confirmed it/i)).toBeTruthy();
    expect(api.launchAutonomous).not.toHaveBeenCalled();
  });

  it('keeps the review checkbox disabled until required fields are answered', async () => {
    mockApi();
    const user = await openReview();
    expect(reviewedBox().hasAttribute('disabled')).toBe(true);
    await user.type(screen.getByRole('textbox', { name: /notice period/i }), 'Immediately');
    expect(reviewedBox().hasAttribute('disabled')).toBe(false);
  });

  it('lets the user edit a filled value inline and sends the edit', async () => {
    const { api } = mockApi();
    const user = await openReview();
    await user.click(screen.getByRole('button', { name: 'Edit Email address' }));
    const email = screen.getByRole('textbox', { name: /email address/i });
    expect(document.activeElement).toBe(email);
    await user.clear(email);
    await user.type(email, 'asha.k@x.in');
    expect(screen.getByText('Edited by you')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: /notice period/i }), '15 days');
    await user.click(reviewedBox());
    await user.click(submitButton());
    await waitFor(() => expect(api.submitAllBatchCoPilot).toHaveBeenCalledWith({ app_1: { q_email: 'asha.k@x.in', q_notice: '15 days' } }, ['app_1']));
  });

  it('offers retry and skip for a failed application, retrying only that one', async () => {
    const { api } = mockApi();
    const user = await openReview();
    await user.click(screen.getByRole('button', { name: /beta/i }));
    expect(screen.getByText('No application form was found on this page.')).toBeTruthy();

    api.startBatchCoPilot.mockResolvedValueOnce({ success: true, snapshots: [{ ...beta, id: 'app_3', status: 'ready', submittable: true, fields: [acme.fields[0]] }] });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.startBatchCoPilot).toHaveBeenLastCalledWith([targets[1]], { keep: true }));
    expect(await screen.findByRole('checkbox', { name: /i reviewed this application/i })).toBeTruthy();
    await user.click(reviewedBox());
    await user.click(submitButton());
    // Acme was never reviewed, so only the retried Beta form is sent.
    await waitFor(() => expect(api.submitAllBatchCoPilot).toHaveBeenCalledWith({}, ['app_3']));
  });

  it('shows live per-field progress while filling and cancels without submitting', async () => {
    let resolveFill: (v: unknown) => void = () => {};
    const { api, emit } = mockApi({ startBatchCoPilot: vi.fn(() => new Promise((r) => { resolveFill = r; })) });
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'Start apply' }));
    expect(await screen.findByText('Preparing 2 applications')).toBeTruthy();
    expect(screen.getByText('0 of 2 forms prepared')).toBeTruthy();
    await waitFor(() => expect(api.onAutoApplyProgress).toHaveBeenCalled());

    emit({ log: '', url: targets[0].url, statusEvent: { phase: 'filling', message: 'Filled "Email address"', colorState: 'green', formEvent: { type: 'field_filled', fieldId: 'f1', label: 'Email address', kind: 'text', value: 'asha@x.in', source: 'profile', attempt: 1 } } });
    const live = await screen.findByRole('list', { name: 'Fields filled so far' });
    expect(within(live).getByText('Email address')).toBeTruthy();
    emit({ log: '', url: targets[0].url, statusEvent: { phase: 'user_input_required', message: 'x', colorState: 'green' }, snapshot: acme });
    expect(await screen.findByText('1 of 2 forms prepared')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.cancelAutonomousApply).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Preparing 2 applications')).toBeNull());
    await act(async () => { resolveFill({ success: true, snapshots: [acme, beta] }); });
    expect(screen.queryByText('Review before submitting')).toBeNull();
    expect(api.submitAllBatchCoPilot).not.toHaveBeenCalled();
  });

  it('closes with Escape at any time as a cancel', async () => {
    const { api } = mockApi();
    const user = await openReview();
    await user.keyboard('{Escape}');
    expect(api.cancelAutonomousApply).toHaveBeenCalledTimes(1);
    expect(api.submitAllBatchCoPilot).not.toHaveBeenCalled();
  });

  it('moves between applications with the arrow keys', async () => {
    mockApi();
    const user = await openReview();
    const list = screen.getByRole('navigation', { name: 'Applications in this run' });
    const [first, second] = within(list).getAllByRole('button');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('No application form was found on this page.')).toBeTruthy();
  });

  it('reports pre-fill failure and submits nothing', async () => {
    const { api } = mockApi({ startBatchCoPilot: vi.fn().mockResolvedValue({ success: false, error: 'Portal blocked.' }) });
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'Start apply' }));
    expect(await screen.findByText(/portal blocked\. nothing was submitted/i)).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    expect(api.submitAllBatchCoPilot).not.toHaveBeenCalled();
  });
});
