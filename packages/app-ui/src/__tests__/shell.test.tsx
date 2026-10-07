// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell, UIProvider } from '@nomadic/ui';
import { Sidebar, getFooterItems, getNavSections } from '../components/Sidebar';
import { CommandPalette } from '../components/CommandPalette';
import { UserMenu } from '../components/shell/UserMenu';

afterEach(() => cleanup());

describe('nav sections', () => {
  it('shows Learn and Jobs together, hides flagged features, keeps Outreach as Soon and only shows Admin to admins', () => {
    const ids = getNavSections().flatMap((s) => s.items.map((i) => i.id));
    expect(getNavSections().map((s) => s.title)).toEqual(['Learn', 'Jobs']);
    expect(ids).toEqual(expect.arrayContaining(['learner-roadmaps', 'feed', 'applications', 'news']));
    // News is a secondary Jobs page on the desktop, after the job tools; Home stays the dashboard.
    const jobs = getNavSections().find((s) => s.title === 'Jobs')!.items.filter((i) => !i.soon).map((i) => i.id);
    expect(jobs.at(-1)).toBe('news');
    expect(getNavSections().flatMap((s) => s.items).find((i) => i.id === 'outreach')?.soon).toBe(true);
    expect(ids).not.toContain('opportunities');
    expect(ids).not.toContain('learner-resources');
    expect(ids).not.toContain('logs');
    expect(getFooterItems(false).map((i) => i.id)).not.toContain('admin-overview');
    expect(getFooterItems(true).map((i) => i.id)).toContain('admin-overview');
  });

  it('shows one group for a single-mode workspace', () => {
    expect(getNavSections('learner_only').map((s) => s.title)).toEqual(['Learn']);
    expect(getNavSections('seeker_only').map((s) => s.title)).toEqual(['Jobs']);
  });
});

describe('Sidebar', () => {
  it('marks the active page and navigates on click', async () => {
    const onSelect = vi.fn();
    render(
      <UIProvider>
        <AppShell sidebar={<Sidebar activeTab="feed" onSelectTab={onSelect} onToggleCollapsed={() => {}} />}>x</AppShell>
      </UIProvider>,
    );
    expect(screen.getByRole('button', { name: /job board/i }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(screen.getByRole('button', { name: /applications/i }));
    expect(onSelect).toHaveBeenCalledWith('applications');
  });
});

describe('CommandPalette', () => {
  it('filters, moves with arrows and runs the selected command with Enter', async () => {
    const onSelectTab = vi.fn();
    const onClose = vi.fn();
    render(
      <UIProvider>
        <CommandPalette isOpen onClose={onClose} onSelectTab={onSelectTab} />
      </UIProvider>,
    );
    const input = screen.getByRole('combobox', { name: /search commands/i });
    await userEvent.type(input, 'applications');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(onSelectTab).toHaveBeenCalledWith('applications');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CommandPalette actions', () => {
  it('shows go-to shortcuts and runs theme, sidebar and sign-out actions', async () => {
    const onThemeChange = vi.fn();
    const onToggleSidebar = vi.fn();
    const onLogout = vi.fn();
    render(
      <UIProvider>
        <CommandPalette isOpen onClose={() => {}} onSelectTab={() => {}} theme="light" onThemeChange={onThemeChange} onToggleSidebar={onToggleSidebar} onLogout={onLogout} />
      </UIProvider>,
    );
    const jobBoard = screen.getByRole('option', { name: /go to job board/i });
    expect(jobBoard.textContent).toMatch(/GJ$/);
    expect(screen.queryByRole('option', { name: /use light theme/i })).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: /use dark theme/i }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    await userEvent.click(screen.getByRole('option', { name: /toggle sidebar/i }));
    expect(onToggleSidebar).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('option', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe('Sidebar account menu', () => {
  it('opens upwards from the sidebar with settings, activity and sign out', async () => {
    const onSelect = vi.fn();
    const onLogout = vi.fn();
    render(
      <UIProvider>
        <AppShell sidebar={<Sidebar activeTab="home" onSelectTab={onSelect} onToggleCollapsed={() => {}} onLogout={onLogout} currentUser={{ fullName: 'Asha Rao', email: 'a@b.co', tier: 'free' } as any} />}>x</AppShell>
      </UIProvider>,
    );
    expect(screen.getByRole('button', { name: /^home$/i }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(screen.getByRole('button', { name: /asha rao/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /activity log/i }));
    expect(onSelect).toHaveBeenCalledWith('logs');
    await userEvent.click(screen.getByRole('button', { name: /asha rao/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe('UserMenu', () => {
  it('compact (collapsed sidebar) renders the menu outside the clipping sidebar', async () => {
    const { container } = render(
      <div style={{ overflow: 'hidden', width: 56 }}>
        <UserMenu variant="compact" user={{ fullName: 'Asha Rao', email: 'a@b.co', role: 'user', tier: 'free' } as any} onNavigate={() => {}} onLogout={() => {}} theme="light" onThemeChange={() => {}} />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: /account: asha rao/i }));
    const menu = screen.getByRole('menu', { name: /account/i });
    expect(container.contains(menu)).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /profile/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens as a menu, closes on Escape and returns focus', async () => {
    render(
      <UIProvider>
        <UserMenu user={{ fullName: 'Asha Rao', email: 'a@b.co', role: 'user', tier: 'free' } as any} onNavigate={() => {}} onLogout={() => {}} theme="light" onThemeChange={() => {}} />
      </UIProvider>,
    );
    const trigger = screen.getByRole('button', { name: /asha/i });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu', { name: /account/i })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
