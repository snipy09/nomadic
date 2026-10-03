import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { getUserVersion, runLocalMigrations, type LocalMigration } from '../local-db/migrations';
import {
  BACKUPS_KEPT, checkIntegrity, createBackup, listBackups, openOrRecover, writeFileAtomic,
} from '../local-db/safety';
import { LOCAL_MIGRATIONS, getDb, getLocalDbHealth, initLocalDatabase, persistDb, wipeLocalData } from '../db';

let SQL: SqlJsStatic;
let dir: string;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomadic-db-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const tableNames = (db: { exec: (s: string) => Array<{ values: unknown[][] }> }) =>
  (db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0]));

describe('runLocalMigrations', () => {
  const m: LocalMigration[] = [
    { version: 1, name: 'one', up: (db) => db.run('CREATE TABLE a (x INTEGER)') },
    { version: 2, name: 'two', up: (db) => db.run('ALTER TABLE a ADD COLUMN y TEXT') },
  ];

  it('applies pending migrations in order and records the version', () => {
    const db = new SQL.Database();
    expect(runLocalMigrations(db, m)).toEqual({ status: 'migrated', from: 0, to: 2, applied: ['one', 'two'] });
    expect(getUserVersion(db)).toBe(2);
    expect(runLocalMigrations(db, m)).toEqual({ status: 'up_to_date', from: 2, to: 2, applied: [] });
  });

  it('calls beforeMigrate once, only when something is pending', () => {
    const db = new SQL.Database();
    const calls: Array<[number, number]> = [];
    runLocalMigrations(db, m, { beforeMigrate: (f, t) => calls.push([f, t]) });
    runLocalMigrations(db, m, { beforeMigrate: (f, t) => calls.push([f, t]) });
    expect(calls).toEqual([[0, 2]]);
  });

  it('rolls a failing migration back and stays at the last good version', () => {
    const db = new SQL.Database();
    const broken: LocalMigration[] = [
      m[0],
      { version: 2, name: 'broken', up: (d) => { d.run('CREATE TABLE half (z INTEGER)'); d.run('THIS IS NOT SQL'); } },
    ];
    const out = runLocalMigrations(db, broken);
    expect(out.status).toBe('failed');
    expect(out.to).toBe(1);
    expect(out.applied).toEqual(['one']);
    expect(out.error).toContain('Migration 2 (broken) failed');
    expect(getUserVersion(db)).toBe(1);
    expect(tableNames(db)).not.toContain('half');
  });

  it('never touches a database from a newer app version', () => {
    const db = new SQL.Database();
    db.run('PRAGMA user_version = 9');
    expect(runLocalMigrations(db, m).status).toBe('newer_than_app');
    expect(getUserVersion(db)).toBe(9);
  });

  it('rejects a mis-numbered migration list, and the shipped list is well formed', () => {
    expect(() => runLocalMigrations(new SQL.Database(), [{ ...m[0], version: 2 }])).toThrow(/expected 1/);
    LOCAL_MIGRATIONS.forEach((mig, i) => expect(mig.version).toBe(i + 1));
  });
});

describe('safety helpers', () => {
  const file = () => path.join(dir, 'job_automator_local.db');

  const writeDb = (rows: number) => {
    const db = new SQL.Database();
    db.run('CREATE TABLE t (v INTEGER)');
    for (let i = 0; i < rows; i++) db.run('INSERT INTO t VALUES (?)', [i]);
    writeFileAtomic(file(), db.export());
  };

  it('writes atomically and leaves no temp file', () => {
    writeDb(3);
    expect(fs.existsSync(file())).toBe(true);
    expect(fs.existsSync(`${file()}.tmp`)).toBe(false);
    expect(checkIntegrity(new SQL.Database(fs.readFileSync(file()))).ok).toBe(true);
  });

  it('keeps only the newest backups', () => {
    writeDb(1);
    for (let i = 0; i < BACKUPS_KEPT + 3; i++) createBackup(file(), `b${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)));
    const list = listBackups(file());
    expect(list.length).toBe(BACKUPS_KEPT);
    expect(list[0].name).toContain('b7');
  });

  it('opens a good file as is', () => {
    writeDb(2);
    const res = openOrRecover(SQL, file());
    expect(res.state).toBe('ok');
    expect(res.db.exec('SELECT COUNT(*) FROM t')[0].values[0][0]).toBe(2);
  });

  it('moves a corrupt file aside and restores the newest good backup', () => {
    writeDb(4);
    createBackup(file(), 'good');
    fs.writeFileSync(file(), Buffer.from('this is not a sqlite database at all'.repeat(200)));

    const res = openOrRecover(SQL, file());

    expect(res.state).toBe('recovered_from_backup');
    expect(fs.existsSync(res.quarantinedTo!)).toBe(true);
    expect(res.db.exec('SELECT COUNT(*) FROM t')[0].values[0][0]).toBe(4);
    expect(checkIntegrity(new SQL.Database(fs.readFileSync(file()))).ok).toBe(true);
  });

  it('starts empty only when no usable backup exists, keeping the damaged file', () => {
    fs.writeFileSync(file(), Buffer.from('garbage'.repeat(500)));
    const res = openOrRecover(SQL, file());
    expect(res.state).toBe('reset_after_corruption');
    expect(fs.readFileSync(res.quarantinedTo!).toString()).toContain('garbage');
  });

  it('reports a new database when there is no file', () => {
    expect(openOrRecover(SQL, file()).state).toBe('new');
  });
});

describe('initLocalDatabase', () => {
  it('creates a new database at the latest schema without a backup', async () => {
    await initLocalDatabase(dir);
    const h = getLocalDbHealth()!;
    expect(h.startup).toBe('new');
    expect(h.migration).toBe('migrated');
    expect(h.schemaVersion).toBe(LOCAL_MIGRATIONS.length);
    expect(tableNames(getDb())).toEqual(expect.arrayContaining(['master_profile', 'local_applications', 'application_status_history']));
    expect(listBackups(path.join(dir, 'job_automator_local.db'))).toEqual([]);
  });

  it('upgrades a database from an older build, backing it up first and keeping its data', async () => {
    // A pre-versioning database: tables exist, user_version 0, real rows.
    await initLocalDatabase(dir);
    getDb().run("UPDATE master_profile SET first_name = 'Asha' WHERE id = 1");
    getDb().run('PRAGMA user_version = 0');
    persistDb();

    await initLocalDatabase(dir);

    const h = getLocalDbHealth()!;
    expect(h.startup).toBe('ok');
    expect(h.migration).toBe('migrated');
    expect(getDb().exec('SELECT first_name FROM master_profile WHERE id = 1')[0].values[0][0]).toBe('Asha');
    const backups = listBackups(path.join(dir, 'job_automator_local.db'));
    expect(backups.length).toBe(1);
    expect(backups[0].name).toContain(`before-v${LOCAL_MIGRATIONS.length}-from-v0`);
    const backedUp = new SQL.Database(fs.readFileSync(backups[0].path));
    expect(getUserVersion(backedUp)).toBe(0);
  });

  it('recovers from a corrupted file at startup', async () => {
    await initLocalDatabase(dir);
    getDb().run("UPDATE master_profile SET first_name = 'Ravi' WHERE id = 1");
    persistDb();
    createBackup(path.join(dir, 'job_automator_local.db'), 'manual');
    fs.writeFileSync(path.join(dir, 'job_automator_local.db'), Buffer.from('torn write'.repeat(300)));

    await initLocalDatabase(dir);

    expect(getLocalDbHealth()!.startup).toBe('recovered_from_backup');
    expect(getDb().exec('SELECT first_name FROM master_profile WHERE id = 1')[0].values[0][0]).toBe('Ravi');
  });

  it('wipes every local copy after account deletion', async () => {
    await initLocalDatabase(dir);
    getDb().run("UPDATE master_profile SET first_name = 'Asha' WHERE id = 1");
    persistDb();
    createBackup(path.join(dir, 'job_automator_local.db'), 'manual');

    await wipeLocalData();

    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false);
    expect(getDb().exec('SELECT first_name FROM master_profile WHERE id = 1')[0].values[0][0]).toBe('');
    expect(getLocalDbHealth()!.startup).toBe('new');
  });
});
