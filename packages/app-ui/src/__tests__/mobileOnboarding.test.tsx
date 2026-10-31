// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { MobileOnboarding } from '../features/onboarding/MobileOnboarding';

afterEach(() => {
  cleanup();
  delete (window as any).api;
  localStorage.clear();
});

const emptyProfile = {
  firstName: '', lastName: '', email: '', phone: '', linkedin: '', github: '', sponsorship: 'No',
  desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {}, onboardingCompleted: false,
} as any;

function stubApi() {
  const api = {
    saveMasterProfile: vi.fn().mockResolvedValue({ success: true }),
    learnRoleRoadmapGenerate: vi.fn(async (req: any) => ({ success: true, roadmap: { role: req.role }, notice: null })),
  };
  (window as any).api = api;
  return api;
}

const renderIt = (onComplete = vi.fn()) => {
  render(
    <UIProvider>
      <MobileOnboarding initialProfile={emptyProfile} currentUser={{ email: 'asha@test.in', fullName: 'Asha Rao' }} onComplete={onComplete} />
    </UIProvider>,
  );
  return onComplete;
};

describe('phone onboarding', () => {
  it('explains what the phone does and what stays on the computer', () => {
    stubApi();
    renderIt();
    expect(screen.getByRole('heading', { name: /in your pocket/ })).toBeTruthy();
    expect(screen.getByText('Apply from your computer')).toBeTruthy();
    expect(screen.queryByText(/Resume/)).toBeNull();
  });

  it('asks only the basics, then a tap-first goal, and can finish without a roadmap', async () => {
    const api = stubApi();
    const onComplete = renderIt();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe('Asha Rao');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'Your goal' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /Internships/ }));
    await user.click(screen.getByRole('button', { name: 'Data analyst' }));
    expect(screen.getByRole('button', { name: 'Data analyst' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Tap the ones you know/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'Your roadmap' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /^role$/i }) as HTMLInputElement).value).toBe('Data analyst');
    await user.click(screen.getByRole('button', { name: 'Skip the roadmap for now' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(api.learnRoleRoadmapGenerate).not.toHaveBeenCalled();
    const saved = api.saveMasterProfile.mock.calls[0][0];
    expect(saved).toMatchObject({ onboarding_completed: 1, desiredTitle: 'Data analyst' });
  });

  it('stops on About you until the required fields are filled', async () => {
    stubApi();
    render(
      <UIProvider>
        <MobileOnboarding initialProfile={emptyProfile} currentUser={null} onComplete={vi.fn()} />
      </UIProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
  });

  it('keeps setup unfinished when saving fails, with a retry', async () => {
    const api = stubApi();
    api.saveMasterProfile.mockResolvedValueOnce({ success: false, error: 'Offline.' });
    const onComplete = renderIt();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Skip the roadmap for now' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
