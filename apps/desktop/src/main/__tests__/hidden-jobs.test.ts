import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

let db: Database;
const persistDb = vi.fn();
vi.mock('../db.js', () => ({ getDb: () => db, persistDb: () => persistDb() }));
vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));

const { getHiddenJobs, hideJob, migrateHiddenJobsSchema, unhideJob } = await import('../services/hidden-jobs');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  db = new SQL.Database();
  migrateHiddenJobsSchema(db);
  persistDb.mockClear();
});

describe('hidden jobs store', () => {
  it('hides, lists newest first, and persists each write', () => {
    expect(hideJob({ applyUrl: 'https://a.co/1', title: 'SDE', company: 'Acme' })).toEqual({ success: true });
    db.run("UPDATE hidden_jobs SET hidden_at = '2026-10-01 00:00:00'");
    hideJob({ applyUrl: 'https://b.co/2', title: 'Analyst', company: 'Beta' });
    expect(getHiddenJobs().map((h) => h.applyUrl)).toEqual(['https://b.co/2', 'https://a.co/1']);
    expect(persistDb).toHaveBeenCalledTimes(2);
  });

  it('hiding twice keeps one row and updates the title', () => {
    hideJob({ applyUrl: 'https://a.co/1', title: 'Old' });
    hideJob({ applyUrl: 'https://a.co/1', title: 'New', company: 'Acme' });
    expect(getHiddenJobs()).toEqual([expect.objectContaining({ applyUrl: 'https://a.co/1', title: 'New', company: 'Acme' })]);
  });

  it('unhide removes the job; the migration is idempotent', () => {
    hideJob({ applyUrl: 'https://a.co/1' });
    expect(unhideJob('https://a.co/1')).toEqual({ success: true });
    expect(getHiddenJobs()).toEqual([]);
    expect(() => migrateHiddenJobsSchema(db)).not.toThrow();
  });

  it('reports a failure instead of throwing', () => {
    db.run('DROP TABLE hidden_jobs');
    expect(hideJob({ applyUrl: 'https://a.co/1' }).success).toBe(false);
    expect(getHiddenJobs()).toEqual([]);
  });
});
