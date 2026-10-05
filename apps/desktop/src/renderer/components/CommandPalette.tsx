import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Code2, Search, Zap } from 'lucide-react';
import { Dialog, DialogContent, Kbd, cn } from '@nomadic/ui';
import { TabType, PersonaTrack } from '../types';
import { VAULT_QUESTIONS } from '../data/resourceVault';
import { isTabEnabled } from '../features';
import { getNavSections } from './Sidebar';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: TabType) => void;
  activeTrack: PersonaTrack;
  onToggleTrack: (track: PersonaTrack) => void;
}

interface CommandItem {
  id: string;
  group: 'Navigation' | 'Actions' | 'Questions';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const LEARNER_TABS = new Set<string>(['learner-roadmaps', 'learner-resources', 'learner-interview-prep', 'learner-projects']);

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelectTab, activeTrack, onToggleTrack }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isOpen) { setQuery(''); setIndex(0); }
  }, [isOpen]);

  const commands = useMemo<CommandItem[]>(() => {
    const go = (tab: TabType) => () => {
      onToggleTrack(LEARNER_TABS.has(tab) ? 'learner' : tab === 'feed' || tab === 'applications' || tab === 'outreach' ? 'seeker' : activeTrack);
      onSelectTab(tab);
    };
    // Navigation for both tracks, de-duplicated, honouring feature flags.
    const seen = new Set<string>();
    const nav: CommandItem[] = [];
    (['learner', 'seeker'] as PersonaTrack[]).forEach((track) =>
      getNavSections(track, false).forEach((s) =>
        s.items.forEach((item) => {
          if (seen.has(item.id)) return;
          seen.add(item.id);
          nav.push({ id: `nav-${item.id}`, group: 'Navigation', title: `Go to ${item.label}`, icon: item.icon, run: go(item.id) });
        }),
      ),
    );
    const next: PersonaTrack = activeTrack === 'learner' ? 'seeker' : 'learner';
    const actions: CommandItem[] = [{
      id: 'action-switch-track',
      group: 'Actions',
      title: next === 'seeker' ? 'Switch to Seek workspace' : 'Switch to Learn workspace',
      icon: Zap,
      run: () => { onToggleTrack(next); onSelectTab(next === 'learner' ? 'learner-roadmaps' : 'feed'); },
    }];
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
  }, [activeTrack, onSelectTab, onToggleTrack]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? commands.filter((c) => `${c.title} ${c.subtitle ?? ''} ${c.group}`.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
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
      <DialogContent title="Command palette" hideTitle size="md" className="top-[14vh] overflow-hidden p-0" bodyClassName="p-0">
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
            placeholder="Type a command or page name…"
            className="h-11 w-full bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd keys={['Esc']} size="sm" />
        </div>
        <ul id={listId} ref={listRef} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1.5">
          {filtered.map((item, i) => {
            const Icon = item.icon;
            const selected = i === index;
            return (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setIndex(i)}
                onClick={() => run(item)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-fg-muted', selected && 'bg-surface-active text-fg')}
              >
                <Icon className="size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-strong">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-caption text-fg-subtle">{item.subtitle}</span>}
                </span>
                <span className="text-caption text-fg-subtle">{item.group}</span>
                {selected && <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden="true" />}
              </li>
            );
          })}
          {filtered.length === 0 && <li role="presentation" className="py-8 text-center text-body text-fg-subtle">No matching commands.</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-caption text-fg-subtle" aria-hidden="true">
          <span>↑↓ navigate</span><span>↵ select</span><span>Esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
