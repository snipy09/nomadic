// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { AnswersView } from '../features/answers/AnswersView';
import { fromDraft, toDraft } from '../features/answers/answersLogic';

afterEach(() => {
  cleanup();
  delete (window as any).api;
});

const profile = {
  firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', phone: '', linkedin: '', github: '', sponsorship: 'No',
  desiredSalary: '', noticePeriod: '', resumeText: 'B.Tech Computer Science, Delhi Technological University, 2026. Python, SQL.',
  customAnswers: { work_authorized: 'Yes', __app_degree: 'B.Tech', 'Why data?': 'I like numbers.' },
} as any;

function stubApi(overrides: Record<string, any> = {}): Record<string, any> {
  const api = {
    listRememberedAnswers: vi.fn().mockResolvedValue([{ key: 'expected stipend', answer: '20000', createdAt: '2026-10-01 10:00:00' }]),
    updateRememberedAnswer: vi.fn().mockResolvedValue({ success: true }),
    clearRememberedAnswers: vi.fn().mockResolvedValue({ success: true }),
    draftProfileAnswers: vi.fn().mockResolvedValue({ success: true, answers: { university: 'Delhi Technological University' } }),
    ...overrides,
  };
  (window as any).api = api;
  return api;
}

const renderView = (onSaveProfile = vi.fn().mockResolvedValue(true)) => {
  render(<UIProvider><AnswersView profile={profile} onSaveProfile={onSaveProfile} /></UIProvider>);
  return onSaveProfile;
};

describe('answersLogic', () => {
  it('keeps keys the page does not edit and replaces own answers', () => {
    const d = toDraft(profile.customAnswers);
    expect(d.app.degree).toBe('B.Tech');
    expect(d.own.map((r) => r.question)).toEqual(['Why data?']);
    d.own = [{ id: 'x', question: 'Notice?', answer: 'Immediate' }, { id: 'y', question: '  ', answer: 'dropped' }];
    d.app = { ...d.app, degree: '', relocate: 'Yes' };
    expect(fromDraft(profile.customAnswers, d)).toEqual({ work_authorized: 'Yes', 'Notice?': 'Immediate', __app_relocate: 'Yes' });
  });
});

describe('AnswersView', () => {
  it('shows stored answers and saves edits with the other keys kept', async () => {
    stubApi();
    const onSave = renderView();
    expect((screen.getByLabelText(/^degree/i) as HTMLInputElement).value).toBe('B.Tech');
    expect((screen.getByLabelText('Question 1') as HTMLInputElement).value).toBe('Why data?');
    const save = screen.getByRole('button', { name: /save answers/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(screen.getByRole('group', { name: /willing to relocate/i })).getByRole('button', { name: 'Yes' }));
    await userEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].customAnswers).toEqual({ ...profile.customAnswers, __app_relocate: 'Yes' });
  });

  it('drafts empty answers from the resume and marks them as drafts', async () => {
    const api = stubApi();
    renderView();
    await userEvent.click(screen.getByRole('button', { name: /draft empty answers with ai/i }));
    await waitFor(() => expect((screen.getByLabelText(/college or university/i) as HTMLInputElement).value).toBe('Delhi Technological University'));
    expect(api.draftProfileAnswers.mock.calls[0][0].candidate.documentText).toContain('B.Tech');
    expect(api.draftProfileAnswers.mock.calls[0][0].ids).not.toContain('degree');
    expect(screen.getAllByText(/draft, check it/i).length).toBe(1);
  });

  it('lists, edits and forgets remembered answers', async () => {
    const api = stubApi();
    renderView();
    expect(await screen.findByText('Expected stipend')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /edit answer for expected stipend/i }));
    const input = screen.getByLabelText(/answer for expected stipend/i);
    await userEvent.clear(input);
    await userEvent.type(input, '25000{Enter}');
    await waitFor(() => expect(api.updateRememberedAnswer).toHaveBeenCalledWith({ key: 'expected stipend', answer: '25000' }));
    expect(await screen.findByText('25000')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /forget answer for expected stipend/i }));
    await waitFor(() => expect(api.updateRememberedAnswer).toHaveBeenLastCalledWith({ key: 'expected stipend', answer: null }));
    expect(await screen.findByText(/nothing remembered yet/i)).toBeTruthy();
  });

  it('rolls back and shows the error when a change is refused', async () => {
    stubApi({ updateRememberedAnswer: vi.fn().mockResolvedValue({ success: false, error: 'That answer is no longer saved.' }) });
    renderView();
    await screen.findByText('Expected stipend');
    await userEvent.click(screen.getByRole('button', { name: /forget answer for expected stipend/i }));
    expect(await screen.findByText('That answer is no longer saved.')).toBeTruthy();
    expect(screen.getByText('Expected stipend')).toBeTruthy();
  });

  it('offers a retry when remembered answers cannot load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('Database locked')).mockResolvedValueOnce([]);
    stubApi({ listRememberedAnswers: list });
    renderView();
    expect(await screen.findByText(/could not load remembered answers/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/nothing remembered yet/i)).toBeTruthy();
  });

  it('keeps edits and reports when saving fails', async () => {
    stubApi();
    renderView(vi.fn().mockResolvedValue(false));
    await userEvent.type(screen.getByLabelText(/college or university/i), 'DTU');
    await userEvent.click(screen.getByRole('button', { name: /save answers/i }));
    expect(await screen.findByText(/were not saved/i)).toBeTruthy();
    expect((screen.getByLabelText(/college or university/i) as HTMLInputElement).value).toBe('DTU');
  });
});
