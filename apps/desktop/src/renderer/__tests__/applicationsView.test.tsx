// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { ApplicationsView } from '../features/applications/ApplicationsView';

beforeAll(() => {
  // jsdom gaps used by Radix Select.
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

afterEach(() => { cleanup(); delete (window as any).api; });

const rows = () => [
  { id: 1, company: 'Acme', title: 'Frontend Developer', apply_url: 'https://acme.co/1', status: 'applied', mode: 'manual', applied_at: '2026-10-01T10:00:00.000Z', notes: '', history: [{ status: 'applied', changed_at: '2026-10-01T10:00:00.000Z' }] },
  { id: 2, company: 'Beta', title: 'Data Analyst', apply_url: 'https://beta.co/2', status: 'interviewing', mode: 'autonomous', applied_at: '2026-09-20 08:00:00', notes: 'Round 2 on Friday', history: [{ status: 'applied', changed_at: '2026-09-20 08:00:00' }, { status: 'interviewing', changed_at: '2026-09-28T09:00:00.000Z' }] },
  { id: 3, company: 'Gamma', title: 'SDE Intern', apply_url: 'https://gamma.co/3', status: 'captcha_blocked', mode: 'autonomous', applied_at: '2026-09-25T10:00:00.000Z', notes: '', history: [] },
];

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    getApplications: vi.fn().mockResolvedValue(rows()),
    updateApplicationStatus: vi.fn().mockResolvedValue({ success: true }),
    updateApplicationNotes: vi.fn().mockImplementation(async (id: number, notes: string) => ({ success: true, application: { ...rows().find((r) => r.id === id), notes } })),
    deleteApplication: vi.fn().mockResolvedValue({ success: true }),
    saveApplication: vi.fn().mockResolvedValue({ success: true, id: 9 }),
    openExternalUrl: vi.fn(),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderView = (onBrowseJobs = vi.fn()) => {
  render(<UIProvider><ApplicationsView onBrowseJobs={onBrowseJobs} /></UIProvider>);
  return onBrowseJobs;
};

const column = (name: string) => screen.getByRole('listitem', { name: new RegExp(`^${name}$`, 'i') });

async function moveWithKeyboard(selectName: RegExp, optionName: RegExp) {
  const trigger = screen.getAllByRole('combobox', { name: selectName })[0];
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.click(await screen.findByRole('option', { name: optionName }));
}

describe('ApplicationsView', () => {
  it('shows a kanban column per stage with counts and cards', async () => {
    mockApi();
    renderView();
    expect(await screen.findByText('Frontend Developer')).toBeTruthy();
    expect(within(column('Applied')).getByText('Frontend Developer')).toBeTruthy();
    expect(within(column('Interviewing')).getByText('Data Analyst')).toBeTruthy();
    const attention = column('Needs action');
    expect(within(attention).getByText('SDE Intern')).toBeTruthy();
    expect(within(attention).getByText('Blocked by captcha')).toBeTruthy();
    expect(within(column('Offer')).getByLabelText('0 applications')).toBeTruthy();
    expect(screen.getByText(/3 tracked · 1 interviewing · 0 offers · 1 need action/)).toBeTruthy();
  });

  it('moves a card with the keyboard-accessible Move to select', async () => {
    const api = mockApi();
    renderView();
    await screen.findByText('Frontend Developer');
    await moveWithKeyboard(/move frontend developer at acme/i, /^offer$/i);
    await waitFor(() => expect(api.updateApplicationStatus).toHaveBeenCalledWith(1, 'offered'));
    expect(within(column('Offer')).getByText('Frontend Developer')).toBeTruthy();
    expect(within(column('Applied')).queryByText('Frontend Developer')).toBeNull();
  });

  it('rolls a move back and says so when saving fails', async () => {
    mockApi({ updateApplicationStatus: vi.fn().mockResolvedValue({ success: false, error: 'DB locked' }) });
    renderView();
    await screen.findByText('Frontend Developer');
    await moveWithKeyboard(/move frontend developer at acme/i, /^rejected$/i);
    expect(await screen.findByText('Status not changed')).toBeTruthy();
    expect(within(column('Applied')).getByText('Frontend Developer')).toBeTruthy();
  });

  it('shows an empty state whose next action goes to the Job board', async () => {
    mockApi({ getApplications: vi.fn().mockResolvedValue([]) });
    const onBrowseJobs = renderView();
    expect(await screen.findByText('No applications yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /go to job board/i }));
    expect(onBrowseJobs).toHaveBeenCalledTimes(1);
  });

  it('shows an error state with retry', async () => {
    const api = mockApi({ getApplications: vi.fn().mockRejectedValue(new Error('Database unavailable')) });
    renderView();
    expect(await screen.findByText('Could not load applications')).toBeTruthy();
    expect(screen.getByText('Database unavailable')).toBeTruthy();
    api.getApplications.mockResolvedValue(rows());
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Data Analyst')).toBeTruthy();
  });

  it('searches and switches to the list view', async () => {
    mockApi();
    renderView();
    await screen.findByText('Frontend Developer');
    await userEvent.type(screen.getByLabelText('Search applications'), 'friday');
    expect(screen.queryByText('Frontend Developer')).toBeNull();
    expect(screen.getByText('Data Analyst')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /list/i }));
    const table = screen.getByRole('table', { name: 'Applications' });
    expect(within(table).getByText('Data Analyst')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText('Search applications'));
    await userEvent.type(screen.getByLabelText('Search applications'), 'nothing-matches');
    expect(screen.getByText('No applications match these filters')).toBeTruthy();
  });

  it('opens details with status history and saves notes', async () => {
    const api = mockApi();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /data analyst/i }));
    const dialog = await screen.findByRole('dialog');
    const history = within(dialog).getByRole('list', { name: 'Status history' });
    expect(within(history).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Interviewing/),
      expect.stringMatching(/^Applied/),
    ]);
    expect(within(dialog).getByText('https://beta.co/2')).toBeTruthy();
    const notes = within(dialog).getByLabelText(/notes/i);
    await userEvent.type(notes, ', bring portfolio');
    await userEvent.click(within(dialog).getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(api.updateApplicationNotes).toHaveBeenCalledWith(2, 'Round 2 on Friday, bring portfolio'));
  });

  it('deletes only after confirming', async () => {
    const api = mockApi();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /sde intern/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    expect(api.deleteApplication).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(api.deleteApplication).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText('SDE Intern')).toBeNull());
  });

  it('adds a manual application without inventing a link', async () => {
    const api = mockApi({ getApplications: vi.fn().mockResolvedValue([]) });
    renderView();
    await screen.findByText('No applications yet');
    await userEvent.click(screen.getAllByRole('button', { name: /add application/i })[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /add application/i }));
    expect(within(dialog).getByText(/enter the company name/i)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/company/i), 'Zeta');
    await userEvent.type(within(dialog).getByLabelText(/^role/i), 'ML Intern');
    await userEvent.click(within(dialog).getByRole('button', { name: /add application/i }));
    await waitFor(() => expect(api.saveApplication).toHaveBeenCalledTimes(1));
    const saved = api.saveApplication.mock.calls[0][0];
    expect(saved).toMatchObject({ company: 'Zeta', title: 'ML Intern', status: 'applied', mode: 'manual' });
    expect(saved.apply_url).toBeUndefined();
  });
});
