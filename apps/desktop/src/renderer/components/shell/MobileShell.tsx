import React from 'react';
import { Briefcase, ChevronRight, Compass, Home, LayoutGrid, LifeBuoy, ListChecks, LogOut, Menu, MessageSquareText, Settings as SettingsIcon, Shield, Sparkles } from 'lucide-react';
import { cn } from '@nomadic/ui';
import type { AppUser, TabType } from '../../types';

/**
 * The Android app's shell (iOS-style): pages scroll under a bottom tab bar with five destinations.
 * Respects the system safe areas (status bar, gesture bar) and gives every control a 44 px target.
 */

interface MobileTab {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Pages that highlight this tab. */
  owns: (tab: TabType) => boolean;
}

const MORE_PAGES: ReadonlySet<TabType> = new Set<TabType>(['more', 'answers', 'settings', 'profile', 'help', 'logs', 'account']);

export const MOBILE_TABS: MobileTab[] = [
  { id: 'home', label: 'Home', icon: Home, owns: (t) => t === 'home' },
  { id: 'learner-roadmaps', label: 'Learn', icon: Compass, owns: (t) => t === 'learner-roadmaps' },
  { id: 'feed', label: 'Jobs', icon: Briefcase, owns: (t) => t === 'feed' },
  { id: 'applications', label: 'Tracker', icon: LayoutGrid, owns: (t) => t === 'applications' },
  { id: 'more', label: 'More', icon: Menu, owns: (t) => MORE_PAGES.has(t) || t.startsWith('admin') },
];

export function MobileShell({ activeTab, onSelectTab, children }: { activeTab: TabType; onSelectTab: (tab: TabType) => void; children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col bg-canvas text-fg">
      <main
        id="main"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+84px)]"
      >
        {children}
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-xl">
          {MOBILE_TABS.map(({ id, label, icon: Icon, owns }) => {
            const active = owns(activeTab);
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => onSelectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-strong leading-none transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    active ? 'text-accent' : 'text-fg-subtle active:text-fg',
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

interface MoreViewProps {
  user: AppUser;
  onNavigate: (tab: TabType) => void;
  onOpenUpgrade?: () => void;
  onLogout: () => void;
}

/** The phone's "More" page: everything that is not one of the four main tabs, as an iOS grouped list. */
export function MoreView({ user, onNavigate, onOpenUpgrade, onLogout }: MoreViewProps) {
  const row = (label: string, Icon: React.ComponentType<{ className?: string }>, tone: string, onClick: () => void, danger = false) => (
    <li key={label} className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-body active:bg-fg/[0.06]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          danger ? 'text-danger-fg' : 'text-fg',
        )}
      >
        <span className={cn('flex size-7 items-center justify-center rounded-[8px] text-white [&_svg]:size-4', tone)}>
          <Icon aria-hidden="true" />
        </span>
        <span className="flex-1">{label}</span>
        {!danger && <ChevronRight className="size-4 text-fg-subtle" aria-hidden="true" />}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <h1 className="text-headline font-bold text-fg">More</h1>
        <p className="truncate text-caption text-fg-subtle">{user.email}</p>
      </div>
      <ul className="overflow-hidden rounded-lg bg-surface shadow-e1" aria-label="Your account">
        {row('Application answers', MessageSquareText, 'bg-success', () => onNavigate('answers'))}
        {row('Settings', SettingsIcon, 'bg-fg-subtle', () => onNavigate('settings'))}
        {onOpenUpgrade && row('Upgrade plan', Sparkles, 'bg-accent', onOpenUpgrade)}
      </ul>
      <ul className="overflow-hidden rounded-lg bg-surface shadow-e1" aria-label="Help">
        {row('Help', LifeBuoy, 'bg-accent', () => onNavigate('help'))}
        {row('Activity log', ListChecks, 'bg-fg-subtle', () => onNavigate('logs'))}
        {user.role === 'admin' && row('Admin', Shield, 'bg-danger', () => onNavigate('admin-overview'))}
      </ul>
      <ul className="overflow-hidden rounded-lg bg-surface shadow-e1" aria-label="Session">
        {row('Sign out', LogOut, 'bg-danger', onLogout, true)}
      </ul>
      <p className="px-1 text-caption text-fg-subtle">
        Apply with review, Practice, Projects and Outreach are in the Nomadic desktop app. Jobs you save here are waiting
        in its Saved tab.
      </p>
    </div>
  );
}
