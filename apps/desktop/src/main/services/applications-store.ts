import type { Database, SqlValue } from 'sql.js';
import type { ApplicationRecord, ApplicationStatusEvent } from '../../shared/ipc.js';

/**
 * SQLite access for the applications tracker. Pure functions over a sql.js
 * `Database` (no persistence, no network) so they can be tested in memory;
 * `services/applications.ts` adds persistence and cloud sync.
 *
 * `apply_url` is the sync key (unique locally and per user in Supabase).
 * `application_status_history` is append-only: rows are inserted, never
 * updated; they are removed only with their application.
 */

export const LIST_LIMIT = 500;
const HISTORY_MAX = 200;

/** Idempotent schema changes for existing installs; run on every start. */
export function migrateApplicationsSchema(db: Database): void {
  try { db.run('ALTER TABLE local_applications ADD COLUMN notes TEXT'); } catch { /* exists */ }
  try { db.run('ALTER TABLE local_applications ADD COLUMN updated_at TEXT'); } catch { /* exists */ }
  db.run(`
    CREATE TABLE IF NOT EXISTS application_status_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      status         TEXT NOT NULL,
      changed_at     TEXT NOT NULL,
      UNIQUE (application_id, status, changed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_application_status_history_app ON application_status_history (application_id);
  `);
  // Older builds inserted a new row on every log/pull of the same URL. Keep the
  // newest row per URL, then make apply_url the unique sync key.
  db.run(`
    DELETE FROM local_applications
    WHERE id NOT IN (SELECT MAX(id) FROM local_applications GROUP BY apply_url);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_local_applications_apply_url ON local_applications (apply_url);
    DELETE FROM application_status_history
    WHERE application_id NOT IN (SELECT id FROM local_applications);
  `);
  // Every application has at least its current status in history.
  db.run(`
    INSERT OR IGNORE INTO application_status_history (application_id, status, changed_at)
    SELECT a.id, COALESCE(a.status, 'applied'), COALESCE(a.applied_at, CURRENT_TIMESTAMP)
    FROM local_applications a
    WHERE NOT EXISTS (SELECT 1 FROM application_status_history h WHERE h.application_id = a.id);
  `);
}

function rows(db: Database, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

const text = (v: SqlValue | undefined): string => (v === null || v === undefined ? '' : String(v));

function toRecord(r: Record<string, SqlValue>, history: ApplicationStatusEvent[]): ApplicationRecord {
  return {
    id: Number(r.id),
    company: text(r.company),
    title: text(r.title),
    apply_url: text(r.apply_url),
    status: text(r.status) || 'applied',
    mode: r.mode === null || r.mode === undefined ? null : String(r.mode),
    applied_at: text(r.applied_at),
    updated_at: r.updated_at === null || r.updated_at === undefined ? null : String(r.updated_at),
    notes: text(r.notes),
    history,
  };
}

function historyFor(db: Database, ids: number[]): Map<number, ApplicationStatusEvent[]> {
  const map = new Map<number, ApplicationStatusEvent[]>();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  for (const h of rows(
    db,
    `SELECT application_id, status, changed_at FROM application_status_history
     WHERE application_id IN (${placeholders}) ORDER BY changed_at ASC, id ASC`,
    ids,
  )) {
    const id = Number(h.application_id);
    const list = map.get(id) ?? [];
    list.push({ status: text(h.status), changed_at: text(h.changed_at) });
    map.set(id, list);
  }
  return map;
}

export function listApplications(db: Database, limit = LIST_LIMIT): ApplicationRecord[] {
  const apps = rows(db, 'SELECT * FROM local_applications ORDER BY applied_at DESC, id DESC LIMIT ?', [limit]);
  const hist = historyFor(db, apps.map((a) => Number(a.id)));
  return apps.map((a) => toRecord(a, hist.get(Number(a.id)) ?? []));
}

export function getApplication(db: Database, id: number | string): ApplicationRecord | null {
  const [row] = rows(db, 'SELECT * FROM local_applications WHERE id = ?', [Number(id)]);
  if (!row) return null;
  return toRecord(row, historyFor(db, [Number(row.id)]).get(Number(row.id)) ?? []);
}

function findIdByUrl(db: Database, applyUrl: string): number | null {
  const [row] = rows(db, 'SELECT id FROM local_applications WHERE apply_url = ?', [applyUrl]);
  return row ? Number(row.id) : null;
}

function appendHistory(db: Database, id: number, status: string, at: string): void {
  db.run('INSERT OR IGNORE INTO application_status_history (application_id, status, changed_at) VALUES (?, ?, ?)', [id, status, at]);
}

export interface RecordApplicationInput {
  company: string;
  title: string;
  apply_url: string;
  status?: string;
  mode?: string;
  notes?: string;
}

/**
 * Insert an application, or update the one with the same `apply_url`
 * (keeping its applied date, notes unless given, and history). A status
 * change is appended to history. Returns the row id.
 */
export function recordApplication(db: Database, app: RecordApplicationInput, now: string): number {
  const status = app.status || 'applied';
  const existing = findIdByUrl(db, app.apply_url);
  if (existing === null) {
    db.run(
      `INSERT INTO local_applications (company, title, apply_url, status, mode, applied_at, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [app.company, app.title, app.apply_url, status, app.mode || 'autonomous', now, app.notes ?? null, now],
    );
    const id = findIdByUrl(db, app.apply_url)!;
    appendHistory(db, id, status, now);
    return id;
  }
  const before = getApplication(db, existing)!;
  db.run(
    `UPDATE local_applications SET company = ?, title = ?, status = ?, mode = ?, updated_at = ?,
       notes = COALESCE(?, notes) WHERE id = ?`,
    [app.company, app.title, status, app.mode || before.mode || 'autonomous', now, app.notes ?? null, existing],
  );
  if (before.status !== status) appendHistory(db, existing, status, now);
  return existing;
}

/** Sets the status and appends it to history. Null when the row does not exist. */
export function setApplicationStatus(db: Database, id: number | string, status: string, now: string): ApplicationRecord | null {
  const before = getApplication(db, id);
  if (!before) return null;
  if (before.status === status) return before;
  db.run('UPDATE local_applications SET status = ?, updated_at = ? WHERE id = ?', [status, now, before.id]);
  appendHistory(db, before.id, status, now);
  return getApplication(db, before.id);
}

export function setApplicationNotes(db: Database, id: number | string, notes: string, now: string): ApplicationRecord | null {
  const before = getApplication(db, id);
  if (!before) return null;
  db.run('UPDATE local_applications SET notes = ?, updated_at = ? WHERE id = ?', [notes, now, before.id]);
  return getApplication(db, before.id);
}

/** Deletes the application and its history. Returns the deleted row, or null. */
export function removeApplication(db: Database, id: number | string): ApplicationRecord | null {
  const before = getApplication(db, id);
  if (!before) return null;
  db.run('DELETE FROM application_status_history WHERE application_id = ?', [before.id]);
  db.run('DELETE FROM local_applications WHERE id = ?', [before.id]);
  return before;
}

/** Milliseconds for ISO or SQLite `YYYY-MM-DD HH:MM:SS` (UTC) timestamps; NaN when unparseable. */
export function timestampMs(ts: string | null | undefined): number {
  if (!ts) return NaN;
  const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(ts);
  return Date.parse(sqlite ? `${ts.replace(' ', 'T')}Z` : ts);
}

/** ISO-8601 for any timestamp `timestampMs` understands; the input unchanged otherwise. */
export function toIso(ts: string): string {
  const ms = timestampMs(ts);
  return Number.isNaN(ms) ? ts : new Date(ms).toISOString();
}

function parseHistory(raw: unknown): ApplicationStatusEvent[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, HISTORY_MAX)
    .filter((e): e is { status: unknown; changed_at: unknown } => Boolean(e) && typeof e === 'object')
    .filter((e) => typeof e.status === 'string' && e.status.length > 0 && e.status.length <= 100 && typeof e.changed_at === 'string' && !Number.isNaN(timestampMs(e.changed_at)))
    .map((e) => ({ status: String(e.status), changed_at: String(e.changed_at) }));
}

/**
 * Merge applications pulled from Supabase into the local DB. New URLs are
 * inserted; for existing ones the newer side (by `updated_at`) wins for
 * status, notes, company and title. History is always unioned.
 */
export function mergeCloudApplications(db: Database, cloud: Array<Record<string, unknown>>, now: string): number {
  let merged = 0;
  for (const app of cloud) {
    const applyUrl = typeof app.apply_url === 'string' ? app.apply_url : '';
    const company = typeof app.company === 'string' ? app.company : '';
    const title = typeof app.title === 'string' ? app.title : '';
    if (!applyUrl || !company || !title) continue;
    const status = typeof app.status === 'string' && app.status ? app.status : 'applied';
    const mode = typeof app.mode === 'string' && ['semi-auto', 'autonomous', 'outreach', 'manual'].includes(app.mode) ? app.mode : 'autonomous';
    const appliedAt = typeof app.applied_at === 'string' && app.applied_at ? app.applied_at : now;
    const updatedAt = typeof app.updated_at === 'string' && app.updated_at ? app.updated_at : appliedAt;
    const notes = typeof app.notes === 'string' ? app.notes : null;
    const history = parseHistory(app.status_history);

    let id = findIdByUrl(db, applyUrl);
    if (id === null) {
      db.run(
        `INSERT INTO local_applications (company, title, apply_url, status, mode, applied_at, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [company, title, applyUrl, status, mode, appliedAt, notes, updatedAt],
      );
      id = findIdByUrl(db, applyUrl)!;
      if (!history.length) appendHistory(db, id, status, appliedAt);
    } else {
      const local = getApplication(db, id)!;
      const localMs = timestampMs(local.updated_at ?? local.applied_at);
      const cloudMs = timestampMs(updatedAt);
      if (Number.isNaN(localMs) || (!Number.isNaN(cloudMs) && cloudMs > localMs)) {
        db.run(
          'UPDATE local_applications SET company = ?, title = ?, status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?',
          [company, title, status, notes, updatedAt, id],
        );
      }
    }
    for (const h of history) appendHistory(db, id, h.status, h.changed_at);
    merged++;
  }
  return merged;
}
