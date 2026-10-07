import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type { LocalDbHealth } from '@nomadic/app-core/shared/ipc';
import { getUserVersion, latestVersion, runLocalMigrations } from '@nomadic/app-core/main/local-db/migrations';
import { LOCAL_MIGRATIONS } from '@nomadic/app-core/main/local-db/schema';
import { idbDelete, idbGet, idbSet } from './idb';

/**
 * The Android app's local database: the desktop's SQLite schema and migrations (sql.js), stored in IndexedDB
 * instead of a file. Replaces packages/app-core/src/main/db.ts in the APK build (same exports the reused services use).
 * Like the desktop it is a cache and outbox: the account on the server is the source of truth.
 */

export type { LocalDbHealth };
export { LOCAL_MIGRATIONS };

const KEY = 'nomadic.db';
let db: Database | null = null;
let health: LocalDbHealth | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function getLocalDbHealth(): LocalDbHealth | null {
  return health;
}

export function getLocalDbPath(): string {
  return 'indexeddb://nomadic/nomadic.db';
}

export async function initLocalDatabase(_userDataPath?: string): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let state: LocalDbHealth['startup'] = 'new';
  const saved = await idbGet(KEY).catch(() => null);
  if (saved instanceof Uint8Array && saved.length > 0) {
    try {
      const candidate = new SQL.Database(saved);
      const check = candidate.exec('PRAGMA integrity_check');
      if (String(check[0]?.values[0]?.[0]) !== 'ok') throw new Error('integrity check failed');
      db = candidate;
      state = 'ok';
    } catch (err) {
      // A damaged cache is replaced; the account data comes back on the next sign-in pull.
      console.error('[SQLite] local cache was damaged and was reset', err);
      state = 'reset_after_corruption';
    }
  }
  if (!db) db = new SQL.Database();

  const outcome = runLocalMigrations(db, LOCAL_MIGRATIONS);
  if (outcome.status === 'failed') console.error('[SQLite]', outcome.error);
  health = {
    startup: state,
    migration: outcome.status,
    migrationError: outcome.error,
    schemaVersion: getUserVersion(db),
    latestSchemaVersion: latestVersion(LOCAL_MIGRATIONS),
    integrity: 'ok',
    checkedAt: new Date().toISOString(),
  };
  try {
    db.run(
      `INSERT OR IGNORE INTO master_profile (id, first_name, last_name, email, phone, desired_title, tech_stack, sponsorship, onboarding_completed)
       VALUES (1, '', '', '', '', '', '', 'No', 0)`
    );
  } catch (err) {
    console.warn('[SQLite] master profile row', err);
  }
  await flush();
  return db;
}

async function flush(): Promise<void> {
  if (!db) return;
  await idbSet(KEY, db.export());
}

/** Writes are batched for a moment: sql.js exports the whole database on each save. */
export function persistDb(): void {
  if (!db) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flush().catch((err) => console.error('[SQLite] Failed to save the local cache', err));
  }, 150);
}

/** Saves now (the app is going to the background). */
export async function persistDbNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await flush();
}

export async function wipeLocalData(): Promise<void> {
  try {
    db?.close();
  } catch {
    /* already closed */
  }
  db = null;
  await idbDelete(KEY);
  await initLocalDatabase();
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized! Call initLocalDatabase first.');
  return db;
}

export function logUserActivityDb(activityType: string, details?: string): void {
  try {
    getDb().run('INSERT INTO user_activity_log (activity_type, details, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [
      activityType,
      details || null,
    ]);
    persistDb();
  } catch (err) {
    console.warn('[Activity DB] Failed to log activity:', err);
  }
}

/** Form answers are remembered only by the desktop apply flow. */
export function getCachedFormAnswerDb(): string | null {
  return null;
}
export function saveCachedFormAnswerDb(): void {}
export function getCuratedLearningResourcesDb(): [] {
  return [];
}
