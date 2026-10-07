import type { Database } from 'sql.js';
import type { DbMigrationStatus } from '../../shared/ipc.js';

// Versioned local SQLite migrations (F10). The schema version lives in SQLite's
// own PRAGMA user_version. Each migration runs in one transaction together with
// the version bump, so a failure leaves the database exactly at the previous
// version. A backup of the file is taken before the first pending migration.

export interface LocalMigration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export type MigrationStatus = DbMigrationStatus;

export interface MigrationOutcome {
  status: MigrationStatus;
  from: number;
  to: number;
  /** Names of migrations that ran, in order. */
  applied: string[];
  error?: string;
}

export function getUserVersion(db: Database): number {
  const res = db.exec('PRAGMA user_version');
  return Number(res[0]?.values[0]?.[0] ?? 0);
}

/** Throws if versions are not 1..n, strictly increasing. Catches a mis-numbered migration in tests. */
export function assertMigrationList(migrations: readonly LocalMigration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Local migration "${m.name}" has version ${m.version}, expected ${i + 1}`);
  });
}

export function latestVersion(migrations: readonly LocalMigration[]): number {
  return migrations.length ? migrations[migrations.length - 1].version : 0;
}

export function runLocalMigrations(
  db: Database,
  migrations: readonly LocalMigration[],
  hooks: { beforeMigrate?: (from: number, to: number) => void } = {}
): MigrationOutcome {
  assertMigrationList(migrations);
  const from = getUserVersion(db);
  const target = latestVersion(migrations);

  if (from > target) return { status: 'newer_than_app', from, to: from, applied: [] };
  const pending = migrations.filter((m) => m.version > from);
  if (!pending.length) return { status: 'up_to_date', from, to: from, applied: [] };

  hooks.beforeMigrate?.(from, target);

  const applied: string[] = [];
  let current = from;
  for (const m of pending) {
    try {
      db.run('BEGIN');
      m.up(db);
      db.run(`PRAGMA user_version = ${m.version}`);
      db.run('COMMIT');
      applied.push(m.name);
      current = m.version;
    } catch (err: unknown) {
      try { db.run('ROLLBACK'); } catch { /* no open transaction */ }
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'failed', from, to: current, applied, error: `Migration ${m.version} (${m.name}) failed: ${msg}` };
    }
  }
  return { status: 'migrated', from, to: current, applied };
}
