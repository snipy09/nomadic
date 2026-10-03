import type { Database, SqlValue } from 'sql.js';
import type { LearningEventInput, LearningEventRecord, LearningGoal, LearningGoalInput } from '../../shared/ipc.js';

/**
 * SQLite access for Learn. Pure functions over a sql.js `Database` (no
 * persistence, no network) so they can be tested in memory;
 * `services/learning.ts` adds persistence and Supabase sync.
 *
 * `learning_events` is append-only: content columns can never change (a
 * trigger aborts the update). Only `synced_at` and the owner of events
 * recorded before sign-in (`user_id = 'local'`) are ever written after insert.
 * Streaks, mastery, the Today queue and the path are derived from these rows.
 */

/** Owner of events recorded while no account session is active. */
export const LOCAL_USER = 'local';
/** Upper bound on events loaded into the renderer at once. */
export const EVENTS_LIMIT = 20_000;

export function migrateLearningSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known')),
      skill_id   TEXT,
      item_id    TEXT,
      payload    TEXT NOT NULL DEFAULT '{}',
      duration_s INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_learning_events_user_time ON learning_events (user_id, created_at);
    CREATE TRIGGER IF NOT EXISTS trg_learning_events_append_only
      BEFORE UPDATE OF id, type, skill_id, item_id, payload, duration_s, created_at ON learning_events
      BEGIN SELECT RAISE(ABORT, 'learning_events is append-only'); END;

    CREATE TABLE IF NOT EXISTS learning_goal (
      user_id         TEXT PRIMARY KEY,
      track_id        TEXT NOT NULL,
      horizon_months  INTEGER NOT NULL,
      daily_hours     INTEGER NOT NULL,
      started_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      synced_at       TEXT,
      synced_track_id TEXT
    );

    CREATE TABLE IF NOT EXISTS learning_sync_state (
      user_id      TEXT PRIMARY KEY,
      pulled_until TEXT NOT NULL
    );
  `);
}

function rows(db: Database, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

const nullable = (v: SqlValue | undefined) => (v === null || v === undefined ? null : String(v));

function parsePayload(v: SqlValue | undefined): Record<string, unknown> {
  try {
    const p = JSON.parse(String(v ?? '{}'));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function toRecord(r: Record<string, SqlValue>): LearningEventRecord {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    type: String(r.type) as LearningEventRecord['type'],
    skill_id: nullable(r.skill_id),
    item_id: nullable(r.item_id),
    payload: parsePayload(r.payload),
    duration_s: Number(r.duration_s) || 0,
    created_at: String(r.created_at),
  };
}

/** Owners whose rows belong to `userId` (their own plus not-yet-claimed local rows). */
const owners = (userId: string): SqlValue[] => (userId === LOCAL_USER ? [LOCAL_USER, LOCAL_USER] : [userId, LOCAL_USER]);

/** Inserts events (ignoring ids already stored) and returns the stored rows for those ids. */
export function insertEvents(
  db: Database,
  userId: string,
  events: LearningEventInput[],
  syncedAt: string | null = null
): { inserted: number; records: LearningEventRecord[] } {
  let inserted = 0;
  for (const e of events) {
    db.run(
      `INSERT OR IGNORE INTO learning_events (id, user_id, type, skill_id, item_id, payload, duration_s, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, userId, e.type, e.skill_id, e.item_id, JSON.stringify(e.payload ?? {}), e.duration_s ?? 0, e.created_at, syncedAt]
    );
    inserted += db.getRowsModified();
  }
  if (!events.length) return { inserted, records: [] };
  const ids = events.map((e) => e.id);
  const records = rows(
    db,
    `SELECT * FROM learning_events WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id IN (?, ?) ORDER BY created_at, id`,
    [...ids, ...owners(userId)]
  ).map(toRecord);
  return { inserted, records };
}

/** The user's events, oldest first (the most recent `limit` when there are more). */
export function listEvents(db: Database, userId: string, limit = EVENTS_LIMIT): LearningEventRecord[] {
  return rows(
    db,
    `SELECT * FROM (
       SELECT * FROM learning_events WHERE user_id IN (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?
     ) ORDER BY created_at ASC, id ASC`,
    [...owners(userId), limit]
  ).map(toRecord);
}

/** Moves events and the goal recorded before sign-in to the signed-in user. */
export function claimLocalRows(db: Database, userId: string): void {
  if (userId === LOCAL_USER) return;
  db.run('UPDATE learning_events SET user_id = ? WHERE user_id = ?', [userId, LOCAL_USER]);
  const own = rows(db, 'SELECT 1 FROM learning_goal WHERE user_id = ?', [userId]).length > 0;
  if (own) db.run('DELETE FROM learning_goal WHERE user_id = ?', [LOCAL_USER]);
  else db.run('UPDATE learning_goal SET user_id = ? WHERE user_id = ?', [userId, LOCAL_USER]);
}

export function unsyncedEvents(db: Database, userId: string, limit = 500): LearningEventRecord[] {
  return rows(
    db,
    'SELECT * FROM learning_events WHERE user_id = ? AND synced_at IS NULL ORDER BY created_at, id LIMIT ?',
    [userId, limit]
  ).map(toRecord);
}

export function countUnsynced(db: Database, userId: string): number {
  const r = rows(db, 'SELECT COUNT(*) AS n FROM learning_events WHERE user_id IN (?, ?) AND synced_at IS NULL', owners(userId));
  return Number(r[0]?.n ?? 0);
}

export function markEventsSynced(db: Database, ids: string[], at: string): void {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    db.run(`UPDATE learning_events SET synced_at = ? WHERE id IN (${chunk.map(() => '?').join(',')})`, [at, ...chunk]);
  }
}

function toGoal(r: Record<string, SqlValue>): LearningGoal {
  return {
    track_id: String(r.track_id),
    horizon_months: Number(r.horizon_months) as LearningGoal['horizon_months'],
    daily_hours: Number(r.daily_hours) as LearningGoal['daily_hours'],
    started_at: String(r.started_at),
    updated_at: String(r.updated_at),
  };
}

export function getGoal(db: Database, userId: string): LearningGoal | null {
  const r = rows(
    db,
    'SELECT * FROM learning_goal WHERE user_id IN (?, ?) ORDER BY (user_id = ?) DESC LIMIT 1',
    [...owners(userId), userId]
  )[0];
  return r ? toGoal(r) : null;
}

/**
 * Sets the goal. Changing pace keeps `started_at`; changing role starts a new
 * track. Progress lives in events keyed by skill, so neither loses anything.
 */
export function saveGoal(db: Database, userId: string, input: LearningGoalInput, now: string): LearningGoal {
  const prev = rows(db, 'SELECT * FROM learning_goal WHERE user_id = ?', [userId])[0];
  const startedAt = prev && String(prev.track_id) === input.track_id ? String(prev.started_at) : now;
  db.run(
    `INSERT INTO learning_goal (user_id, track_id, horizon_months, daily_hours, started_at, updated_at, synced_at, synced_track_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       track_id = excluded.track_id, horizon_months = excluded.horizon_months, daily_hours = excluded.daily_hours,
       started_at = excluded.started_at, updated_at = excluded.updated_at, synced_at = NULL`,
    [userId, input.track_id, input.horizon_months, input.daily_hours, startedAt, now]
  );
  return toGoal(rows(db, 'SELECT * FROM learning_goal WHERE user_id = ?', [userId])[0]);
}

/** The goal to push, and the previously synced track to archive first (when the role changed). */
export function goalToSync(db: Database, userId: string): { goal: LearningGoal; archiveTrackId: string | null } | null {
  const r = rows(db, 'SELECT * FROM learning_goal WHERE user_id = ? AND synced_at IS NULL', [userId])[0];
  if (!r) return null;
  const prev = nullable(r.synced_track_id);
  return { goal: toGoal(r), archiveTrackId: prev && prev !== String(r.track_id) ? prev : null };
}

export function markGoalSynced(db: Database, userId: string, goal: LearningGoal, at: string): void {
  // Only if unchanged since it was read for the push.
  db.run(
    'UPDATE learning_goal SET synced_at = ?, synced_track_id = track_id WHERE user_id = ? AND updated_at = ? AND track_id = ?',
    [at, userId, goal.updated_at, goal.track_id]
  );
}

/** Restores a goal from the cloud only when this device has none. */
export function restoreGoal(db: Database, userId: string, goal: LearningGoal, at: string): boolean {
  if (getGoal(db, userId)) return false;
  db.run(
    `INSERT INTO learning_goal (user_id, track_id, horizon_months, daily_hours, started_at, updated_at, synced_at, synced_track_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, goal.track_id, goal.horizon_months, goal.daily_hours, goal.started_at, goal.updated_at, at, goal.track_id]
  );
  return true;
}

export function getPulledUntil(db: Database, userId: string): string | null {
  return nullable(rows(db, 'SELECT pulled_until FROM learning_sync_state WHERE user_id = ?', [userId])[0]?.pulled_until);
}

export function setPulledUntil(db: Database, userId: string, at: string): void {
  db.run(
    `INSERT INTO learning_sync_state (user_id, pulled_until) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET pulled_until = excluded.pulled_until`,
    [userId, at]
  );
}
