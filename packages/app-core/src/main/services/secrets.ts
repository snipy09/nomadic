import type { Database } from 'sql.js';
import { getDb, persistDb } from '../db.js';

/**
 * OS-keychain backed secret storage for the API keys / passwords that used to
 * live in plaintext `master_profile` columns.
 *
 * Values are encrypted with Electron `safeStorage` (DPAPI on Windows, Keychain
 * on macOS, libsecret/kwallet on Linux) and stored as base64 blobs in the
 * `secure_secrets` table. The legacy columns are kept in the schema but nulled
 * once a value has been migrated.
 *
 * When OS encryption is unavailable (e.g. a Linux box without a keyring) the
 * store degrades to the previous behaviour: values stay in the legacy columns
 * so the app keeps working, and they are migrated on a later start once
 * encryption becomes available.
 */

export const SECRET_FIELDS = ['groq_api_key', 'smtp_password', 'gemini_api_key'] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

/** The subset of Electron's `safeStorage` this module needs (mockable in tests). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

let storage: SafeStorageLike | null = null;

export function configureSecretStorage(impl: SafeStorageLike | null): void {
  storage = impl;
}

export function isSecretEncryptionAvailable(): boolean {
  if (!storage) return false;
  try {
    return storage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function ensureSecretsTable(db: Database = getDb()): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS secure_secrets (
      name       TEXT PRIMARY KEY,
      cipher     TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function readCipher(db: Database, field: SecretField): string | null {
  const res = db.exec('SELECT cipher FROM secure_secrets WHERE name = ?', [field]);
  if (!res.length || !res[0].values.length) return null;
  return String(res[0].values[0][0]);
}

function readLegacyColumn(db: Database, field: SecretField): string | null {
  try {
    const res = db.exec(`SELECT ${field} FROM master_profile WHERE id = 1`);
    if (!res.length || !res[0].values.length) return null;
    const v = res[0].values[0][0];
    return v === null || v === undefined ? null : String(v);
  } catch {
    return null;
  }
}

function storeEncrypted(db: Database, field: SecretField, value: string): void {
  const cipher = storage!.encryptString(value).toString('base64');
  db.run(
    `INSERT INTO secure_secrets (name, cipher, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(name) DO UPDATE SET cipher = excluded.cipher, updated_at = CURRENT_TIMESTAMP`,
    [field, cipher]
  );
}

/**
 * Returns the decrypted secret, or the legacy plaintext column when no
 * encrypted value exists. `null` when nothing is stored.
 */
export function readSecret(field: SecretField, db: Database = getDb()): string | null {
  ensureSecretsTable(db);
  const cipher = readCipher(db, field);
  if (cipher !== null) {
    if (!isSecretEncryptionAvailable()) return readLegacyColumn(db, field);
    try {
      return storage!.decryptString(Buffer.from(cipher, 'base64'));
    } catch (err) {
      console.warn(`[Secrets] Could not decrypt ${field}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
  return readLegacyColumn(db, field);
}

/**
 * Stores a secret. Returns the value that must be written to the legacy
 * `master_profile` column by the caller's upsert: `null` when the value went
 * to encrypted storage, or the plaintext value when encryption is unavailable.
 * Passing `null`/`undefined` clears the secret (same as the old column write).
 * Does not persist the DB; callers persist after their own writes.
 */
export function writeSecret(
  field: SecretField,
  value: string | null | undefined,
  db: Database = getDb()
): string | null {
  ensureSecretsTable(db);
  if (value === null || value === undefined) {
    db.run('DELETE FROM secure_secrets WHERE name = ?', [field]);
    return null;
  }
  if (isSecretEncryptionAvailable()) {
    try {
      storeEncrypted(db, field, value);
      return null;
    } catch (err) {
      console.warn(`[Secrets] Encryption failed for ${field}, keeping legacy storage:`, err instanceof Error ? err.message : err);
    }
  }
  // No OS encryption: drop any stale encrypted copy and keep the legacy column.
  db.run('DELETE FROM secure_secrets WHERE name = ?', [field]);
  return value;
}

/** Writes secrets back into a `master_profile` row object (same keys as before). */
export function overlaySecrets<T extends Record<string, unknown>>(row: T, db: Database = getDb()): T {
  const out: Record<string, unknown> = { ...row };
  for (const field of SECRET_FIELDS) {
    const value = readSecret(field, db);
    if (value !== null || field in out) out[field] = value;
  }
  return out as T;
}

/**
 * One-time (idempotent) startup migration: moves any plaintext values from the
 * legacy `master_profile` columns into encrypted storage and nulls the
 * columns. Returns the number of secrets migrated.
 */
export function migrateLegacySecrets(db: Database = getDb(), persist: () => void = persistDb): number {
  ensureSecretsTable(db);
  if (!isSecretEncryptionAvailable()) {
    console.warn('[Secrets] OS encryption unavailable — API keys stay in local SQLite until it is.');
    return 0;
  }
  let migrated = 0;
  for (const field of SECRET_FIELDS) {
    const legacy = readLegacyColumn(db, field);
    if (legacy === null) continue;
    try {
      storeEncrypted(db, field, legacy);
      db.run(`UPDATE master_profile SET ${field} = NULL WHERE id = 1`);
      migrated++;
    } catch (err) {
      console.warn(`[Secrets] Migration skipped for ${field}:`, err instanceof Error ? err.message : err);
    }
  }
  if (migrated > 0) persist();
  return migrated;
}
