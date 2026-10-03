import { getAppSettings, updateAppSettings } from './app-settings.js';

// "What's new" after an update (SAAS_PLAN B6). Shown once per version, only when
// the version changed since the last run (not on a fresh install). Notes are the
// release notes captured when the update downloaded; when there are none, the
// dialog links to the release page instead of making anything up.

export interface WhatsNew {
  show: boolean;
  version: string;
  previousVersion: string | null;
  notes: string | null;
  releaseUrl: string;
}

export function releaseUrlFor(version: string): string {
  return `https://github.com/snipy09/nomadic/releases/tag/v${encodeURIComponent(version)}`;
}

export function computeWhatsNew(
  currentVersion: string,
  lastSeenVersion: string | null,
  pending: { version: string; notes: string } | null
): WhatsNew {
  const updated = lastSeenVersion !== null && lastSeenVersion !== currentVersion;
  return {
    show: updated,
    version: currentVersion,
    previousVersion: lastSeenVersion,
    notes: pending && pending.version === currentVersion && pending.notes.trim() ? pending.notes : null,
    releaseUrl: releaseUrlFor(currentVersion),
  };
}

let current: WhatsNew | null = null;

/** Call once at startup: decides what to show and records this version as seen. */
export function initWhatsNew(currentVersion: string): WhatsNew {
  const s = getAppSettings();
  current = computeWhatsNew(currentVersion, s.lastSeenVersion, s.pendingReleaseNotes);
  updateAppSettings({
    lastSeenVersion: currentVersion,
    pendingReleaseNotes: current.show ? null : s.pendingReleaseNotes,
  });
  return current;
}

export function getWhatsNew(): WhatsNew | null {
  return current;
}

export function dismissWhatsNew(): void {
  if (current) current = { ...current, show: false };
}
