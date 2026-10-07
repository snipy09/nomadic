import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

let db: Database;
const persistDb = vi.fn();
vi.mock('../db.js', () => ({ getDb: () => db, persistDb: () => persistDb() }));
vi.mock('../services/app-context.js', () => ({ log: vi.fn(), errorMessage: (e: unknown) => String(e) }));
let session: { userId: string; sessionToken: string; deviceFingerprint: string } | null = null;
vi.mock('../services/session.js', () => ({ getActiveSyncSession: () => session }));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({}) }));
const syncHideJob = vi.fn().mockResolvedValue({ ok: true });
const syncUnhideJob = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@job-automator/supabase', () => ({
  syncHideJob: (...a: unknown[]) => syncHideJob(...a),
  syncUnhideJob: (...a: unknown[]) => syncUnhideJob(...a),
}));

const { getHiddenJobs, hideJob, mergeCloudHiddenJobs, migrateHiddenJobsSchema, unhideJob } = await import('../services/hidden-jobs');

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

describe('hidden jobs account sync (026)', () => {
  beforeEach(() => { syncHideJob.mockClear(); syncUnhideJob.mockClear(); session = null; });
  const active = { userId: 'u', sessionToken: 't', deviceFingerprint: 'f' };

  it('pushes hide and unhide when signed in, and stays local when not', () => {
    hideJob({ applyUrl: 'https://a.co/1', title: 'SDE', company: 'Acme' });
    expect(syncHideJob).not.toHaveBeenCalled();
    session = active;
    hideJob({ applyUrl: 'https://a.co/1', title: 'SDE', company: 'Acme' });
    expect(syncHideJob).toHaveBeenCalledWith({}, 'u', 't', 'f', { apply_url: 'https://a.co/1', title: 'SDE', company: 'Acme' });
    unhideJob('https://a.co/1');
    expect(syncUnhideJob).toHaveBeenCalledWith({}, 'u', 't', 'f', 'https://a.co/1');
  });

  it('restores hidden jobs from the account and returns local ones it lacks', () => {
    hideJob({ applyUrl: 'https://local.co/1', title: 'Local', company: 'L' });
    hideJob({ applyUrl: 'https://both.co/1', title: 'Both', company: 'B' });
    const missing = mergeCloudHiddenJobs(db, [
      { apply_url: 'https://both.co/1', title: 'Both', company: 'B', hidden_at: '2026-10-01T00:00:00Z' },
      { apply_url: 'https://cloud.co/1', title: 'Cloud', company: 'C', hidden_at: '2026-10-02T00:00:00Z' },
      { apply_url: '', title: 'bad', company: '', hidden_at: '' },
    ]);
    expect(getHiddenJobs().map((h) => h.applyUrl).sort()).toEqual(['https://both.co/1', 'https://cloud.co/1', 'https://local.co/1']);
    expect(missing).toEqual([{ applyUrl: 'https://local.co/1', title: 'Local', company: 'L', hiddenAt: expect.any(String) }]);
  });
});
