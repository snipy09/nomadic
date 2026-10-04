import React from 'react';
import {
  PanelLeftClose, PanelLeft, BookOpen, MessageSquare, Settings as SettingsIcon, LifeBuoy,
  Briefcase, Mail, LayoutGrid, Shield, Compass, Target, TrendingUp, MessageSquareText,
} from 'lucide-react';
import { NavItem, NavSection, IconButton, Badge, NomadicLogo, NomadicMark, useAppShell } from '@nomadic/ui';
import { TabType, AppUser, PersonaTrack } from '../types';
import { getTierDisplayName } from '../utils/tier-utils';
import { isTabEnabled } from '../features';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  currentUser?: AppUser | null;
  activeTrack?: PersonaTrack;
  onToggleCollapsed: () => void;
}

interface NavDef {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown with a "Soon" badge (opening a preview screen) when its feature flag is off. */
  soon?: boolean;
}
interface SectionDef {
  title: string;
  items: NavDef[];
}

const SYSTEM: SectionDef = {
  title: 'System',
  items: [
    { id: 'logs', label: 'Activity', icon: TrendingUp },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'help', label: 'Help', icon: LifeBuoy },
  ],
};

export const NAV: Record<PersonaTrack, SectionDef[]> = {
  learner: [
    {
      title: 'Learn',
      items: [
        { id: 'learner-roadmaps', label: 'Learn', icon: Compass },
        { id: 'learner-resources', label: 'Resources', icon: BookOpen },
        { id: 'learner-interview-prep', label: 'Practice', icon: MessageSquare },
      ],
    },
    { title: 'Discover', items: [{ id: 'opportunities', label: 'Opportunities', icon: Target }] },
    SYSTEM,
  ],
  seeker: [
    {
      title: 'Seek',
      items: [
        { id: 'feed', label: 'Job Board', icon: Briefcase },
        { id: 'opportunities', label: 'Opportunities', icon: Target },
        { id: 'outreach', label: 'Outreach', icon: Mail, soon: true },
        { id: 'applications', label: 'Tracking', icon: LayoutGrid },
        { id: 'answers', label: 'Answers', icon: MessageSquareText },
      ],
    },
    SYSTEM,
  ],
};

/**
 * Nav sections for a track, minus feature-flagged tabs (items marked soon stay, flagged as soon);
 * the Admin section only for server-verified admins.
 */
export function getNavSections(track: PersonaTrack, isAdmin: boolean): SectionDef[] {
  const sections = NAV[track]
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => i.soon || isTabEnabled(i.id))
        .map((i): NavDef => ({ ...i, soon: Boolean(i.soon) && !isTabEnabled(i.id) })),
    }))
    .filter((s) => s.items.length > 0);
  if (isAdmin) sections.push({ title: 'Admin', items: [{ id: 'admin-overview', label: 'Admin Control', icon: Shield }] });
  return sections;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, currentUser, activeTrack = 'learner', onToggleCollapsed }) => {
  const { collapsed } = useAppShell();
  const sections = getNavSections(activeTrack, currentUser?.role === 'admin');
  const tier = getTierDisplayName(currentUser?.tier || currentUser?.subscription_tier);

  const home: TabType = activeTrack === 'learner' ? 'learner-roadmaps' : 'feed';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-12 shrink-0 items-center border-b border-line ${collapsed ? 'justify-center' : 'px-4'}`}>
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
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <NavSection key={section.title} title={section.title}>
            {section.items.map(({ id, label, icon: Icon, soon }) => (
              <NavItem
                key={id}
                label={label}
                icon={<Icon />}
                trailing={soon ? <Badge tone="neutral" size="sm">Soon</Badge> : undefined}
                active={activeTab === id || (id === 'settings' && activeTab === 'profile')}
                onClick={() => onSelectTab(id)}
              />
            ))}
          </NavSection>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line p-2">
        {!collapsed && <Badge tone="neutral" size="sm">{tier}</Badge>}
        <IconButton
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          icon={collapsed ? <PanelLeft /> : <PanelLeftClose />}
          variant="ghost"
          size="sm"
          onClick={onToggleCollapsed}
          className={collapsed ? 'mx-auto' : undefined}
        />
      </div>
    </div>
  );
};
