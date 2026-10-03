import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

// The secrets module must never need the real Electron runtime.
vi.mock('electron', () => ({ safeStorage: {} }));

import {
  configureSecretStorage,
  migrateLegacySecrets,
  overlaySecrets,
  readSecret,
  writeSecret,
  type SafeStorageLike,
} from '../services/secrets';

/** Reversible fake of Electron safeStorage ("enc:" + base64). */
function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from('enc:' + Buffer.from(s).toString('base64')),
    decryptString: (b: Buffer) => {
      const raw = b.toString();
      if (!raw.startsWith('enc:')) throw new Error('bad cipher');
      return Buffer.from(raw.slice(4), 'base64').toString();
    },
  };
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  db = new SQL.Database();
  db.run(`CREATE TABLE master_profile (id INTEGER PRIMARY KEY, email TEXT, groq_api_key TEXT, gemini_api_key TEXT, smtp_password TEXT)`);
  db.run(`INSERT INTO master_profile (id, email, groq_api_key, smtp_password) VALUES (1, 'a@b.co', 'gsk_plain', 'smtp-plain')`);
});

const column = (field: string) => db.exec(`SELECT ${field} FROM master_profile WHERE id = 1`)[0].values[0][0];
const cipher = (field: string) => {
  const r = db.exec('SELECT cipher FROM secure_secrets WHERE name = ?', [field]);
  return r.length ? String(r[0].values[0][0]) : null;
};

describe('safeStorage secret migration', () => {
  it('moves plaintext keys into encrypted storage and nulls the legacy columns', () => {
    configureSecretStorage(fakeSafeStorage());
    const persist = vi.fn();
    expect(migrateLegacySecrets(db, persist)).toBe(2);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(column('groq_api_key')).toBeNull();
    expect(column('smtp_password')).toBeNull();
    expect(cipher('groq_api_key')).not.toContain('gsk_plain');
    expect(readSecret('groq_api_key', db)).toBe('gsk_plain');
    expect(readSecret('smtp_password', db)).toBe('smtp-plain');
    // Idempotent: nothing left to migrate.
    expect(migrateLegacySecrets(db, persist)).toBe(0);
  });

  it('leaves values in place when OS encryption is unavailable', () => {
    configureSecretStorage(fakeSafeStorage(false));
    expect(migrateLegacySecrets(db, vi.fn())).toBe(0);
    expect(column('groq_api_key')).toBe('gsk_plain');
    expect(readSecret('groq_api_key', db)).toBe('gsk_plain');
  });

  it('overlays decrypted secrets onto the profile row with the same keys', () => {
    configureSecretStorage(fakeSafeStorage());
    migrateLegacySecrets(db, vi.fn());
    const row = overlaySecrets({ id: 1, email: 'a@b.co', groq_api_key: null, smtp_password: null, gemini_api_key: null }, db);
    expect(row).toEqual({ id: 1, email: 'a@b.co', groq_api_key: 'gsk_plain', smtp_password: 'smtp-plain', gemini_api_key: null });
  });

  it('writeSecret encrypts when available, falls back to the legacy column otherwise, and clears on null', () => {
    configureSecretStorage(fakeSafeStorage());
    expect(writeSecret('groq_api_key', 'new-key', db)).toBeNull();
    expect(readSecret('groq_api_key', db)).toBe('new-key');
    expect(writeSecret('groq_api_key', null, db)).toBeNull();
    expect(cipher('groq_api_key')).toBeNull();

    configureSecretStorage(fakeSafeStorage(false));
    expect(writeSecret('smtp_password', 'pw', db)).toBe('pw');
    expect(cipher('smtp_password')).toBeNull();
  });
});
