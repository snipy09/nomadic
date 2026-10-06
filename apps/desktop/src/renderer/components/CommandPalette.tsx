import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Code2, History, LogOut, Monitor, Moon, PanelLeft, Search, Sun, Zap } from 'lucide-react';
import { Dialog, DialogContent, Kbd, cn, type ThemePreference } from '@nomadic/ui';
import { TabType } from '../types';
import { VAULT_QUESTIONS } from '../data/resourceVault';
import { isTabEnabled } from '../features';
import { allNavItems } from './Sidebar';
import { goShortcut } from './shell/shortcuts';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: TabType) => void;
  isAdmin?: boolean;
  theme?: ThemePreference;
  onThemeChange?: (t: ThemePreference) => void;
  onToggleSidebar?: () => void;
  onOpenUpgrade?: () => void;
  onLogout?: () => void;
}

interface CommandItem {
  id: string;
  group: 'Navigation' | 'Actions' | 'Questions';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string[];
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelectTab, isAdmin = false, theme, onThemeChange, onToggleSidebar, onOpenUpgrade, onLogout }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isOpen) { setQuery(''); setIndex(0); }
  }, [isOpen]);

  const commands = useMemo<CommandItem[]>(() => {
    const go = (tab: TabType) => () => onSelectTab(tab);
    const nav: CommandItem[] = allNavItems(isAdmin).map((item) => (
      { id: `nav-${item.id}`, group: 'Navigation', title: `Go to ${item.label}`, icon: item.icon, shortcut: goShortcut(item.id), run: go(item.id) }
    ));
    const themes: Array<{ id: ThemePreference; label: string; icon: CommandItem['icon'] }> = [
      { id: 'light', label: 'light', icon: Sun },
      { id: 'dark', label: 'dark', icon: Moon },
      { id: 'system', label: 'system', icon: Monitor },
    ];
    const actions: CommandItem[] = [
      { id: 'action-activity', group: 'Actions', title: 'Show activity log', subtitle: 'What Nomadic did this session', icon: History, run: go('logs') },
      ...(onToggleSidebar ? [{ id: 'action-sidebar', group: 'Actions' as const, title: 'Toggle sidebar', icon: PanelLeft, shortcut: ['['], run: onToggleSidebar }] : []),
      ...(onThemeChange
        ? themes.filter((t) => t.id !== theme).map((t) => ({ id: `action-theme-${t.id}`, group: 'Actions' as const, title: `Use ${t.label} theme`, icon: t.icon, run: () => onThemeChange(t.id) }))
        : []),
      ...(onOpenUpgrade ? [{ id: 'action-upgrade', group: 'Actions' as const, title: 'Upgrade plan', subtitle: 'Pro and Max', icon: Zap, run: onOpenUpgrade }] : []),
      ...(onLogout ? [{ id: 'action-logout', group: 'Actions' as const, title: 'Sign out', icon: LogOut, run: onLogout }] : []),
    ];
    const questions: CommandItem[] = isTabEnabled('learner-resources')
      ? VAULT_QUESTIONS.slice(0, 15).map((q) => ({
          id: `q-${q.id}`,
          group: 'Questions' as const,
          title: q.title,
          subtitle: [q.category, q.difficulty].filter(Boolean).join(' · '),
          icon: Code2,
          run: go('learner-resources'),
        }))
      : [];
    return [...nav, ...actions, ...questions];
  }, [isAdmin, onSelectTab, theme, onThemeChange, onToggleSidebar, onOpenUpgrade, onLogout]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? commands.filter((c) => `${c.title} ${c.subtitle ?? ''} ${c.group}`.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  const run = (item?: CommandItem) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Home') { e.preventDefault(); setIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setIndex(filtered.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title="Command palette" hideTitle hideClose size="md" className="top-[14vh] overflow-hidden p-0" bodyClassName="p-0">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[index] ? `${listId}-${filtered[index].id}` : undefined}
            aria-label="Search commands"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            className="h-12 w-full bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
          />
          <Kbd keys={['Esc']} size="sm" />
        </div>
        <ul id={listId} ref={listRef} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1.5">
          {filtered.map((item, i) => {
            const Icon = item.icon;
            const selected = i === index;
            const heading = i === 0 || filtered[i - 1].group !== item.group;
            return (
              <React.Fragment key={item.id}>
                {heading && <li role="presentation" className="px-2.5 pb-1 pt-2 text-caption font-strong text-fg-subtle">{item.group}</li>}
                <li
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(item)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-fg-muted', selected && 'bg-surface-active text-fg')}
                >
                  <Icon className="size-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-caption text-fg-subtle">{item.subtitle}</span>}
                  </span>
                  {item.shortcut ? <Kbd keys={item.shortcut} size="sm" /> : selected && <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}
          {filtered.length === 0 && <li role="presentation" className="py-8 text-center text-body text-fg-subtle">No matching commands.</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-caption text-fg-subtle" aria-hidden="true">
          <span>↑↓ navigate</span><span>↵ select</span><span>Esc close</span><span className="ml-auto">Press G then a letter to jump to a page</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
