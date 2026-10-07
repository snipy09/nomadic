import type { Database, SqlValue } from 'sql.js';
import type { LearningEventInput, LearningEventRecord } from '../../shared/ipc.js';

/**
 * SQLite access for Learn. Pure functions over a sql.js `Database` (no
 * persistence, no network) so they can be tested in memory;
 * `services/learning.ts` adds persistence and Supabase sync.
 *
 * `learning_events` is append-only: content columns can never change (a
 * trigger aborts the update). Only `synced_at` and the owner of events
 * recorded before sign-in (`user_id = 'local'`) are ever written after insert.
 * Streaks, mastery, the Today queue and the path are derived from these rows.
 *
 * Learn v2 keeps the student's roadmap, schedule, projects and problem notes as
 * JSON documents in `learn_state` (one row per user and kind), synced with
 * Supabase migration 027; `draft` is a local-only kind (an unaccepted roadmap).
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

/** Event types allowed by local migration 9 (v1 plus Learn v2). Fixed text: never edit a shipped migration. */
const V2_EVENT_TYPES_SQL =
  "'lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known', " +
  "'task_done', 'task_skipped', 'task_moved', 'problem_attempted', 'stage_done', 'project_started', 'project_done', 'roadmap_accepted'";

/**
 * Local migration 9 (Learn v2): recreates learning_events with the widened type
 * CHECK (SQLite cannot alter a CHECK: new table, copy, drop, rename, then the index
 * and append-only trigger again), adds learn_state and drops the v1 goal table.
 */
export function migrateLearnV2Schema(db: Database): void {
  db.run(`
    DROP TRIGGER IF EXISTS trg_learning_events_append_only;
    CREATE TABLE learning_events_v2 (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN (${V2_EVENT_TYPES_SQL})),
      skill_id   TEXT,
      item_id    TEXT,
      payload    TEXT NOT NULL DEFAULT '{}',
      duration_s INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at  TEXT
    );
    INSERT INTO learning_events_v2 (id, user_id, type, skill_id, item_id, payload, duration_s, created_at, synced_at)
      SELECT id, user_id, type, skill_id, item_id, payload, duration_s, created_at, synced_at FROM learning_events;
    DROP TABLE learning_events;
    ALTER TABLE learning_events_v2 RENAME TO learning_events;
    CREATE INDEX IF NOT EXISTS idx_learning_events_user_time ON learning_events (user_id, created_at);
    CREATE TRIGGER IF NOT EXISTS trg_learning_events_append_only
      BEFORE UPDATE OF id, type, skill_id, item_id, payload, duration_s, created_at ON learning_events
      BEGIN SELECT RAISE(ABORT, 'learning_events is append-only'); END;

    CREATE TABLE IF NOT EXISTS learn_state (
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('roadmap', 'schedule', 'projects', 'notes', 'draft')),
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at  TEXT,
      PRIMARY KEY (user_id, kind)
    );

    DROP TABLE IF EXISTS learning_goal;
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

/** Moves events and Learn documents recorded before sign-in to the signed-in user. */
export function claimLocalRows(db: Database, userId: string): void {
  if (userId === LOCAL_USER) return;
  db.run('UPDATE learning_events SET user_id = ? WHERE user_id = ?', [userId, LOCAL_USER]);
  // A document the account already has wins over one made before sign-in.
  db.run('DELETE FROM learn_state WHERE user_id = ? AND kind IN (SELECT kind FROM learn_state WHERE user_id = ?)', [LOCAL_USER, userId]);
  db.run('UPDATE learn_state SET user_id = ? WHERE user_id = ?', [userId, LOCAL_USER]);
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

// ── Learn v2 state documents ───────────────────────────────────────────────

export type LearnDocKind = 'roadmap' | 'schedule' | 'projects' | 'notes' | 'draft';
/** Kinds that sync to the account (draft stays on this device). */
export const SYNCED_DOC_KINDS = ['roadmap', 'schedule', 'projects', 'notes'] as const;
export type SyncedDocKind = (typeof SYNCED_DOC_KINDS)[number];

export interface LearnDoc {
  kind: LearnDocKind;
  value: unknown;
  updated_at: string;
  synced_at: string | null;
}

function parseJson(v: SqlValue | undefined): unknown {
  try {
    return JSON.parse(String(v ?? 'null'));
  } catch {
    return null;
  }
}

function toDoc(r: Record<string, SqlValue>): LearnDoc {
  return { kind: String(r.kind) as LearnDocKind, value: parseJson(r.value), updated_at: String(r.updated_at), synced_at: nullable(r.synced_at) };
}

/** The user's document of a kind (their own first, else one made before sign-in). */
export function getDoc(db: Database, userId: string, kind: LearnDocKind): LearnDoc | null {
  const r = rows(
    db,
    'SELECT * FROM learn_state WHERE user_id IN (?, ?) AND kind = ? ORDER BY (user_id = ?) DESC LIMIT 1',
    [...owners(userId), kind, userId]
  )[0];
  return r ? toDoc(r) : null;
}

/** Writes a document; `syncedAt` null marks it for upload. */
export function putDoc(db: Database, userId: string, kind: LearnDocKind, value: unknown, updatedAt: string, syncedAt: string | null = null): void {
  db.run(
    `INSERT INTO learn_state (user_id, kind, value, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
    [userId, kind, JSON.stringify(value), updatedAt, syncedAt]
  );
}

export function deleteDoc(db: Database, userId: string, kind: LearnDocKind): void {
  db.run('DELETE FROM learn_state WHERE user_id IN (?, ?) AND kind = ?', [...owners(userId), kind]);
}

/** Synced kinds changed on this device since their last upload. */
export function unsyncedDocs(db: Database, userId: string): LearnDoc[] {
  return rows(
    db,
    `SELECT * FROM learn_state WHERE user_id = ? AND synced_at IS NULL AND kind IN (${SYNCED_DOC_KINDS.map(() => '?').join(',')}) ORDER BY kind`,
    [userId, ...SYNCED_DOC_KINDS]
  ).map(toDoc);
}

export function countUnsyncedDocs(db: Database, userId: string): number {
  const r = rows(
    db,
    `SELECT COUNT(*) AS n FROM learn_state WHERE user_id IN (?, ?) AND synced_at IS NULL AND kind IN (${SYNCED_DOC_KINDS.map(() => '?').join(',')})`,
    [...owners(userId), ...SYNCED_DOC_KINDS]
  );
  return Number(r[0]?.n ?? 0);
}

/** Marks a document uploaded, only if it did not change since it was read for the push. */
export function markDocSynced(db: Database, userId: string, kind: LearnDocKind, updatedAt: string, at: string): void {
  db.run('UPDATE learn_state SET synced_at = ? WHERE user_id = ? AND kind = ? AND updated_at = ?', [at, userId, kind, updatedAt]);
}

/**
 * Applies a document pulled from the account: the newer `updated_at` wins, so a
 * newer local edit is kept (and pushed) and an older one is replaced.
 */
export function mergePulledDoc(db: Database, userId: string, kind: SyncedDocKind, value: unknown, updatedAt: string, at: string): boolean {
  const local = getDoc(db, userId, kind);
  if (local && local.updated_at >= updatedAt) return false;
  putDoc(db, userId, kind, value, updatedAt, at);
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
