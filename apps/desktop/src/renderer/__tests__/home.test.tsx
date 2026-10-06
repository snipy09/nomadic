// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { HomeView } from '../features/home/HomeView';
import { answersDone, greeting, setupChecklist } from '../features/home/homeLogic';

afterEach(() => { cleanup(); delete (window as any).api; localStorage.clear(); });

const base = { mode: 'unified' as const, profilePercent: 100, resumes: 1, hasRoadmap: true, answers: { done: 20, total: 20 }, applications: 2 };

describe('setupChecklist', () => {
  it('lists every step for a unified workspace and marks finished ones', () => {
    const items = setupChecklist({ ...base, profilePercent: 80, resumes: 0, applications: 0 });
    expect(items.map((i) => i.id)).toEqual(['profile', 'roadmap', 'resume', 'answers', 'apply']);
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(['roadmap', 'answers']);
    expect(items.find((i) => i.id === 'resume')).toMatchObject({ tab: 'settings', intent: 'resumes' });
  });

  it('keeps only the steps of a single-mode workspace', () => {
    expect(setupChecklist({ ...base, mode: 'learner_only' }).map((i) => i.id)).toEqual(['profile', 'roadmap']);
    expect(setupChecklist({ ...base, mode: 'seeker_only' }).map((i) => i.id)).toEqual(['profile', 'resume', 'answers', 'apply']);
  });

  it('treats resumes that are still loading as not done', () => {
    expect(setupChecklist({ ...base, resumes: null }).find((i) => i.id === 'resume')?.done).toBe(false);
  });

  it('counts common answers as done from half', () => {
    expect(answersDone({ done: 9, total: 20 })).toBe(false);
    expect(answersDone({ done: 10, total: 20 })).toBe(true);
    expect(answersDone({ done: 0, total: 0 })).toBe(false);
  });

  it('greets by time of day', () => {
    expect(greeting(new Date(2026, 9, 6, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 6, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 6, 21))).toBe('Good evening');
  });
});

const profile = { firstName: 'Asha', lastName: 'Rao', email: 'a@b.co', phone: '', linkedin: '', github: '', sponsorship: 'No', desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {}, techStack: 'React, TypeScript', desiredTitle: 'Frontend Developer' } as any;

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    learningGetState: vi.fn().mockResolvedValue({ events: [], roadmap: null, schedule: null, projects: [], notes: [], draft: null, pendingSync: 0 }),
    getApplications: vi.fn().mockResolvedValue([
      { id: 1, company: 'Acme', title: 'Frontend Developer', apply_url: 'https://acme.co/1', status: 'interviewing', mode: 'manual', applied_at: '2026-10-01T10:00:00.000Z', notes: '', history: [], follow_up_at: '2026-01-01' },
    ]),
    getResumes: vi.fn().mockResolvedValue([]),
    getSavedJobs: vi.fn().mockResolvedValue([]),
    getHiddenJobs: vi.fn().mockResolvedValue([]),
    getCloudFeedPage: vi.fn().mockResolvedValue({ success: true, jobs: [
      { title: 'Data Analyst', company: 'Beta', applyUrl: 'https://beta.co/2', description: 'SQL and Excel' },
      { title: 'React Developer', company: 'Acme', applyUrl: 'https://acme.co/3', description: 'React and TypeScript' },
    ], totalCount: 2 }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

describe('HomeView', () => {
  it('greets, shows the next setup step, today, applications with a due follow-up and the best match first', async () => {
    mockApi();
    const onNavigate = vi.fn();
    render(<UIProvider><HomeView profile={profile} currentUser={{ email: 'a@b.co', tier: 'free' } as any} workspaceMode="unified" onNavigate={onNavigate} /></UIProvider>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Asha$/);

    expect(await screen.findByText(/1 of 5 done/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /add resume/i }));
    expect(onNavigate).toHaveBeenCalledWith('settings', 'resumes');

    await userEvent.click(screen.getByRole('button', { name: /plan your roadmap/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('learner-roadmaps');

    expect(await screen.findByText(/1 follow-up due/)).toBeTruthy();
    const titles = (await screen.findAllByText(/React Developer|Data Analyst/)).map((n) => n.textContent);
    expect(titles[0]).toBe('React Developer');
  });

  it('hides the checklist for good when asked', async () => {
    mockApi();
    render(<UIProvider><HomeView profile={profile} currentUser={null} workspaceMode="unified" onNavigate={() => {}} /></UIProvider>);
    await userEvent.click(await screen.findByRole('button', { name: /^hide$/i }));
    expect(screen.queryByText(/get set up/i)).toBeNull();
    cleanup();
    render(<UIProvider><HomeView profile={profile} currentUser={null} workspaceMode="unified" onNavigate={() => {}} /></UIProvider>);
    await screen.findByText(/best matches for you/i);
    expect(screen.queryByText(/get set up/i)).toBeNull();
  });

  it('shows only Learn on a learn-only workspace', async () => {
    mockApi();
    render(<UIProvider><HomeView profile={profile} currentUser={null} workspaceMode="learner_only" onNavigate={() => {}} /></UIProvider>);
    expect(await screen.findByText("Today's learning")).toBeTruthy();
    expect(screen.queryByText(/best matches for you/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Applications' })).toBeNull();
  });
});
