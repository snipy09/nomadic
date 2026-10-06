import React from 'react';
import { Search } from 'lucide-react';
import { Kbd, cn, focusRing, type ThemePreference } from '@nomadic/ui';
import { AppUser, TabType } from '../types';
import { UserMenu } from './shell/UserMenu';
import { TopBarUpdateButton } from '../features/updates/TopBarUpdateButton';

interface TopBarProps {
  currentUser: AppUser | null;
  onLogout: () => void;
  onNavigate: (tab: TabType) => void;
  onOpenCommandPalette?: () => void;
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentUser, onLogout, onNavigate, onOpenCommandPalette, theme, onThemeChange }) => (
  <>
    <button
      type="button"
      onClick={onOpenCommandPalette}
      aria-label="Search and commands"
      className={cn(
        'flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-surface-sunken px-2.5 text-body text-fg-subtle',
        'transition-colors duration-fast hover:border-line-strong hover:text-fg-muted [&_svg]:size-4',
        focusRing,
      )}
    >
      <Search aria-hidden="true" />
      <span className="flex-1 truncate text-left">Search pages and commands</span>
      <Kbd keys={['Ctrl', 'K']} size="sm" />
    </button>

    <div className="ml-auto flex items-center gap-2">
      <TopBarUpdateButton />
      <UserMenu user={currentUser} onNavigate={onNavigate} onLogout={onLogout} theme={theme} onThemeChange={onThemeChange} />
    </div>
  </>
);
