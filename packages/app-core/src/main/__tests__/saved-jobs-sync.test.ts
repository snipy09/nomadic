import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { migrateSavedJobsSyncSchema, reconcileSavedJobs } from '../services/saved-jobs-sync';

describe('saved jobs across desktop and phone', () => {
  it('removes uploaded saves the account no longer has and uploads the ones that never reached it', () => {
    const cloud = new Set(['https://a.test/1']);
    const local = [
      { apply_url: 'https://a.test/1', synced_at: '2026-10-01 10:00:00' },
      { apply_url: 'https://a.test/2', synced_at: '2026-10-01 10:00:00' },
      { apply_url: 'https://a.test/3', synced_at: null },
    ];
    expect(reconcileSavedJobs(local, cloud)).toEqual({ remove: ['https://a.test/2'], upload: ['https://a.test/3'] });
  });

  it('keeps everything when the account has every local save', () => {
    expect(reconcileSavedJobs([{ apply_url: 'u', synced_at: null }], new Set(['u']))).toEqual({ remove: [], upload: [] });
  });

  it('adds the upload marker column once', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE saved_jobs (id INTEGER PRIMARY KEY, apply_url TEXT UNIQUE, saved_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    migrateSavedJobsSyncSchema(db);
    migrateSavedJobsSyncSchema(db);
    const cols = db.exec('PRAGMA table_info(saved_jobs)')[0].values.map((v) => String(v[1]));
    expect(cols.filter((c) => c === 'synced_at')).toHaveLength(1);
  });
});
