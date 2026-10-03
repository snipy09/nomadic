// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { FeedView } from '../features/feed/FeedView';
import type { Entitlements } from '../../shared/ipc';
import { QueryWrapper, entitlements, freeEntitlements } from './entitlementsFixture';

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
    getEntitlements: vi.fn().mockResolvedValue({ success: true, entitlements: entitlements() }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderFeed = (user: any = { tier: 'pro' }, seed: Entitlements | null = entitlements(), onOpenUpgrade?: (f?: string) => void) =>
  render(<QueryWrapper seed={seed ?? undefined}><UIProvider><FeedView profile={profile} onLog={() => {}} currentUser={user} onOpenUpgrade={onOpenUpgrade} /></UIProvider></QueryWrapper>);

const manyJobs = Array.from({ length: 12 }, (_, i) => ({ title: `Role ${i + 1}`, company: `Co ${i + 1}`, applyUrl: `https://co${i + 1}.example/job`, description: 'React', location: 'Remote' }));

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

  it('limits listings to the server-provided number and offers an upgrade', async () => {
    mockApi({ getCloudFeedPage: vi.fn().mockResolvedValue({ success: true, jobs: manyJobs, totalCount: 12 }) });
    const onOpenUpgrade = vi.fn();
    renderFeed({ tier: 'pro' }, freeEntitlements({ limits: { ...freeEntitlements().limits, feedJobs: 4 } }), onOpenUpgrade);
    await screen.findByText('Role 1');
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('[aria-label="Jobs"]'))).toHaveLength(4);
    expect(screen.getByText('8 more openings on this page')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));
    expect(onOpenUpgrade).toHaveBeenCalledWith('Full job board');
  });

  it('shows the full page on a plan without a listing limit (local tier is ignored)', async () => {
    mockApi({ getCloudFeedPage: vi.fn().mockResolvedValue({ success: true, jobs: manyJobs, totalCount: 12 }) });
    renderFeed({ tier: 'free' }, entitlements());
    await screen.findByText('Role 12');
    expect(screen.queryByText(/more openings on this page/)).toBeNull();
  });

  it('fails closed to the Free listing limit when the plan cannot be checked, but never hides saved jobs', async () => {
    const saved = manyJobs.map((j) => ({ ...j }));
    mockApi({
      getCloudFeedPage: vi.fn().mockResolvedValue({ success: true, jobs: manyJobs, totalCount: 12 }),
      getSavedJobs: vi.fn().mockResolvedValue(saved),
      getEntitlements: vi.fn().mockResolvedValue({ success: false, code: 'offline', error: 'Could not reach Nomadic.' }),
    });
    renderFeed({ tier: 'max' }, null);
    await screen.findByText(/because your plan could not be checked/i);
    expect(screen.getByText('2 more openings on this page')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /saved/i }));
    expect(await screen.findByText('Role 12')).toBeTruthy();
    expect(screen.queryByText(/more openings on this page/)).toBeNull();
  });

  it('does not start an apply run when today\'s applies are used up', async () => {
    const api = mockApi();
    const onOpenUpgrade = vi.fn();
    renderFeed({ tier: 'pro' }, freeEntitlements({ appliesRemaining: 0, usage: { appliesToday: 3, learnTracksActive: 0 } }), onOpenUpgrade);
    await screen.findByText('Frontend Developer');
    await userEvent.click(screen.getAllByRole('button', { name: /^apply$/i })[0]);
    expect(onOpenUpgrade).toHaveBeenCalledWith('More applications per day');
    expect(api.startBatchCoPilot).not.toHaveBeenCalled();
  });
});
