// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { Onboarding } from '../features/onboarding/Onboarding';
import { CompleteProfileModal } from '../features/onboarding/CompleteProfileModal';

afterEach(() => {
  cleanup();
  delete (window as any).api;
  localStorage.clear();
});

const emptyProfile = {
  firstName: '', lastName: '', email: '', phone: '', linkedin: '', github: '', sponsorship: 'No',
  desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {}, onboardingCompleted: false,
} as any;

const resume = { id: 7, name: 'Asha_CV.pdf', targetRole: 'Data Analyst', filePath: 'C:/cv/Asha_CV.pdf', isDefault: true };

function stubApi(overrides: Record<string, unknown> = {}) {
  let stored: unknown[] = [];
  const api = {
    getResumes: vi.fn(async () => stored),
    pickResumeFile: vi.fn().mockResolvedValue({ canceled: false, filePath: resume.filePath, fileName: resume.name }),
    saveResume: vi.fn(async () => { stored = [resume]; return { success: true }; }),
    saveMasterProfile: vi.fn().mockResolvedValue({ success: true }),
    learningSaveGoal: vi.fn(async (g: any) => ({ success: true, goal: { ...g, started_at: 'x', updated_at: 'x' } })),
    learningRecordEvents: vi.fn(async (events: any[]) => ({ success: true, events })),
    ...overrides,
  };
  (window as any).api = api;
  return api;
}

const renderOnboarding = (onComplete = vi.fn()) => {
  render(
    <UIProvider>
      <Onboarding initialProfile={emptyProfile} currentUser={{ email: 'asha@example.com', fullName: 'Asha Rao' }} onComplete={onComplete} />
    </UIProvider>,
  );
  return onComplete;
};

const progress = () => screen.getByRole('progressbar', { name: /setup progress/i }).getAttribute('aria-valuenow');
const continueBtn = () => screen.getByRole('button', { name: /^continue$/i });

describe('Onboarding', () => {
  it('starts from the account name and email, and needs both to continue', async () => {
    stubApi();
    renderOnboarding();
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Asha Rao');
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('asha@example.com');
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.click(continueBtn());
    expect(await screen.findByText('Enter your name.')).toBeTruthy();
    expect(progress()).toBe('1');
    expect(document.activeElement).toBe(screen.getByLabelText(/full name/i));
  });

  it('walks all five steps, creates the roadmap and completes only after the saves succeed', async () => {
    const api = stubApi();
    const onComplete = renderOnboarding();

    await userEvent.type(screen.getByLabelText(/phone/i), '+91 98765 43210');
    await userEvent.click(continueBtn());

    expect(await screen.findByRole('heading', { name: /what are you aiming for/i })).toBeTruthy();
    expect(progress()).toBe('2');
    await userEvent.click(screen.getByRole('button', { name: 'Data Analyst' }));
    const group = await screen.findByRole('group', { name: /suggested skills/i });
    const firstSkill = group.querySelector('button') as HTMLButtonElement;
    const skillName = firstSkill.textContent ?? '';
    await userEvent.click(firstSkill);
    expect(firstSkill.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('radio', { name: /internships/i }));
    await userEvent.click(continueBtn());

    expect(await screen.findByRole('heading', { name: /add your resume/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /upload resume/i }));
    expect(await screen.findByText('Asha_CV.pdf')).toBeTruthy();
    expect(api.saveResume).toHaveBeenCalledWith({ name: 'Asha_CV.pdf', targetRole: 'Data Analyst', filePath: resume.filePath, isDefault: true });
    await userEvent.click(continueBtn());

    expect(await screen.findByRole('heading', { name: /choose your workspace/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: /^apply/i }));
    await userEvent.click(continueBtn());

    // Roadmap: role carried over from step 2, defaults for pace and horizon, a live plan preview.
    expect(await screen.findByRole('heading', { name: /your roadmap/i })).toBeTruthy();
    expect(progress()).toBe('5');
    expect(screen.getByRole('radio', { name: 'Data Analyst' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /10 hours a week/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /3 months/i }).getAttribute('aria-checked')).toBe('true');
    const preview = screen.getByRole('region', { name: /roadmap preview/i });
    expect(preview.textContent).toMatch(/skills? over \d+ weeks?/);
    await userEvent.click(screen.getByRole('radio', { name: /20 hours a week/i }));
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(api.learningSaveGoal).toHaveBeenCalledWith({ track_id: 'data-analyst', horizon_months: 3, daily_hours: 4 });
    const selfReported = api.learningRecordEvents.mock.calls[0][0];
    expect(selfReported.length).toBeGreaterThan(0);
    expect(selfReported.every((e: any) => e.type === 'skill_marked_known' && e.payload.source === 'onboarding' && e.payload.mastery < 0.8)).toBe(true);
    expect(api.learningSaveGoal.mock.invocationCallOrder[0]).toBeLessThan(api.saveMasterProfile.mock.invocationCallOrder[0]);
    const saved = api.saveMasterProfile.mock.calls[0][0];
    expect(saved.onboarding_completed).toBe(1);
    expect(saved.firstName).toBe('Asha');
    expect(saved.lastName).toBe('Rao');
    expect(saved.phone).toBe('+91 98765 43210');
    expect(saved.desiredTitle).toBe('Data Analyst');
    expect(saved.techStack).toBe(skillName);
    expect(saved.resumeFilePath).toBe(resume.filePath);
    expect(saved.workspaceMode).toBe('seeker_only');
    expect(saved.targetOpportunityType).toBe('internship');
    expect(saved.desiredSalary).toBe('');
    expect(onComplete.mock.calls[0][0].onboardingCompleted).toBe(true);
  });

  it('lets the role and resume steps be skipped without inventing anything', async () => {
    const api = stubApi();
    const onComplete = renderOnboarding();
    await userEvent.click(continueBtn());
    await userEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    await screen.findByRole('heading', { name: /add your resume/i });
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await screen.findByRole('heading', { name: /choose your workspace/i });
    await userEvent.click(continueBtn());
    await screen.findByRole('heading', { name: /your roadmap/i });
    expect(screen.getByText(/pick a role to see your roadmap/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(api.learningSaveGoal).not.toHaveBeenCalled();
    const saved = api.saveMasterProfile.mock.calls[0][0];
    expect(saved.desiredTitle).toBe('');
    expect(saved.techStack).toBe('');
    expect(saved.phone).toBe('');
    expect(saved.resumeFilePath).toBe(undefined);
    expect(saved.workspaceMode).toBe('unified');
  });

  it('keeps the user on the last step and does not complete when the save fails', async () => {
    const saveMasterProfile = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'Disk is full.' })
      .mockResolvedValueOnce({ success: true });
    stubApi({ saveMasterProfile });
    const onComplete = renderOnboarding();
    await userEvent.click(continueBtn());
    await userEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    await screen.findByRole('heading', { name: /add your resume/i });
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await screen.findByRole('heading', { name: /choose your workspace/i });
    await userEvent.click(continueBtn());
    await userEvent.click(await screen.findByRole('button', { name: /finish setup/i }));

    expect(await screen.findByText(/disk is full\. nothing was marked complete/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(saveMasterProfile).toHaveBeenCalledTimes(2);
  });

  it('does not complete or save the profile when the roadmap cannot be saved', async () => {
    const api = stubApi({ learningSaveGoal: vi.fn().mockResolvedValue({ success: false, error: 'Database locked.' }) });
    const onComplete = renderOnboarding();
    await userEvent.click(continueBtn());
    await userEvent.click(await screen.findByRole('button', { name: 'Backend Engineer' }));
    await userEvent.click(continueBtn());
    await screen.findByRole('heading', { name: /add your resume/i });
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await screen.findByRole('heading', { name: /choose your workspace/i });
    await userEvent.click(continueBtn());
    await screen.findByRole('heading', { name: /your roadmap/i });
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/database locked\. nothing was marked complete/i)).toBeTruthy();
    expect(api.saveMasterProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    // Skipping the roadmap still finishes setup.
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('goes back without losing what was typed', async () => {
    stubApi();
    renderOnboarding();
    await userEvent.type(screen.getByLabelText(/phone/i), '9876543210');
    await userEvent.click(continueBtn());
    await userEvent.type(await screen.findByLabelText(/target role/i), 'SDE Intern');
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect((await screen.findByLabelText(/phone/i) as HTMLInputElement).value).toBe('9876543210');
    await userEvent.click(continueBtn());
    expect((await screen.findByLabelText(/target role/i) as HTMLInputElement).value).toBe('SDE Intern');
  });
});

describe('CompleteProfileModal', () => {
  const renderModal = (props: Partial<React.ComponentProps<typeof CompleteProfileModal>> = {}) => {
    const p = {
      isOpen: true,
      onClose: vi.fn(),
      profile: emptyProfile,
      onSaveProfile: vi.fn().mockResolvedValue(undefined),
      onProfileCompleted: vi.fn(),
      ...props,
    };
    render(<UIProvider><CompleteProfileModal {...p} /></UIProvider>);
    return p;
  };

  it('renders nothing when closed', () => {
    stubApi();
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('does not pre-fill invented values', async () => {
    stubApi();
    renderModal();
    expect(await screen.findByRole('dialog', { name: /finish your profile/i })).toBeTruthy();
    expect((screen.getByLabelText(/target role/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('');
  });

  it('blocks saving until name, email, phone and a resume are there', async () => {
    stubApi();
    const p = renderModal();
    await userEvent.click(await screen.findByRole('button', { name: /save and continue/i }));
    expect(await screen.findByText(/enter your phone number/i)).toBeTruthy();
    expect(screen.getByText(/upload a resume/i)).toBeTruthy();
    expect(p.onSaveProfile).not.toHaveBeenCalled();
  });

  it('saves, then reports completion and closes', async () => {
    stubApi({ getResumes: vi.fn().mockResolvedValue([resume]) });
    const p = renderModal({ profile: { ...emptyProfile, firstName: 'Asha', email: 'asha@example.com' } });
    expect(await screen.findByText('Asha_CV.pdf')).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/phone/i), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(p.onProfileCompleted).toHaveBeenCalledTimes(1));
    expect(p.onClose).toHaveBeenCalled();
    const saved = (p.onSaveProfile as any).mock.calls[0][0];
    expect(saved.phone).toBe('9876543210');
    expect(saved.firstName).toBe('Asha');
    expect(saved.desiredTitle).toBe('');
    expect(saved.resumeFilePath).toBe(resume.filePath);
  });

  it('stays open with the error when saving fails', async () => {
    stubApi({ getResumes: vi.fn().mockResolvedValue([resume]) });
    const p = renderModal({
      profile: { ...emptyProfile, firstName: 'Asha', email: 'asha@example.com', phone: '9876543210' },
      onSaveProfile: vi.fn().mockRejectedValue(new Error('Could not save')),
    });
    await screen.findByText('Asha_CV.pdf');
    await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(await screen.findByText(/could not save your profile: could not save/i)).toBeTruthy();
    expect(p.onProfileCompleted).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
