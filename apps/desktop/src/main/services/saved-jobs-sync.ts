import type { Database } from 'sql.js';

/**
 * Saved jobs on two devices (desktop and phone) sync through the account. Each local row records when it
 * reached the account (`synced_at`, local migration 11). On a pull from the account:
 *  - a local row the account lacks but that was uploaded before was unsaved on the other device: remove it;
 *  - a local row the account lacks that never reached it (offline, failed upload): upload it now.
 */

/** Local migration 11. */
export function migrateSavedJobsSyncSchema(db: Database): void {
  const cols = db.exec('PRAGMA table_info(saved_jobs)')[0]?.values.map((v) => String(v[1])) ?? [];
  if (!cols.includes('synced_at')) db.run('ALTER TABLE saved_jobs ADD COLUMN synced_at TEXT');
}

export interface LocalSavedRow {
  apply_url: string;
  synced_at: unknown;
}

export function reconcileSavedJobs(local: LocalSavedRow[], cloudUrls: ReadonlySet<string>): { remove: string[]; upload: string[] } {
  const remove: string[] = [];
  const upload: string[] = [];
  for (const row of local) {
    if (cloudUrls.has(row.apply_url)) continue;
    if (row.synced_at) remove.push(row.apply_url);
    else upload.push(row.apply_url);
  }
  return { remove, upload };
}
