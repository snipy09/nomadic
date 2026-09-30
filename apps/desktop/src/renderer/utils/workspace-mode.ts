import { PersonaTrack, TabType } from '../types';

/** Nomadic is job-seeker only; the type is kept so stored profiles with old values still parse. */
export type WorkspaceMode = 'seeker_only';

export function normalizeWorkspaceMode(_mode?: string | null): WorkspaceMode {
  return 'seeker_only';
}

export function getAvailableTracks(_mode?: WorkspaceMode): PersonaTrack[] {
  return ['seeker'];
}

export function getDefaultTabForMode(_mode?: WorkspaceMode): TabType {
  return 'feed';
}
