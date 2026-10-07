import type { Database, SqlValue } from 'sql.js';
import { PracticeAttemptSchema, type PracticeAttempt } from '@job-automator/learning';

/**
 * Local cache of practice attempts the server accepted (F8). Pure functions
 * over a sql.js `Database` so they can be tested in memory. Rows are only
 * written after `learning_record_events` accepted the attempt, or when they
 * come back from `learning_pull_events`; the server stays the source of truth
 * for the daily limit.
 */

export const ATTEMPTS_LIST_LIMIT = 2000;

export function migratePracticeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      entry_id    TEXT NOT NULL,
      entry_kind  TEXT NOT NULL,
      skill_id    TEXT,
      topics      TEXT NOT NULL DEFAULT '[]',
      difficulty  TEXT,
      grading     TEXT NOT NULL,
      outcome     TEXT NOT NULL,
      score       REAL NOT NULL,
      mode        TEXT NOT NULL,
      mock_id     TEXT,
      duration_s  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_created ON practice_attempts (user_id, created_at DESC);
  `);
}

/** Insert once by id (attempts are immutable). Returns true when a row was added. */
export function saveAttempt(db: Database, userId: string, a: PracticeAttempt): boolean {
  db.run(
    `INSERT OR IGNORE INTO practice_attempts
       (id, user_id, entry_id, entry_kind, skill_id, topics, difficulty, grading, outcome, score, mode, mock_id, duration_s, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.id, userId, a.entry_id, a.entry_kind, a.skill_id, JSON.stringify(a.topics), a.difficulty, a.grading, a.outcome, a.score, a.mode, a.mock_id, a.duration_s, a.created_at],
  );
  return db.getRowsModified() > 0;
}

function parseTopics(v: SqlValue): unknown {
  try {
    return JSON.parse(String(v ?? '[]'));
  } catch {
    return [];
  }
}

/** One user's attempts, newest first; rows that no longer parse are skipped. */
export function listAttempts(db: Database, userId: string, limit = ATTEMPTS_LIST_LIMIT): PracticeAttempt[] {
  const res = db.exec('SELECT * FROM practice_attempts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', [userId, limit]);
  if (!res.length) return [];
  const cols = res[0].columns;
  const out: PracticeAttempt[] = [];
  for (const values of res[0].values) {
    // user_id is dropped by the schema (zod strips unknown keys).
    const r = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
    const parsed = PracticeAttemptSchema.safeParse({ ...r, topics: parseTopics(r.topics), score: Number(r.score), duration_s: Number(r.duration_s) });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
