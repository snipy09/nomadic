import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOBILE_TABS, MoreView } from '../components/shell/MobileShell';
import type { AppUser } from '../types';

afterEach(cleanup);

const user = { id: 1, email: 'asha@example.com', fullName: 'Asha Rao', role: 'user', tier: 'free', status: 'active', appsCount: 0, createdAt: '' } as AppUser;

describe('Android navigation', () => {
  it('has News, Learn, Jobs, Dashboard and More; no Tracker tab', () => {
    expect(MOBILE_TABS.map((t) => t.label)).toEqual(['News', 'Learn', 'Jobs', 'Dashboard', 'More']);
    const owner = (tab: string) => MOBILE_TABS.find((t) => t.owns(tab as never))?.label;
    expect(owner('dashboard')).toBe('Dashboard');
    expect(owner('applications')).toBe('Jobs');
    expect(owner('profile')).toBe('More');
  });

  it('More opens the profile and no longer lists the dashboard', async () => {
    const onNavigate = vi.fn();
    render(<MoreView user={user} onNavigate={onNavigate} onLogout={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^dashboard$/i })).toBeNull();
    expect(screen.getByText('AR')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /asha rao/i }));
    expect(onNavigate).toHaveBeenCalledWith('profile');
  });
});
