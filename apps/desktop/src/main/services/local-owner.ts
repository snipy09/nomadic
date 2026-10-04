import type { Database } from 'sql.js';

/**
 * The local database caches one account's data (profile, tracker, saved and hidden jobs, resumes,
 * remembered answers). It records which account that is, and when a different account signs in
 * on this computer the previous account's cached data is cleared before the new account's cloud
 * data is pulled, so the new account starts with its own profile (and onboarding when it has none).
 * Learning and practice rows are keyed by user id and the offline sign-in cache by email, so they stay.
 */

export function migrateLocalMetaSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

const OWNER_KEY = 'owner_user_id';

/** Tables holding data of the signed-in account that have no user id column. */
const ACCOUNT_TABLES = [
  'local_applications',
  'application_status_history',
  'saved_jobs',
  'hidden_jobs',
  'resumes',
  'cached_form_answers',
  'outreach_contacts',
  'user_activity_log',
  'secure_secrets',
];

function hasTable(db: Database, name: string): boolean {
  const r = db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return r.length > 0 && r[0].values.length > 0;
}

export function getLocalOwner(db: Database): string | null {
  const r = db.exec(`SELECT value FROM local_meta WHERE key = ?`, [OWNER_KEY]);
  return r.length && r[0].values.length ? String(r[0].values[0][0]) : null;
}

function setLocalOwner(db: Database, userId: string): void {
  db.run(`INSERT INTO local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [OWNER_KEY, userId]);
}

function storedProfileEmail(db: Database): string {
  const r = db.exec(`SELECT email FROM master_profile WHERE id = 1`);
  return r.length && r[0].values.length ? String(r[0].values[0][0] ?? '').trim().toLowerCase() : '';
}

/**
 * Marks the local data as belonging to `userId`. Returns true when another account's data was
 * cleared. Data from before owners were recorded is adopted by the first account to sign in,
 * unless the stored profile carries a different email.
 */
export function claimLocalDataFor(db: Database, userId: string, email?: string): boolean {
  if (!userId) return false;
  const owner = getLocalOwner(db);
  if (owner === userId) return false;
  if (owner === null) {
    const stored = storedProfileEmail(db);
    if (!stored || !email || stored === email.trim().toLowerCase()) {
      setLocalOwner(db, userId);
      return false;
    }
  }
  for (const t of ACCOUNT_TABLES) if (hasTable(db, t)) db.run(`DELETE FROM ${t}`);
  db.run(`DELETE FROM master_profile`);
  db.run(
    `INSERT INTO master_profile (id, first_name, last_name, email, phone, desired_title, tech_stack, sponsorship, onboarding_completed)
     VALUES (1, '', '', '', '', '', '', 'No', 0)`
  );
  setLocalOwner(db, userId);
  return true;
}
