/** Pure helpers for the Data & privacy section. No React, no IPC. */
import type { Tone } from '@nomadic/ui';

export interface DbHealth {
  startup: 'new' | 'ok' | 'recovered_from_backup' | 'reset_after_corruption';
  migration: 'up_to_date' | 'migrated' | 'failed' | 'newer_than_app';
  migrationError?: string;
  schemaVersion: number;
  latestSchemaVersion: number;
}

export interface HealthSummary {
  tone: Tone;
  title: string;
  detail: string;
}

/** What the user is told about the local database. Problems first; nothing reassuring is made up. */
export function describeHealth(health: DbHealth | null): HealthSummary {
  if (!health) {
    return { tone: 'warning', title: 'Local data status unknown', detail: 'The local database did not report its status. Copy diagnostics and contact support.' };
  }
  if (health.migration === 'failed') {
    return {
      tone: 'danger',
      title: 'Database update failed',
      detail: 'Your data is unchanged and a backup was kept. Some features may not work until this is fixed. Copy diagnostics and contact support.',
    };
  }
  if (health.migration === 'newer_than_app') {
    return { tone: 'warning', title: 'Newer data version', detail: 'This data was saved by a newer version of Nomadic. Update Nomadic to use it safely.' };
  }
  if (health.startup === 'recovered_from_backup') {
    return { tone: 'warning', title: 'Restored from backup', detail: 'The database file was damaged, so Nomadic restored the most recent backup. The damaged file was kept next to it.' };
  }
  if (health.startup === 'reset_after_corruption') {
    return {
      tone: 'danger',
      title: 'Local data was reset',
      detail: 'The database file was damaged and no usable backup existed. Synced data returns after you sign in; the damaged file was kept for support.',
    };
  }
  return { tone: 'success', title: 'Local data is healthy', detail: `Integrity check passed at startup. Schema version ${health.schemaVersion}.` };
}

export function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return 'Unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBackupLine(count: number, latestAt: string | null): string {
  if (count === 0) return 'No backups yet. One is taken automatically before every database update.';
  const when = latestAt ? new Date(latestAt).toLocaleString() : 'unknown time';
  return `${count} backup${count === 1 ? '' : 's'} kept; latest ${when}.`;
}

export interface DeleteForm {
  confirmEmail: string;
  password: string;
}

export type DeleteErrors = Partial<Record<keyof DeleteForm, string>>;

export function validateDelete(form: DeleteForm, accountEmail: string | null | undefined): DeleteErrors {
  const e: DeleteErrors = {};
  const typed = form.confirmEmail.trim().toLowerCase();
  if (!typed) e.confirmEmail = 'Type your account email.';
  else if (accountEmail && typed !== accountEmail.trim().toLowerCase()) e.confirmEmail = 'This does not match your account email.';
  if (!form.password) e.password = 'Enter your password.';
  return e;
}
