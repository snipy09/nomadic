import fs from 'fs';
import path from 'path';
import type { Database, SqlJsStatic } from 'sql.js';
import type { DbStartupState } from '../../shared/ipc.js';

// Local data safety (F10): integrity check, atomic writes, backups and recovery.

export const BACKUPS_KEPT = 5;

export interface IntegrityResult {
  ok: boolean;
  /** First problems SQLite reported (empty when ok). */
  problems: string[];
}

export function checkIntegrity(db: Database): IntegrityResult {
  try {
    const res = db.exec('PRAGMA integrity_check(20)');
    const rows = (res[0]?.values ?? []).map((r) => String(r[0]));
    const ok = rows.length === 1 && rows[0] === 'ok';
    return { ok, problems: ok ? [] : rows };
  } catch (err: unknown) {
    return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
  }
}

/**
 * Writes via a temp file, fsync, then rename, so a crash or power cut leaves
 * either the old file or the new one, never a half-written database.
 */
export function writeFileAtomic(filePath: string, data: Uint8Array): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

export function backupsDir(dbFilePath: string): string {
  return path.join(path.dirname(dbFilePath), 'backups');
}

export interface BackupInfo {
  path: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
}

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

/** Newest first. Only files this module created (`<db name>.<stamp>.<label>.bak`). */
export function listBackups(dbFilePath: string): BackupInfo[] {
  const dir = backupsDir(dbFilePath);
  if (!fs.existsSync(dir)) return [];
  const prefix = `${path.basename(dbFilePath)}.`;
  return fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix) && n.endsWith('.bak'))
    .map((name) => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      return { path: p, name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Copies the current database file into backups/ and keeps the newest BACKUPS_KEPT. Returns the backup path. */
export function createBackup(dbFilePath: string, label: string, now = new Date()): string | null {
  if (!fs.existsSync(dbFilePath)) return null;
  const dir = backupsDir(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').slice(0, 40);
  const dest = path.join(dir, `${path.basename(dbFilePath)}.${stamp(now)}.${safeLabel}.bak`);
  fs.copyFileSync(dbFilePath, dest);
  pruneBackups(dbFilePath);
  return dest;
}

export function pruneBackups(dbFilePath: string, keep = BACKUPS_KEPT): void {
  for (const b of listBackups(dbFilePath).slice(keep)) {
    try { fs.unlinkSync(b.path); } catch { /* best effort */ }
  }
}

/** Moves an unreadable database aside (never deletes it) and returns the new path. */
export function quarantine(dbFilePath: string, now = new Date()): string {
  const dest = `${dbFilePath}.corrupt-${stamp(now)}`;
  fs.renameSync(dbFilePath, dest);
  return dest;
}

/** Loads a database file and returns it only if SQLite's integrity check passes. */
export function openVerified(SQL: SqlJsStatic, filePath: string): Database | null {
  let db: Database | null = null;
  try {
    db = new SQL.Database(fs.readFileSync(filePath));
    if (checkIntegrity(db).ok) return db;
  } catch { /* unreadable */ }
  try { db?.close(); } catch { /* ignore */ }
  return null;
}

export type StartupState = DbStartupState;

export interface OpenResult {
  db: Database;
  state: StartupState;
  /** Where the damaged file was moved, when there was one. */
  quarantinedTo?: string;
  restoredFrom?: string;
}

/**
 * Opens the database at startup. A file that cannot be read or fails the
 * integrity check is moved aside and the newest backup that passes is used.
 * Only when nothing usable exists does it start empty (synced data is pulled
 * again from the account after sign-in).
 */
export function openOrRecover(SQL: SqlJsStatic, dbFilePath: string, now = new Date()): OpenResult {
  if (!fs.existsSync(dbFilePath)) return { db: new SQL.Database(), state: 'new' };

  const current = openVerified(SQL, dbFilePath);
  if (current) return { db: current, state: 'ok' };

  const quarantinedTo = quarantine(dbFilePath, now);
  for (const b of listBackups(dbFilePath)) {
    const restored = openVerified(SQL, b.path);
    if (restored) {
      fs.copyFileSync(b.path, dbFilePath);
      return { db: restored, state: 'recovered_from_backup', quarantinedTo, restoredFrom: b.path };
    }
  }
  return { db: new SQL.Database(), state: 'reset_after_corruption', quarantinedTo };
}
