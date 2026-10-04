import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import {
  followUpsToPush,
  getApplication,
  listApplications,
  mergeCloudApplications,
  migrateApplicationsSchema,
  migrateFollowUpSchema,
  setApplicationFollowUp,
  recordApplication,
  removeApplication,
  setApplicationNotes,
  setApplicationStatus,
  timestampMs,
  toIso,
} from '../services/applications-store';

// The pre-F5 table, as created by older installs.
const LEGACY_TABLE = `CREATE TABLE local_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  status TEXT DEFAULT 'applied',
  mode TEXT CHECK (mode IN ('semi-auto', 'autonomous', 'outreach', 'manual')),
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  db = new SQL.Database();
  db.run(LEGACY_TABLE);
});

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';

describe('migrateApplicationsSchema', () => {
  it('dedupes legacy rows by URL, backfills history and is idempotent', () => {
    db.run(`INSERT INTO local_applications (company, title, apply_url, status, mode, applied_at) VALUES
      ('Acme', 'SDE', 'https://a.co/1', 'applied', 'autonomous', '2026-09-01 08:00:00'),
      ('Acme', 'SDE', 'https://a.co/1', 'interviewing', 'autonomous', '2026-09-02 08:00:00'),
      ('Beta', 'Analyst', 'https://b.co/2', 'failed', 'semi-auto', '2026-09-03 08:00:00')`);
    migrateApplicationsSchema(db);
    migrateApplicationsSchema(db);
    const apps = listApplications(db);
    expect(apps.map((a) => [a.apply_url, a.status])).toEqual([
      ['https://b.co/2', 'failed'],
      ['https://a.co/1', 'interviewing'],
    ]);
    expect(apps[1].history).toEqual([{ status: 'interviewing', changed_at: '2026-09-02 08:00:00' }]);
    expect(apps[1].notes).toBe('');
    expect(() => db.run(`INSERT INTO local_applications (company, title, apply_url) VALUES ('X', 'Y', 'https://a.co/1')`)).toThrow();
  });
});

describe('application writes', () => {
  beforeEach(() => migrateApplicationsSchema(db));

  it('records, then updates the same URL without duplicating, keeping applied date and notes', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'failed', mode: 'autonomous' }, T1);
    setApplicationNotes(db, id, 'Referred by Priya', T1);
    const again = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'applied', mode: 'autonomous' }, T2);
    expect(again).toBe(id);
    const rec = getApplication(db, id)!;
    expect(listApplications(db)).toHaveLength(1);
    expect(rec.applied_at).toBe(T1);
    expect(rec.notes).toBe('Referred by Priya');
    expect(rec.history.map((h) => h.status)).toEqual(['failed', 'applied']);
  });

  it('appends a history entry per status change and ignores no-op changes', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    setApplicationStatus(db, id, 'interviewing', T2);
    setApplicationStatus(db, id, 'interviewing', T3);
    const rec = setApplicationStatus(db, id, 'offered', T3)!;
    expect(rec.status).toBe('offered');
    expect(rec.updated_at).toBe(T3);
    expect(rec.history).toEqual([
      { status: 'applied', changed_at: T1 },
      { status: 'interviewing', changed_at: T2 },
      { status: 'offered', changed_at: T3 },
    ]);
    expect(setApplicationStatus(db, 999, 'offered', T3)).toBeNull();
  });

  it('removes an application with its history', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    expect(removeApplication(db, id)?.apply_url).toBe('https://a.co/1');
    expect(listApplications(db)).toEqual([]);
    expect(db.exec('SELECT COUNT(*) FROM application_status_history')[0].values[0][0]).toBe(0);
    expect(removeApplication(db, id)).toBeNull();
  });
});

describe('mergeCloudApplications', () => {
  beforeEach(() => migrateApplicationsSchema(db));

  it('restores applications with notes and history after a reinstall', () => {
    const n = mergeCloudApplications(db, [
      {
        company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'interviewing', mode: 'manual',
        applied_at: T1, updated_at: T2, notes: 'Round 1 on Friday',
        status_history: [{ status: 'applied', changed_at: T1 }, { status: 'interviewing', changed_at: T2 }],
      },
      { company: '', title: 'x', apply_url: 'https://bad' },
    ], T3);
    expect(n).toBe(1);
    const [rec] = listApplications(db);
    expect(rec.status).toBe('interviewing');
    expect(rec.notes).toBe('Round 1 on Friday');
    expect(rec.history.map((h) => h.status)).toEqual(['applied', 'interviewing']);
  });

  it('keeps newer local edits, takes newer cloud edits, and unions history without duplicates', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    setApplicationStatus(db, id, 'offered', T3);
    mergeCloudApplications(db, [{ company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'interviewing', updated_at: T2,
      status_history: [{ status: 'applied', changed_at: T1 }, { status: 'interviewing', changed_at: T2 }] }], T3);
    let rec = getApplication(db, id)!;
    expect(rec.status).toBe('offered');
    expect(rec.history.map((h) => h.status)).toEqual(['applied', 'interviewing', 'offered']);

    mergeCloudApplications(db, [{ company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'rejected', updated_at: '2026-10-04T00:00:00.000Z',
      status_history: JSON.stringify([{ status: 'rejected', changed_at: '2026-10-04T00:00:00.000Z' }, { bogus: true }]) }], T3);
    rec = getApplication(db, id)!;
    expect(rec.status).toBe('rejected');
    expect(rec.history).toHaveLength(4);
  });
});

describe('timestamps', () => {
  it('reads SQLite timestamps as UTC', () => {
    expect(timestampMs('2026-10-01 10:00:00')).toBe(Date.parse(T1));
    expect(toIso('2026-10-01 10:00:00')).toBe(T1);
    expect(Number.isNaN(timestampMs('nope'))).toBe(true);
    expect(toIso('nope')).toBe('nope');
  });
});

describe('follow-up dates (local migration 6)', () => {
  it('sets, clears and validates; the migration is idempotent', () => {
    migrateApplicationsSchema(db);
    migrateFollowUpSchema(db);
    migrateFollowUpSchema(db);
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    expect(getApplication(db, id)!.follow_up_at).toBeNull();
    expect(setApplicationFollowUp(db, id, '2026-10-10', T2)!.follow_up_at).toBe('2026-10-10');
    expect(setApplicationFollowUp(db, id, null, T3)!.follow_up_at).toBeNull();
    expect(() => setApplicationFollowUp(db, id, '10/10/2026', T3)).toThrow(/YYYY-MM-DD/);
    expect(setApplicationFollowUp(db, 999, '2026-10-10', T3)).toBeNull();
  });
});

describe('follow-up dates from the account (026)', () => {
  beforeEach(() => { migrateApplicationsSchema(db); migrateFollowUpSchema(db); });
  const cloudRow = (extra: Record<string, unknown>) => ({ company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1', status: 'applied', applied_at: T1, ...extra });

  it('restores the follow-up date on a new computer', () => {
    mergeCloudApplications(db, [cloudRow({ updated_at: T2, follow_up_at: '2026-10-20' })], T3);
    expect(listApplications(db)[0].follow_up_at).toBe('2026-10-20');
    expect(followUpsToPush(db, [cloudRow({ follow_up_at: '2026-10-20' })])).toEqual([]);
  });

  it('newer side wins; a newer cloud clear removes the local date', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    setApplicationFollowUp(db, id, '2026-10-10', T2);
    mergeCloudApplications(db, [cloudRow({ updated_at: T1, follow_up_at: null })], T3);
    expect(getApplication(db, id)!.follow_up_at).toBe('2026-10-10');
    mergeCloudApplications(db, [cloudRow({ updated_at: T3, follow_up_at: null })], T3);
    expect(getApplication(db, id)!.follow_up_at).toBeNull();
  });

  it('ignores invalid cloud dates and rows from a server without the column', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    setApplicationFollowUp(db, id, '2026-10-10', T1);
    mergeCloudApplications(db, [cloudRow({ updated_at: T2, follow_up_at: 'soon' })], T3);
    expect(getApplication(db, id)!.follow_up_at).toBe('2026-10-10');
    mergeCloudApplications(db, [cloudRow({ updated_at: T3 })], T3);
    expect(getApplication(db, id)!.follow_up_at).toBe('2026-10-10');
  });

  it('lists local dates the account does not have yet (only when the server sends the column)', () => {
    const id = recordApplication(db, { company: 'Acme', title: 'SDE', apply_url: 'https://a.co/1' }, T1);
    setApplicationFollowUp(db, id, '2026-10-10', T2);
    expect(followUpsToPush(db, [cloudRow({ follow_up_at: null })])).toEqual([{ applyUrl: 'https://a.co/1', followUpAt: '2026-10-10' }]);
    expect(followUpsToPush(db, [cloudRow({})])).toEqual([]);
    expect(followUpsToPush(db, [cloudRow({ apply_url: 'https://other', follow_up_at: null })])).toEqual([]);
  });
});
