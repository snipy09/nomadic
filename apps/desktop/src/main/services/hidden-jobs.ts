import type { Database } from 'sql.js';
import type { HiddenJob, HideJobInput } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { log } from './app-context.js';

/** Local migration 5: jobs the user marked "Not interested". Keyed by apply URL like saved_jobs. */
export function migrateHiddenJobsSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS hidden_jobs (
      apply_url TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function getHiddenJobs(): HiddenJob[] {
  try {
    const res = getDb().exec('SELECT apply_url, title, company, hidden_at FROM hidden_jobs ORDER BY hidden_at DESC');
    if (!res.length) return [];
    return res[0].values.map(([applyUrl, title, company, hiddenAt]) => ({
      applyUrl: String(applyUrl),
      title: String(title ?? ''),
      company: String(company ?? ''),
      hiddenAt: String(hiddenAt ?? ''),
    }));
  } catch (err: unknown) {
    log(`[Hidden Jobs] Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export function hideJob(job: HideJobInput): { success: boolean; error?: string } {
  try {
    getDb().run(
      `INSERT INTO hidden_jobs (apply_url, title, company) VALUES (?, ?, ?)
       ON CONFLICT(apply_url) DO UPDATE SET title = excluded.title, company = excluded.company`,
      [job.applyUrl, job.title ?? '', job.company ?? '']
    );
    persistDb();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Hidden Jobs] Hide error: ${msg}`);
    return { success: false, error: msg };
  }
}

export function unhideJob(applyUrl: string): { success: boolean; error?: string } {
  try {
    getDb().run('DELETE FROM hidden_jobs WHERE apply_url = ?', [applyUrl]);
    persistDb();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Hidden Jobs] Unhide error: ${msg}`);
    return { success: false, error: msg };
  }
}
