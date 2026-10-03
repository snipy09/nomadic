// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { FeedView } from '../features/feed/FeedView';

afterEach(() => { cleanup(); delete (window as any).api; });

const jobs = [
  { title: 'Frontend Developer', company: 'Acme', applyUrl: 'https://acme.co/1', description: 'React and TypeScript', location: 'Bengaluru' },
  { title: 'Data Analyst', company: 'Beta', applyUrl: 'https://beta.co/2', description: 'SQL and Excel', location: 'Remote' },
];
const profile = { firstName: 'A', lastName: '', email: '', phone: '9876543210', linkedin: '', github: '', sponsorship: 'No', desiredSalary: '', noticePeriod: '', resumeText: '', customAnswers: {}, techStack: 'React, TypeScript', desiredTitle: 'Frontend Developer' } as any;

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    getSavedJobs: vi.fn().mockResolvedValue([]),
    getCloudFeedPage: vi.fn().mockResolvedValue({ success: true, jobs, totalCount: 2 }),
    saveJob: vi.fn().mockResolvedValue({ success: true }),
    removeSavedJob: vi.fn().mockResolvedValue({ success: true }),
    startBatchCoPilot: vi.fn().mockResolvedValue({ success: false, error: 'Portal blocked' }),
    launchAutonomous: vi.fn(),
    getResumes: vi.fn().mockResolvedValue([{ id: 1 }]),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderFeed = (user: any = { tier: 'pro' }) =>
  render(<UIProvider><FeedView profile={profile} onLog={() => {}} currentUser={user} /></UIProvider>);

describe('FeedView', () => {
  it('shows jobs with a skill-based match', async () => {
    mockApi();
    renderFeed();
    expect(await screen.findByText('Frontend Developer')).toBeTruthy();
    expect(screen.getAllByText(/% match/).length).toBeGreaterThan(0);
  });

  it('shows an error state with retry when the feed fails', async () => {
    const api = mockApi({ getCloudFeedPage: vi.fn().mockResolvedValue({ success: false, error: 'Offline' }) });
    renderFeed();
    expect(await screen.findByText(/could not load jobs/i)).toBeTruthy();
    api.getCloudFeedPage.mockResolvedValue({ success: true, jobs, totalCount: 2 });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Data Analyst')).toBeTruthy();
  });

  it('saves a job', async () => {
    const api = mockApi();
    renderFeed();
    await screen.findByText('Frontend Developer');
    await userEvent.click(screen.getAllByRole('button', { name: /save job/i })[0]);
    await waitFor(() => expect(api.saveJob).toHaveBeenCalledTimes(1));
  });

  it('never submits directly when pre-fill for review fails', async () => {
    const api = mockApi();
    renderFeed();
    await screen.findByText('Frontend Developer');
    await userEvent.click(screen.getAllByRole('button', { name: /^apply$/i })[0]);
    await waitFor(() => expect(api.startBatchCoPilot).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/nothing was submitted/i)).toBeTruthy();
    expect(api.launchAutonomous).not.toHaveBeenCalled();
  });
});
