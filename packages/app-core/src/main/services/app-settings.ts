import fs from 'fs';
import path from 'path';
import { writeFileAtomic } from '../local-db/safety.js';

// Small main-process settings file (userData/nomadic-settings.json). It holds
// what the main process needs before any window exists: the update channel,
// crash-report consent, and the version whose "what's new" was last shown.

export type UpdateChannel = 'stable' | 'beta';

export interface AppSettings {
  updateChannel: UpdateChannel;
  /** Opt-in only (decision 9). Default off. */
  crashReports: boolean;
  /** Version the user last ran; a different current version means an update just happened. */
  lastSeenVersion: string | null;
  /** Release notes captured when the update was downloaded, shown once after it installs. */
  pendingReleaseNotes: { version: string; notes: string } | null;
  /** Last update policy fetched, applied when offline. */
  lastUpdatePolicy: { minimumVersion: string; message: string | null; fetchedAt: string } | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  updateChannel: 'stable',
  crashReports: false,
  lastSeenVersion: null,
  pendingReleaseNotes: null,
  lastUpdatePolicy: null,
};

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** Unknown or malformed values fall back to the defaults; nothing is guessed. */
export function parseSettings(raw: unknown): AppSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const notes = r.pendingReleaseNotes as Record<string, unknown> | null | undefined;
  const policy = r.lastUpdatePolicy as Record<string, unknown> | null | undefined;
  return {
    updateChannel: r.updateChannel === 'beta' ? 'beta' : 'stable',
    crashReports: r.crashReports === true,
    lastSeenVersion: str(r.lastSeenVersion, 50),
    pendingReleaseNotes:
      notes && str(notes.version, 50) && typeof notes.notes === 'string'
        ? { version: String(notes.version), notes: String(notes.notes).slice(0, 20_000) }
        : null,
    lastUpdatePolicy:
      policy && str(policy.minimumVersion, 50) && str(policy.fetchedAt, 50)
        ? { minimumVersion: String(policy.minimumVersion), message: str(policy.message, 500), fetchedAt: String(policy.fetchedAt) }
        : null,
  };
}

let filePath = '';
let cached: AppSettings | null = null;

export function initAppSettings(userDataPath: string): AppSettings {
  filePath = path.join(userDataPath, 'nomadic-settings.json');
  try {
    cached = parseSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return cached;
}

export function getAppSettings(): AppSettings {
  return cached ?? { ...DEFAULT_SETTINGS };
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  cached = { ...getAppSettings(), ...patch };
  if (filePath) {
    try {
      writeFileAtomic(filePath, Buffer.from(JSON.stringify(cached, null, 2), 'utf8'));
    } catch (err: unknown) {
      console.error('[Settings] Could not save:', err instanceof Error ? err.message : String(err));
    }
  }
  return cached;
}
