import React from 'react';
import { BookOpen, Briefcase, Search, Zap } from 'lucide-react';
import { Button, Kbd, Tabs, TabsList, TabsTrigger, type ThemePreference } from '@nomadic/ui';
import { AppUser, TabType, PersonaTrack, WorkspaceMode } from '../types';
import { UserMenu } from './shell/UserMenu';
import { TopBarUpdateButton } from '../features/updates/TopBarUpdateButton';
import { normalizeTier } from '../utils/tier-utils';

interface TopBarProps {
  currentUser: AppUser | null;
  onLogout: () => void;
  onNavigate: (tab: TabType) => void;
  activeTrack?: PersonaTrack;
  setTrack?: (track: PersonaTrack) => void;
  workspaceMode?: WorkspaceMode;
  onOpenUpgrade?: () => void;
  onOpenCommandPalette?: () => void;
  onLog?: (msg: string) => void;
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentUser, onLogout, onNavigate, activeTrack = 'learner', setTrack, workspaceMode = 'unified',
  onOpenUpgrade, onOpenCommandPalette, onLog, theme, onThemeChange,
}) => {
  const isMax = normalizeTier(currentUser?.tier || currentUser?.subscription_tier) === 'max';

  return (
    <>
      {setTrack && workspaceMode === 'unified' && (
        <Tabs variant="segmented" value={activeTrack} onValueChange={(v) => setTrack(v as PersonaTrack)}>
          <TabsList aria-label="Workspace">
            <TabsTrigger value="learner" icon={<BookOpen />}>Learn</TabsTrigger>
            <TabsTrigger value="seeker" icon={<Briefcase />}>Seek</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Search />} onClick={onOpenCommandPalette} aria-label="Search and commands" rightIcon={<Kbd keys={['Ctrl', 'K']} size="sm" />}>
          <span className="hidden sm:inline">Search</span>
        </Button>
        <TopBarUpdateButton />
        {!isMax && (
          <Button variant="primary" size="sm" leftIcon={<Zap />} onClick={onOpenUpgrade}>Upgrade</Button>
        )}
        <UserMenu user={currentUser} onNavigate={onNavigate} onLogout={onLogout} theme={theme} onThemeChange={onThemeChange} />
      </div>

    </>
  );
};
