// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell, UIProvider } from '@nomadic/ui';
import { Sidebar } from '../components/Sidebar';
import { ProductTour } from '../features/tour/ProductTour';
import { CARD_WIDTH, cardPosition, tourSteps } from '../features/tour/tourLogic';
import { prefs } from '../store/preferences';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('tourSteps', () => {
  it('walks a unified workspace through Learn and Jobs, skipping flagged pages', () => {
    const ids = tourSteps('unified').map((s) => s.id);
    expect(ids[0]).toBe('welcome');
    expect(ids).toEqual(['welcome', 'home', 'learn', 'practice', 'projects', 'feed', 'applications', 'answers', 'search', 'settings']);
  });

  it('keeps only the pages of a single-mode workspace', () => {
    expect(tourSteps('learner_only').map((s) => s.id)).not.toContain('feed');
    expect(tourSteps('seeker_only').map((s) => s.id)).not.toContain('learn');
    expect(tourSteps('seeker_only').map((s) => s.id)).toContain('applications');
  });

  it('says nothing is submitted without review', () => {
    expect(tourSteps().find((s) => s.id === 'applications')?.body).toMatch(/review every field/i);
  });
});

describe('cardPosition', () => {
  const viewport = { width: 1024, height: 700 };
  it('centres the card without a target', () => {
    expect(cardPosition(null, viewport, 200)).toEqual({ top: 250, left: (1024 - CARD_WIDTH) / 2 });
  });
  it('puts the card right of a sidebar item and keeps it inside the window', () => {
    expect(cardPosition({ top: 100, left: 8, width: 220, height: 32 }, viewport, 200)).toEqual({ top: 16, left: 240 });
    expect(cardPosition({ top: 680, left: 8, width: 220, height: 32 }, viewport, 200).top).toBe(700 - 200 - 16);
  });
  it('flips to the left when there is no room on the right', () => {
    expect(cardPosition({ top: 300, left: 900, width: 100, height: 32 }, viewport, 200).left).toBe(900 - 12 - CARD_WIDTH);
  });
});

describe('ProductTour', () => {
  const renderTour = (onClose = vi.fn()) => {
    render(
      <UIProvider>
        <AppShell sidebar={<Sidebar activeTab="home" onSelectTab={() => {}} onToggleCollapsed={() => {}} />}>x</AppShell>
        <ProductTour workspaceMode="unified" onClose={onClose} />
      </UIProvider>,
    );
    return onClose;
  };

  it('steps forward and back and highlights the sidebar item', async () => {
    renderTour();
    const learn = document.querySelector<HTMLElement>('[data-tour="learner-roadmaps"]')!;
    expect(learn).toBeTruthy();
    vi.spyOn(learn, 'getBoundingClientRect').mockReturnValue({ top: 120, left: 8, width: 220, height: 32, right: 228, bottom: 152, x: 8, y: 120, toJSON: () => ({}) });

    expect(screen.getByRole('dialog', { name: 'Welcome to Nomadic' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show me around' }));
    expect(screen.getByRole('dialog', { name: 'Home' })).toBeTruthy();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog', { name: 'Learn' })).toBeTruthy();
    expect(screen.getByText('3 of 10')).toBeTruthy();
    expect((screen.getByRole('dialog').style.left)).toBe('244px');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Home' })).toBeTruthy();
  });

  it('closes on Escape and on Skip, and Finish ends the last step', async () => {
    const onClose = renderTour();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    for (let i = 0; i < tourSteps().length - 1; i++) await userEvent.keyboard('{ArrowRight}');
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps focus on the card buttons', async () => {
    renderTour();
    expect(document.activeElement?.textContent).toBe('Show me around');
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('Skip tour');
  });
});

describe('tour preference', () => {
  it('is remembered per account, case-insensitively', () => {
    expect(prefs.getTourSeen('A@x.in')).toBe(false);
    prefs.setTourSeen('A@x.in');
    expect(prefs.getTourSeen('a@x.in')).toBe(true);
    expect(prefs.getTourSeen('b@x.in')).toBe(false);
  });
});
