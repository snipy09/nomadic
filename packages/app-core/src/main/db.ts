import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { answerKey } from './services/form-answers.js';
import { LOCAL_MIGRATIONS } from './local-db/schema.js';
import type { LocalDbHealth } from '../shared/ipc.js';
import { getUserVersion, latestVersion, runLocalMigrations, type MigrationOutcome } from './local-db/migrations.js';
import { backupsDir, createBackup, openOrRecover, writeFileAtomic } from './local-db/safety.js';

let db: Database | null = null;
let dbFilePath = '';
let userDataDir = '';

export type { LocalDbHealth };
export { LOCAL_MIGRATIONS };

let health: LocalDbHealth | null = null;

export function getLocalDbHealth(): LocalDbHealth | null {
  return health;
}

export function getLocalDbPath(): string {
  return dbFilePath;
}

export async function initLocalDatabase(userDataPath: string): Promise<Database> {
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  userDataDir = userDataPath;
  dbFilePath = path.join(userDataPath, 'job_automator_local.db');

  let wasmBinary: Buffer | undefined;
  const locateWasm = (file: string) => {
    const appDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const resourcesDir = process.resourcesPath || '';

    const candidates = [
      path.join(appDir, file),
      path.join(appDir, 'sql-wasm.wasm'),
      path.join(appDir, '../main/sql-wasm.wasm'),
      path.join(resourcesDir, file),
      path.join(resourcesDir, 'sql-wasm.wasm'),
      path.join(resourcesDir, 'app.asar/out/main/sql-wasm.wasm'),
      path.join(resourcesDir, 'out/main/sql-wasm.wasm'),
      path.join(process.cwd(), 'out/main', file),
      path.join(process.cwd(), 'apps/desktop/out/main', file),
      path.join(process.cwd(), 'apps/mac/out/main', file),
      path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        try {
          if (!wasmBinary) wasmBinary = fs.readFileSync(c);
          return c;
        } catch {}
      }
    }
    return file;
  };

  const wasmPath = locateWasm('sql-wasm.wasm');
  const sqlOptions: any = { locateFile: () => wasmPath };
  if (wasmBinary) {
    sqlOptions.wasmBinary = wasmBinary;
  }

  const SQL = await initSqlJs(sqlOptions);

  // Open, verifying integrity; a damaged file is moved aside and the newest good backup restored.
  const opened = openOrRecover(SQL, dbFilePath);
  db = opened.db;
  if (opened.quarantinedTo) console.error('[SQLite] Database failed its integrity check; moved to', opened.quarantinedTo);
  if (opened.restoredFrom) console.warn('[SQLite] Restored from backup', opened.restoredFrom);

  // Versioned migrations, with a backup of the file before the first pending one.
  let outcome: MigrationOutcome;
  try {
    outcome = runLocalMigrations(db, LOCAL_MIGRATIONS, {
      beforeMigrate: (from, to) => {
        if (opened.state !== 'new') createBackup(dbFilePath, `before-v${to}-from-v${from}`);
      },
    });
  } catch (err: unknown) {
    // Backup failed: do not migrate without one.
    const msg = err instanceof Error ? err.message : String(err);
    outcome = { status: 'failed', from: getUserVersion(db), to: getUserVersion(db), applied: [], error: `Could not back up before updating the database: ${msg}` };
  }
  if (outcome.status === 'failed') console.error('[SQLite]', outcome.error);

  health = {
    startup: opened.state,
    migration: outcome.status,
    migrationError: outcome.error,
    schemaVersion: getUserVersion(db),
    latestSchemaVersion: latestVersion(LOCAL_MIGRATIONS),
    integrity: 'ok',
    checkedAt: new Date().toISOString(),
  };

  // Ensure default master profile row exists
  try {
    const profCheck = db.exec('SELECT COUNT(*) as count FROM master_profile WHERE id = 1');
    const profCount = profCheck.length && profCheck[0].values.length ? Number(profCheck[0].values[0][0]) : 0;
    if (profCount === 0) {
      db.run(
        `INSERT OR IGNORE INTO master_profile (id, first_name, last_name, email, phone, desired_title, tech_stack, sponsorship, onboarding_completed)
         VALUES (1, '', '', '', '', '', '', 'No', 0)`
      );
    }
  } catch (err: any) {
    console.warn('[SQLite] Error initializing master profile:', err.message);
  }

  persistDb();
  console.log('[SQLite (sql.js)] Initialized local database at', dbFilePath, `(schema v${health.schemaVersion})`);
  return db;
}


/** Flush in-memory DB to disk. Call after every write. */
export function persistDb(): void {
  if (!db || !dbFilePath) return;
  try {
    writeFileAtomic(dbFilePath, db.export());
  } catch (err: any) {
    console.error('[SQLite] Failed to persist DB to disk:', err.message);
  }
}

/**
 * Removes every local trace of the account (database, its backups and any quarantined
 * copies) and starts a fresh empty database. Used after the account is deleted.
 */
export async function wipeLocalData(): Promise<void> {
  if (!userDataDir) return;
  try { db?.close(); } catch { /* already closed */ }
  db = null;
  const dir = path.dirname(dbFilePath);
  const base = path.basename(dbFilePath);
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name === base || name.startsWith(`${base}.`)) fs.rmSync(path.join(dir, name), { force: true });
  }
  fs.rmSync(backupsDir(dbFilePath), { recursive: true, force: true });
  await initLocalDatabase(userDataDir);
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized! Call initLocalDatabase first.');
  return db;
}

// ── Activity Logging ──────────────────────────────────────────────
export function logUserActivityDb(activityType: string, details?: string): void {
  try {
    const database = getDb();
    database.run(
      'INSERT INTO user_activity_log (activity_type, details, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [activityType, details || null]
    );
    persistDb();
  } catch (err: any) {
    console.warn('[Activity DB] Failed to log activity:', err?.message);
  }
}

export function getCachedFormAnswerDb(questionText: string): string | null {
  try {
    const database = getDb();
    const cleanKey = answerKey(questionText);
    const res = database.exec('SELECT answer_text FROM cached_form_answers WHERE question_key = ? LIMIT 1', [cleanKey]);
    if (res.length && res[0].values.length) {
      return String(res[0].values[0][0]);
    }
  } catch {}
  return null;
}

export function saveCachedFormAnswerDb(questionText: string, answerText: string): void {
  try {
    const database = getDb();
    const cleanKey = answerKey(questionText);
    if (!cleanKey) return;
    database.run(`
      INSERT INTO cached_form_answers (question_key, answer_text)
      VALUES (?, ?)
      ON CONFLICT(question_key) DO UPDATE SET answer_text = excluded.answer_text
    `, [cleanKey, answerText]);
    persistDb();
  } catch {}
}

export function getCuratedLearningResourcesDb(): Array<{
  id: number;
  title: string;
  youtubeUrl: string;
  topic: string;
  targetRole: string;
  summary: string;
  duration: string;
  createdAt: string;
}> {
  try {
    const database = getDb();
    const res = database.exec('SELECT id, title, youtube_url, topic, target_role, summary, duration, created_at FROM curated_learning_resources ORDER BY id DESC');
    if (!res.length || !res[0].values.length) return [];
    return res[0].values.map(v => ({
      id: Number(v[0]),
      title: String(v[1]),
      youtubeUrl: String(v[2]),
      topic: String(v[3]),
      targetRole: String(v[4]),
      summary: String(v[5] || ''),
      duration: String(v[6] || '20 mins'),
      createdAt: String(v[7] || ''),
    }));
  } catch {
    return [];
  }
}

