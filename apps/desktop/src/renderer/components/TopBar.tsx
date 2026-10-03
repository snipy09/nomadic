import React, { useState } from 'react';
import { ArrowDownToLine, BookOpen, Briefcase, Search, Zap } from 'lucide-react';
import { Button, Kbd, NomadicMark, Tabs, TabsList, TabsTrigger, type ThemePreference } from '@nomadic/ui';
import { AppUser, TabType, PersonaTrack, WorkspaceMode } from '../types';
import { UpdateModal } from './UpdateModal';
import { UserMenu } from './shell/UserMenu';
import { useUpdateCheck } from './shell/useUpdateCheck';
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
  const updateInfo = useUpdateCheck(onLog);
  const [showUpdate, setShowUpdate] = useState(false);
  const isMax = normalizeTier(currentUser?.tier || currentUser?.subscription_tier) === 'max';

  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate(activeTrack === 'learner' ? 'learner-roadmaps' : 'feed')}
        className="flex items-center gap-2 rounded-md text-body font-strong text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Nomadic home"
      >
        <NomadicMark className="size-6" aria-hidden="true" />
        <span>Nomadic</span>
      </button>

      {setTrack && workspaceMode === 'unified' && (
        <Tabs variant="segmented" value={activeTrack} onValueChange={(v) => setTrack(v as PersonaTrack)} className="ml-2">
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
        {updateInfo && (
          <Button variant="subtle" size="sm" leftIcon={<ArrowDownToLine />} onClick={() => setShowUpdate(true)}>
            Update v{updateInfo.latestVersion}
          </Button>
        )}
        {!isMax && (
          <Button variant="primary" size="sm" leftIcon={<Zap />} onClick={onOpenUpgrade}>Upgrade</Button>
        )}
        <UserMenu user={currentUser} onNavigate={onNavigate} onLogout={onLogout} theme={theme} onThemeChange={onThemeChange} />
      </div>

      {showUpdate && updateInfo && (
        <UpdateModal isOpen={showUpdate} onClose={() => setShowUpdate(false)} updateInfo={updateInfo} onLog={onLog} />
      )}
    </>
  );
};
