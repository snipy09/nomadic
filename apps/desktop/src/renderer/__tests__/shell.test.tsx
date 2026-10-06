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
    expect(ids).toEqual(expect.arrayContaining(['learner-roadmaps', 'feed', 'applications']));
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

describe('UserMenu', () => {
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
