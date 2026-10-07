import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { claimLocalDataFor, getLocalOwner, migrateLocalMetaSchema } from '../services/local-owner';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;
beforeAll(async () => { SQL = await initSqlJs(); });

beforeEach(() => {
  db = new SQL.Database();
  db.run(`CREATE TABLE master_profile (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
    desired_title TEXT, tech_stack TEXT, sponsorship TEXT, onboarding_completed INTEGER DEFAULT 0)`);
  db.run(`INSERT INTO master_profile VALUES (1, 'Asha', 'Rao', 'asha@example.com', '', 'SDE', 'React', 'No', 1)`);
  db.run(`CREATE TABLE saved_jobs (job_id TEXT)`);
  db.run(`INSERT INTO saved_jobs VALUES ('j1')`);
  db.run(`CREATE TABLE learning_progress (user_id TEXT)`);
  db.run(`INSERT INTO learning_progress VALUES ('u1')`);
  migrateLocalMetaSchema(db);
});

const count = (t: string) => Number(db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]);
const onboarded = () => Number(db.exec(`SELECT onboarding_completed FROM master_profile WHERE id = 1`)[0].values[0][0]);

describe('claimLocalDataFor', () => {
  it('adopts data from before owners were recorded when the email matches', () => {
    expect(claimLocalDataFor(db, 'u1', 'Asha@Example.com')).toBe(false);
    expect(getLocalOwner(db)).toBe('u1');
    expect([count('saved_jobs'), onboarded()]).toEqual([1, 1]);
  });

  it('keeps everything when the same account signs in again', () => {
    claimLocalDataFor(db, 'u1', 'asha@example.com');
    expect(claimLocalDataFor(db, 'u1', 'asha@example.com')).toBe(false);
    expect(count('saved_jobs')).toBe(1);
  });

  it('clears the previous account and shows onboarding when another account signs in', () => {
    claimLocalDataFor(db, 'u1', 'asha@example.com');
    expect(claimLocalDataFor(db, 'u2', 'ravi@example.com')).toBe(true);
    expect(getLocalOwner(db)).toBe('u2');
    expect([count('saved_jobs'), onboarded(), count('learning_progress')]).toEqual([0, 0, 1]);
    expect(db.exec(`SELECT first_name, email FROM master_profile`)[0].values).toEqual([['', '']]);
  });

  it('clears unowned data that carries a different email', () => {
    expect(claimLocalDataFor(db, 'u2', 'ravi@example.com')).toBe(true);
    expect([count('saved_jobs'), onboarded()]).toEqual([0, 0]);
  });
});
