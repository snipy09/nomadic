// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { ProfileView } from '../features/profile/ProfileView';

afterEach(() => { cleanup(); delete (window as any).api; });

const profile = { firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', phone: '', linkedin: '', github: '', sponsorship: 'No', desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {} } as any;

const setup = (onSaveProfile = vi.fn().mockResolvedValue(true)) => {
  render(<UIProvider><ProfileView profile={profile} onSaveProfile={onSaveProfile} /></UIProvider>);
  return onSaveProfile;
};

describe('ProfileView', () => {
  it('saves only what the user entered', async () => {
    const save = setup();
    await userEvent.type(screen.getByLabelText(/target role/i), 'SDE Intern');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0][0];
    expect(saved.desiredTitle).toBe('SDE Intern');
    expect(saved.desiredSalary).toBe('');
    expect(saved.noticePeriod).toBe('');
    expect(saved.askBeforeSubmit).toBe(true);
  });

  it('blocks saving invalid input and shows the error', async () => {
    const save = setup();
    const email = screen.getByLabelText(/^email/i);
    await userEvent.clear(email);
    await userEvent.type(email, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText(/valid email/i)).toBeTruthy();
  });

  it('keeps edits and offers retry when saving fails', async () => {
    const save = setup(vi.fn().mockResolvedValue(false));
    await userEvent.type(screen.getByLabelText(/target role/i), 'SDE');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/could not save/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('switches sections from the keyboard-accessible nav', async () => {
    (window as any).api = { getResumes: vi.fn().mockResolvedValue([]) };
    setup();
    await userEvent.click(screen.getByRole('button', { name: /resumes/i }));
    expect(await screen.findByText(/no resumes yet/i)).toBeTruthy();
  });
});
