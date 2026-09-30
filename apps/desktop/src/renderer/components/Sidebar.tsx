import React, { useState } from 'react';
import {
  PanelLeftClose, PanelLeft, Settings as SettingsIcon, Briefcase, Mail, LayoutGrid,
  Activity, Shield, LogOut, Sparkles,
} from 'lucide-react';
import { TabType, HeartbeatStatus, AppUser, PersonaTrack } from '../types';
import { normalizeTier } from '../utils/tier-utils';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  heartbeat?: HeartbeatStatus | null;
  logsCount?: number;
  currentUser?: AppUser | null;
  activeTrack?: PersonaTrack;
  onOpenUpgrade?: () => void;
  onLogout?: () => void;
}

interface NavItem {
  id: TabType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MAIN_NAV: NavItem[] = [
  { id: 'feed', label: 'Jobs', hint: 'Find & apply', icon: Briefcase },
  { id: 'applications', label: 'Applications', hint: 'Track progress', icon: LayoutGrid },
  { id: 'outreach', label: 'Outreach', hint: 'Reach recruiters', icon: Mail },
];

const SYSTEM_NAV: NavItem[] = [
  { id: 'logs', label: 'Activity', hint: 'Live log', icon: Activity },
  { id: 'settings', label: 'Settings', hint: 'Profile & keys', icon: SettingsIcon },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, onSelectTab, currentUser, logsCount = 0, onOpenUpgrade, onLogout,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const isAdmin = currentUser?.role === 'admin';
  const tier = normalizeTier(currentUser?.tier || currentUser?.subscription_tier);
  const showUpgrade = tier !== 'max' && !!onOpenUpgrade;

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = activeTab === item.id || (item.id === 'settings' && activeTab === 'profile') || (item.id === 'feed' && activeTab === 'home');
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectTab(item.id)}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`group w-full flex items-center rounded-xl transition-colors relative ${
          collapsed ? 'justify-center h-10' : 'gap-3 px-3 h-10'
        } ${
          active
            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && (
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-[13px] font-semibold leading-none truncate">{item.label}</span>
          </span>
        )}
        {!collapsed && item.id === 'logs' && logsCount > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
            {logsCount > 99 ? '99+' : logsCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between select-none transition-[width] duration-200 z-20 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <nav className="p-3 space-y-6 overflow-y-auto" aria-label="Main navigation">
        <div className="space-y-1">{MAIN_NAV.map(renderItem)}</div>
        <div className="space-y-1">
          {!collapsed && <div className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">System</div>}
          {SYSTEM_NAV.map(renderItem)}
          {isAdmin && renderItem({ id: 'admin-overview', label: 'Admin', hint: 'Control panel', icon: Shield })}
        </div>
      </nav>

      <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
        {showUpgrade && !collapsed && (
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="w-full rounded-xl p-3 text-left bg-gradient-to-br from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 text-white dark:text-slate-900 hover:opacity-95 transition"
          >
            <div className="flex items-center gap-2 text-[13px] font-bold"><Sparkles className="w-4 h-4" /> Go {tier === 'pro' ? 'Max' : 'Pro'}</div>
            <div className="text-[11px] opacity-80 mt-0.5">More auto-applies and HR leads every week</div>
          </button>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              className={`rounded-xl text-[13px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center ${
                collapsed ? 'h-10 w-full justify-center' : 'h-10 px-3 flex-1 gap-2'
              }`}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Sign out</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
};
