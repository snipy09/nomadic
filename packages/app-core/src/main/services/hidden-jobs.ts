import type { Database } from 'sql.js';
import { syncHideJob, syncUnhideJob, type CloudHiddenJob } from '@job-automator/supabase';
import type { HiddenJob, HideJobInput } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

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

function listHidden(db: Database): HiddenJob[] {
  const res = db.exec('SELECT apply_url, title, company, hidden_at FROM hidden_jobs ORDER BY hidden_at DESC');
  if (!res.length) return [];
  return res[0].values.map(([applyUrl, title, company, hiddenAt]) => ({
    applyUrl: String(applyUrl),
    title: String(title ?? ''),
    company: String(company ?? ''),
    hiddenAt: String(hiddenAt ?? ''),
  }));
}

export function getHiddenJobs(): HiddenJob[] {
  try {
    return listHidden(getDb());
  } catch (err: unknown) {
    log(`[Hidden Jobs] Fetch error: ${errorMessage(err)}`);
    return [];
  }
}

/** Best effort: the local table is the source of truth; the account copy follows it. */
function pushHiddenJob(job: HideJobInput): void {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return;
  syncHideJob(supabase, active.userId, active.sessionToken, active.deviceFingerprint, {
    apply_url: job.applyUrl,
    title: job.title ?? '',
    company: job.company ?? '',
  })
    .then((res) => { if (!res.ok) log(`[Cloud Sync] Hidden job not synced: ${res.error ?? 'unknown error'}`); })
    .catch((err) => log(`[Cloud Sync] Hidden job not synced: ${errorMessage(err)}`));
}

function pushUnhide(applyUrl: string): void {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return;
  syncUnhideJob(supabase, active.userId, active.sessionToken, active.deviceFingerprint, applyUrl)
    .then((res) => { if (!res.ok) log(`[Cloud Sync] Unhide not synced: ${res.error ?? 'unknown error'}`); })
    .catch((err) => log(`[Cloud Sync] Unhide not synced: ${errorMessage(err)}`));
}

export function hideJob(job: HideJobInput): { success: boolean; error?: string } {
  try {
    getDb().run(
      `INSERT INTO hidden_jobs (apply_url, title, company) VALUES (?, ?, ?)
       ON CONFLICT(apply_url) DO UPDATE SET title = excluded.title, company = excluded.company`,
      [job.applyUrl, job.title ?? '', job.company ?? '']
    );
    persistDb();
    pushHiddenJob(job);
    return { success: true };
  } catch (err: unknown) {
    const msg = errorMessage(err);
    log(`[Hidden Jobs] Hide error: ${msg}`);
    return { success: false, error: msg };
  }
}

export function unhideJob(applyUrl: string): { success: boolean; error?: string } {
  try {
    getDb().run('DELETE FROM hidden_jobs WHERE apply_url = ?', [applyUrl]);
    persistDb();
    pushUnhide(applyUrl);
    return { success: true };
  } catch (err: unknown) {
    const msg = errorMessage(err);
    log(`[Hidden Jobs] Unhide error: ${msg}`);
    return { success: false, error: msg };
  }
}

/** Same `YYYY-MM-DD HH:MM:SS` UTC form as CURRENT_TIMESTAMP, so the list sorts correctly; '' when unparseable. */
function sqliteTime(ts: string | undefined): string {
  const ms = ts ? Date.parse(ts) : NaN;
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Restore hidden jobs pulled from the account (union: nothing local is removed) and return the
 * local ones the account does not have yet, so the caller can upload them.
 */
export function mergeCloudHiddenJobs(db: Database, cloud: CloudHiddenJob[]): HiddenJob[] {
  const inCloud = new Set<string>();
  for (const j of cloud) {
    if (!j.apply_url) continue;
    inCloud.add(j.apply_url);
    db.run(
      `INSERT INTO hidden_jobs (apply_url, title, company, hidden_at) VALUES (?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP))
       ON CONFLICT(apply_url) DO NOTHING`,
      [j.apply_url, j.title ?? '', j.company ?? '', sqliteTime(j.hidden_at)]
    );
  }
  return listHidden(db).filter((h) => !inCloud.has(h.applyUrl));
}
