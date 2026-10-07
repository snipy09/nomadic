import React from 'react';
import {
  PanelLeftClose, PanelLeft, BookOpen, MessageSquare, Settings as SettingsIcon, LifeBuoy,
  Briefcase, Mail, LayoutGrid, Shield, Compass, Target, MessageSquareText, Hammer, Home, Search, Newspaper,
} from 'lucide-react';
import { NavItem, NavSection, IconButton, Badge, Kbd, NomadicLogo, NomadicMark, Tooltip, cn, focusRing, useAppShell, type ThemePreference } from '@nomadic/ui';
import { TabType, AppUser, WorkspaceMode } from '../types';
import { isTabEnabled } from '../features';
import { IS_MOBILE } from '../platform';
import { UserMenu } from './shell/UserMenu';
import { goShortcut } from './shell/shortcuts';
import { TopBarUpdateButton } from '../features/updates/TopBarUpdateButton';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  currentUser?: AppUser | null;
  /** Which groups to show: both (unified), only Learn or only Jobs. */
  workspaceMode?: WorkspaceMode;
  onToggleCollapsed: () => void;
  onOpenUpgrade?: () => void;
  onOpenSearch?: () => void;
  onLogout?: () => void;
  theme?: ThemePreference;
  onThemeChange?: (t: ThemePreference) => void;
}

export interface NavDef {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown with a "Soon" badge (opening a preview screen) when its feature flag is off. */
  soon?: boolean;
}
export interface SectionDef {
  title: string;
  items: NavDef[];
}

export const LEARN_SECTION: SectionDef = {
  title: 'Learn',
  items: [
    { id: 'learner-roadmaps', label: 'Learn', icon: Compass },
    { id: 'learner-interview-prep', label: 'Practice', icon: MessageSquare },
    { id: 'learner-projects', label: 'Projects', icon: Hammer },
    { id: 'learner-resources', label: 'Resources', icon: BookOpen },
  ],
};

export const JOBS_SECTION: SectionDef = {
  title: 'Jobs',
  items: [
    { id: 'feed', label: 'Job board', icon: Briefcase },
    { id: 'applications', label: 'Applications', icon: LayoutGrid },
    { id: 'answers', label: 'Answers', icon: MessageSquareText },
    { id: 'news', label: 'News', icon: Newspaper },
    { id: 'opportunities', label: 'Opportunities', icon: Target },
    { id: 'outreach', label: 'Outreach', icon: Mail, soon: true },
  ],
};

/** Pinned to the bottom of the sidebar. Activity lives in the account menu and the command palette. */
export const FOOTER_ITEMS: NavDef[] = [
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'help', label: 'Help', icon: LifeBuoy },
];

const ADMIN_ITEM: NavDef = { id: 'admin-overview', label: 'Admin', icon: Shield };

export const HOME_ITEM: NavDef = { id: 'home', label: 'Home', icon: Home };

/**
 * Main nav groups for a workspace, minus feature-flagged tabs (items marked soon stay, flagged as soon).
 * A unified workspace shows Learn and Jobs together, so nothing is hidden behind a mode switch.
 */
export function getNavSections(mode: WorkspaceMode = 'unified'): SectionDef[] {
  const groups = mode === 'learner_only' ? [LEARN_SECTION] : mode === 'seeker_only' ? [JOBS_SECTION] : [LEARN_SECTION, JOBS_SECTION];
  return groups
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => (i.soon && !IS_MOBILE) || isTabEnabled(i.id))
        .map((i): NavDef => ({ ...i, soon: Boolean(i.soon) && !isTabEnabled(i.id) })),
    }))
    .filter((s) => s.items.length > 0);
}

/** Footer items; Admin only for server-verified admins. */
export function getFooterItems(isAdmin: boolean): NavDef[] {
  return isAdmin ? [...FOOTER_ITEMS, ADMIN_ITEM] : FOOTER_ITEMS;
}

/** Every page reachable from the sidebar (for search), honouring flags. */
export function allNavItems(isAdmin: boolean): NavDef[] {
  return [HOME_ITEM, ...getNavSections('unified').flatMap((s) => s.items), ...getFooterItems(isAdmin)];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, onSelectTab, currentUser, workspaceMode = 'unified', onToggleCollapsed, onOpenUpgrade, onOpenSearch, onLogout, theme = 'light', onThemeChange,
}) => {
  const { collapsed } = useAppShell();
  const sections = getNavSections(workspaceMode);
  const footer = getFooterItems(currentUser?.role === 'admin');

  const item = ({ id, label, icon: Icon, soon }: NavDef) => (
    <NavItem
      key={id}
      label={label}
      icon={<Icon />}
      shortcut={goShortcut(id)}
      trailing={soon ? <Badge tone="neutral" size="sm">Soon</Badge> : undefined}
      active={activeTab === id || (id === 'settings' && activeTab === 'profile') || (id === 'admin-overview' && activeTab.startsWith('admin'))}
      onClick={() => onSelectTab(id)}
    />
  );

  const search = (
    <button
      type="button"
      onClick={onOpenSearch}
      aria-label="Search pages and commands"
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md text-body text-fg-subtle transition-colors duration-fast hover:bg-surface-hover hover:text-fg [&_svg]:size-4',
        collapsed ? 'justify-center' : 'border border-line bg-surface-sunken px-2.5',
        focusRing,
      )}
    >
      <Search aria-hidden="true" />
      {!collapsed && <span className="flex-1 text-left">Search</span>}
      {!collapsed && <Kbd keys={['Ctrl', 'K']} size="sm" />}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex h-12 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pl-4 pr-2')}>
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          aria-label="Nomadic home"
          className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {collapsed
            ? <NomadicMark title={null} className="h-6" />
            : <NomadicLogo title={null} className="h-5" />}
        </button>
        {!collapsed && (
          <IconButton label="Collapse sidebar" shortcut={['[']} icon={<PanelLeftClose />} variant="ghost" size="sm" onClick={onToggleCollapsed} />
        )}
      </div>
      <div className="px-2 pb-2">
        {collapsed ? <Tooltip content="Search" shortcut={['Ctrl', 'K']} side="right">{search}</Tooltip> : search}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2">
        <NavSection>{item(HOME_ITEM)}</NavSection>
        {sections.map((section) => (
          <NavSection key={section.title} title={section.title}>
            {section.items.map(item)}
          </NavSection>
        ))}
      </div>
      <div className="flex flex-col gap-px border-t border-line p-2">
        {!collapsed && <div className="pb-1 [&>button]:w-full"><TopBarUpdateButton /></div>}
        {footer.map(item)}
        {collapsed && (
          <IconButton label="Expand sidebar" shortcut={['[']} icon={<PanelLeft />} variant="ghost" size="sm" onClick={onToggleCollapsed} className="mx-auto my-1" />
        )}
        <div className="mt-1 border-t border-line pt-2">
          <UserMenu
            user={currentUser ?? null}
            variant={collapsed ? 'compact' : 'sidebar'}
            onNavigate={onSelectTab}
            onLogout={onLogout ?? (() => {})}
            theme={theme}
            onThemeChange={onThemeChange ?? (() => {})}
            onOpenUpgrade={onOpenUpgrade}
          />
        </div>
      </div>
    </div>
  );
};
