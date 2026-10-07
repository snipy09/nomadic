/** Pure helpers for updates and "what's new". No React, no IPC. */
import type { UpdaterStatus } from '../../types';

export type UpdateAction = 'check' | 'download' | 'install' | null;

export interface UpdaterSummary {
  title: string;
  detail: string;
  action: UpdateAction;
  actionLabel: string | null;
  busy: boolean;
  tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

export function summarizeUpdater(s: UpdaterStatus | null): UpdaterSummary {
  if (!s) return { title: 'Checking update status…', detail: '', action: null, actionLabel: null, busy: true, tone: 'neutral' };
  switch (s.state) {
    case 'unsupported':
      return { title: 'Automatic updates unavailable', detail: s.message || 'Updates work only in the installed app.', action: null, actionLabel: null, busy: false, tone: 'neutral' };
    case 'idle':
      return { title: `Nomadic ${s.currentVersion}`, detail: 'Not checked yet in this session.', action: 'check', actionLabel: 'Check for updates', busy: false, tone: 'neutral' };
    case 'checking':
      return { title: 'Checking for updates…', detail: '', action: null, actionLabel: null, busy: true, tone: 'neutral' };
    case 'up_to_date':
      return { title: 'Nomadic is up to date', detail: `You have version ${s.currentVersion}.`, action: 'check', actionLabel: 'Check again', busy: false, tone: 'success' };
    case 'available':
      return { title: `Version ${s.version ?? 'new'} is available`, detail: `You have ${s.currentVersion}.`, action: 'download', actionLabel: 'Download update', busy: false, tone: 'accent' };
    case 'downloading':
      return { title: `Downloading ${s.version ?? 'update'}…`, detail: `${s.percent ?? 0}% downloaded.`, action: null, actionLabel: null, busy: true, tone: 'accent' };
    case 'downloaded':
      return { title: `Version ${s.version ?? 'new'} is ready`, detail: 'Restart Nomadic to finish updating. It also installs the next time you quit.', action: 'install', actionLabel: 'Restart and update', busy: false, tone: 'success' };
    case 'error':
      return { title: 'Update failed', detail: s.message || 'Something went wrong while updating.', action: 'check', actionLabel: 'Try again', busy: false, tone: 'danger' };
  }
}

/** The top bar shows an update button only when there is something for the user to do or watch. */
export function topBarUpdateLabel(s: UpdaterStatus | null): string | null {
  if (!s) return null;
  if (s.state === 'available') return `Update ${s.version ?? ''}`.trim();
  if (s.state === 'downloading') return `Updating ${s.percent ?? 0}%`;
  if (s.state === 'downloaded') return 'Restart to update';
  return null;
}

export const CHANNEL_OPTIONS = [
  { value: 'stable', label: 'Stable', description: 'Tested releases. Recommended.' },
  { value: 'beta', label: 'Beta', description: 'Earlier access to new features; may have rough edges.' },
] as const;
