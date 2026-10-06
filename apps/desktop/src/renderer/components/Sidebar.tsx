import React from 'react';
import {
  PanelLeftClose, PanelLeft, BookOpen, MessageSquare, Settings as SettingsIcon, LifeBuoy,
  Briefcase, Mail, LayoutGrid, Shield, Compass, Target, MessageSquareText, Hammer, Zap,
} from 'lucide-react';
import { NavItem, NavSection, IconButton, Badge, NomadicLogo, NomadicMark, useAppShell } from '@nomadic/ui';
import { TabType, AppUser, WorkspaceMode } from '../types';
import { getTierDisplayName, normalizeTier } from '../utils/tier-utils';
import { isTabEnabled } from '../features';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  currentUser?: AppUser | null;
  /** Which groups to show: both (unified), only Learn or only Jobs. */
  workspaceMode?: WorkspaceMode;
  onToggleCollapsed: () => void;
  onOpenUpgrade?: () => void;
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
        .filter((i) => i.soon || isTabEnabled(i.id))
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
  return [...getNavSections('unified').flatMap((s) => s.items), ...getFooterItems(isAdmin)];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, currentUser, workspaceMode = 'unified', onToggleCollapsed, onOpenUpgrade }) => {
  const { collapsed } = useAppShell();
  const sections = getNavSections(workspaceMode);
  const footer = getFooterItems(currentUser?.role === 'admin');
  const tierId = normalizeTier(currentUser?.tier || currentUser?.subscription_tier);
  const tier = getTierDisplayName(currentUser?.tier || currentUser?.subscription_tier);
  const home: TabType = workspaceMode === 'seeker_only' ? 'feed' : 'learner-roadmaps';

  const item = ({ id, label, icon: Icon, soon }: NavDef) => (
    <NavItem
      key={id}
      label={label}
      icon={<Icon />}
      trailing={soon ? <Badge tone="neutral" size="sm">Soon</Badge> : undefined}
      active={activeTab === id || (id === 'settings' && activeTab === 'profile') || (id === 'admin-overview' && activeTab.startsWith('admin'))}
      onClick={() => onSelectTab(id)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-12 shrink-0 items-center ${collapsed ? 'justify-center' : 'px-4'}`}>
        <button
          type="button"
          onClick={() => onSelectTab(home)}
          aria-label="Nomadic home"
          className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {collapsed
            ? <NomadicMark title={null} className="h-6" />
            : <NomadicLogo title={null} className="h-5" />}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2">
        {sections.map((section) => (
          <NavSection key={section.title} title={sections.length > 1 ? section.title : undefined}>
            {section.items.map(item)}
          </NavSection>
        ))}
      </div>
      <div className="flex flex-col gap-px border-t border-line p-2">
        {footer.map(item)}
        <div className={`mt-1 flex items-center gap-2 ${collapsed ? 'flex-col' : 'pl-2.5'}`}>
          {!collapsed && (
            tierId !== 'max' && onOpenUpgrade ? (
              <button
                type="button"
                onClick={onOpenUpgrade}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left text-caption text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="truncate">{tier}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-0.5 font-strong text-accent [&_svg]:size-3"><Zap aria-hidden="true" />Upgrade</span>
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-caption text-fg-subtle">{tier}</span>
            )
          )}
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            icon={collapsed ? <PanelLeft /> : <PanelLeftClose />}
            variant="ghost"
            size="sm"
            onClick={onToggleCollapsed}
          />
        </div>
      </div>
    </div>
  );
};
