import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, History, LogOut, Moon, Settings as SettingsIcon, Sun, Monitor } from 'lucide-react';
import { Badge, cn, focusRing, type ThemePreference } from '@nomadic/ui';
import { AppUser, TabType } from '../../types';
import { getTierBadgeProps, normalizeTier } from '../../utils/tier-utils';

interface UserMenuProps {
  user: AppUser | null;
  onNavigate: (tab: TabType) => void;
  onLogout: () => void;
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
}

const THEMES: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun /> },
  { id: 'dark', label: 'Dark', icon: <Moon /> },
  { id: 'system', label: 'System', icon: <Monitor /> },
];

const itemClass = cn(
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body text-fg-muted hover:bg-surface-hover hover:text-fg',
  '[&_svg]:size-4 [&_svg]:shrink-0',
  focusRing,
);

/** Account dropdown: WAI-ARIA menu button (Enter/Space/Down opens, arrows move, Escape closes and returns focus). */
export const UserMenu: React.FC<UserMenuProps> = ({ user, onNavigate, onLogout, theme, onThemeChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tier = getTierBadgeProps(normalizeTier(user?.tier || user?.subscription_tier));
  const initial = user?.fullName ? user.fullName[0].toUpperCase() : 'N';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={cn('flex h-8 items-center gap-2 rounded-md border border-line pl-1 pr-2 text-body text-fg hover:bg-surface-hover', focusRing)}
      >
        <span className="flex size-6 items-center justify-center rounded bg-accent text-caption font-strong text-accent-fg" aria-hidden="true">{initial}</span>
        <span className="hidden max-w-[96px] truncate font-strong md:inline">{user?.fullName ? user.fullName.split(' ')[0] : 'Account'}</span>
        <ChevronDown className="size-3 text-fg-subtle" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Account" onKeyDown={onMenuKey} className="absolute right-0 top-full z-dropdown mt-2 w-60 rounded-lg border border-line bg-surface-raised p-1.5 shadow-e3">
          <div className="border-b border-line px-2 pb-2 pt-1">
            <div className="truncate text-body font-strong text-fg">{user?.fullName || 'Nomadic user'}</div>
            <div className="truncate text-caption text-fg-subtle">{user?.email}</div>
            <div className="mt-1.5 flex gap-1.5">
              <Badge tone="accent" size="sm">{tier.label} plan</Badge>
              {user?.role === 'admin' && <Badge tone="warning" size="sm">Admin</Badge>}
            </div>
          </div>
          <button role="menuitem" type="button" className={cn(itemClass, 'mt-1')} onClick={() => { close(false); onNavigate('settings'); }}>
            <SettingsIcon /> Profile &amp; settings
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => { close(false); onNavigate('logs'); }}>
            <History /> Activity log
          </button>
          <div role="group" aria-label="Theme" className="flex gap-1 px-1 py-1.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={theme === t.id}
                type="button"
                onClick={() => onThemeChange(t.id)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-caption text-fg-muted hover:bg-surface-hover [&_svg]:size-3.5',
                  theme === t.id && 'bg-surface-active font-strong text-fg',
                  focusRing,
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="border-t border-line pt-1">
            <button role="menuitem" type="button" className={cn(itemClass, 'text-danger-fg hover:text-danger-fg')} onClick={() => { close(false); onLogout(); }}>
              <LogOut /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
