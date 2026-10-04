import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ipc/handle imports electron; CI installs without the Electron binary.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
import initSqlJs, { type Database } from 'sql.js';
import {
  LOCAL_USER,
  claimLocalRows,
  countUnsynced,
  countUnsyncedDocs,
  deleteDoc,
  getDoc,
  getPulledUntil,
  insertEvents,
  listEvents,
  markDocSynced,
  markEventsSynced,
  mergePulledDoc,
  migrateLearnV2Schema,
  migrateLearningSchema,
  putDoc,
  setPulledUntil,
  unsyncedDocs,
  unsyncedEvents,
} from '../services/learning-store';
import {
  learnProblemNoteSaveArgs,
  learnProjectCheckRepoArgs,
  learnRoadmapAdjustArgs,
  learnRoadmapGenerateArgs,
  learningRecordEventsArgs,
} from '../ipc/schemas';
import { IpcValidationError, validateArgs } from '../ipc/handle';
import type { LearningEventInput } from '../../shared/ipc';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  db = new SQL.Database();
  migrateLearningSchema(db);
  migrateLearningSchema(db); // idempotent
  migrateLearnV2Schema(db);
});

const ev = (n: number, patch: Partial<LearningEventInput> = {}): LearningEventInput => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: 'quiz_passed',
  skill_id: 'html',
  item_id: `html-q${n}`,
  payload: { lesson_id: 'lesson-html', score: 1 },
  duration_s: 0,
  created_at: `2026-10-0${n}T10:00:00.000Z`,
  ...patch,
});

describe('learning events', () => {
  it('appends events idempotently by id and lists them oldest first', () => {
    const first = insertEvents(db, 'u1', [ev(2), ev(1)]);
    expect(first.inserted).toBe(2);
    expect(insertEvents(db, 'u1', [ev(1)]).inserted).toBe(0);
    const list = listEvents(db, 'u1');
    expect(list.map((e) => e.item_id)).toEqual(['html-q1', 'html-q2']);
    expect(list[0]).toMatchObject({ user_id: 'u1', payload: { lesson_id: 'lesson-html', score: 1 }, skill_id: 'html' });
  });

  it('is append-only: content columns cannot change', () => {
    insertEvents(db, 'u1', [ev(1)]);
    expect(() => db.run("UPDATE learning_events SET type = 'quiz_failed'")).toThrow(/append-only/);
    expect(() => db.run("UPDATE learning_events SET payload = '{}'")).toThrow(/append-only/);
    markEventsSynced(db, [ev(1).id], '2026-10-02T00:00:00Z');
    expect(countUnsynced(db, 'u1')).toBe(0);
  });

  it('keeps users apart and lets the next sign-in claim events recorded before it', () => {
    insertEvents(db, LOCAL_USER, [ev(1)]);
    insertEvents(db, 'other', [ev(2)]);
    expect(listEvents(db, 'u1').map((e) => e.id)).toEqual([ev(1).id]); // local rows are visible to the signed-in user
    claimLocalRows(db, 'u1');
    expect(listEvents(db, 'u1').map((e) => e.user_id)).toEqual(['u1']);
    expect(listEvents(db, 'other').map((e) => e.id)).toEqual([ev(2).id]);
    expect(unsyncedEvents(db, 'u1').map((e) => e.id)).toEqual([ev(1).id]);
  });
});

describe('local migration 9 (Learn v2)', () => {
  it('keeps existing events, accepts the v2 types and stays append-only', () => {
    const old = new SQL.Database();
    migrateLearningSchema(old);
    insertEvents(old, 'u1', [ev(1)]);
    // INSERT OR IGNORE skips rows the v1 CHECK refuses.
    expect(insertEvents(old, 'u1', [ev(2, { type: 'task_done' as never })]).inserted).toBe(0);
    migrateLearnV2Schema(old);
    expect(listEvents(old, 'u1').map((e) => e.id)).toEqual([ev(1).id]);
    insertEvents(old, 'u1', [ev(2, { type: 'task_done', item_id: 'dsa.arrays.hashing/learn' })]);
    expect(listEvents(old, 'u1')).toHaveLength(2);
    expect(() => old.run("UPDATE learning_events SET type = 'quiz_failed'")).toThrow(/append-only/);
    expect(insertEvents(old, 'u1', [ev(3, { type: 'hacked' as never })]).inserted).toBe(0);
    const idx = old.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_learning_events_user_time'");
    expect(idx[0].values).toHaveLength(1);
    expect(old.exec("SELECT name FROM sqlite_master WHERE name = 'learning_goal'")).toEqual([]);
  });

  it('tracks the pull cursor per user', () => {
    expect(getPulledUntil(db, 'u1')).toBe(null);
    setPulledUntil(db, 'u1', '2026-10-01T00:00:00+00:00');
    setPulledUntil(db, 'u1', '2026-10-02T00:00:00+00:00');
    expect(getPulledUntil(db, 'u1')).toBe('2026-10-02T00:00:00+00:00');
  });
});

describe('Learn v2 state documents', () => {
  it('stores, reads and deletes a document per kind', () => {
    putDoc(db, 'u1', 'roadmap', { id: 'r1' }, '2026-10-01T00:00:00Z');
    expect(getDoc(db, 'u1', 'roadmap')).toMatchObject({ value: { id: 'r1' }, synced_at: null });
    putDoc(db, 'u1', 'roadmap', { id: 'r2' }, '2026-10-02T00:00:00Z');
    expect(getDoc(db, 'u1', 'roadmap')?.value).toEqual({ id: 'r2' });
    deleteDoc(db, 'u1', 'roadmap');
    expect(getDoc(db, 'u1', 'roadmap')).toBe(null);
  });

  it('lists only synced kinds for upload (drafts stay local)', () => {
    putDoc(db, 'u1', 'draft', { x: 1 }, '2026-10-01T00:00:00Z');
    putDoc(db, 'u1', 'notes', [], '2026-10-01T00:00:00Z');
    expect(unsyncedDocs(db, 'u1').map((d) => d.kind)).toEqual(['notes']);
    expect(countUnsyncedDocs(db, 'u1')).toBe(1);
  });

  it('marks a document synced only if it did not change during the push', () => {
    putDoc(db, 'u1', 'schedule', { a: 1 }, '2026-10-01T00:00:00Z');
    putDoc(db, 'u1', 'schedule', { a: 2 }, '2026-10-01T00:00:30Z');
    markDocSynced(db, 'u1', 'schedule', '2026-10-01T00:00:00Z', 'now');
    expect(unsyncedDocs(db, 'u1')).toHaveLength(1);
    markDocSynced(db, 'u1', 'schedule', '2026-10-01T00:00:30Z', 'now');
    expect(unsyncedDocs(db, 'u1')).toHaveLength(0);
  });

  it('pulled documents win only when newer', () => {
    putDoc(db, 'u1', 'projects', ['local'], '2026-10-02T00:00:00Z');
    expect(mergePulledDoc(db, 'u1', 'projects', ['cloud-old'], '2026-10-01T00:00:00Z', 'now')).toBe(false);
    expect(getDoc(db, 'u1', 'projects')?.value).toEqual(['local']);
    expect(mergePulledDoc(db, 'u1', 'projects', ['cloud-new'], '2026-10-03T00:00:00Z', 'now')).toBe(true);
    expect(getDoc(db, 'u1', 'projects')).toMatchObject({ value: ['cloud-new'], synced_at: 'now' });
  });

  it('claims documents made before sign-in unless the account has its own', () => {
    putDoc(db, LOCAL_USER, 'roadmap', { id: 'local' }, '2026-10-01T00:00:00Z');
    putDoc(db, LOCAL_USER, 'notes', ['local'], '2026-10-01T00:00:00Z');
    putDoc(db, 'u2', 'notes', ['mine'], '2026-10-01T00:00:00Z');
    claimLocalRows(db, 'u2');
    expect(getDoc(db, 'u2', 'roadmap')?.value).toEqual({ id: 'local' });
    expect(getDoc(db, 'u2', 'notes')?.value).toEqual(['mine']);
    expect(getDoc(db, LOCAL_USER, 'notes')).toBe(null);
  });

  it('rejects an unknown kind', () => {
    expect(() => putDoc(db, 'u1', 'secrets' as never, {}, 'x')).toThrow();
  });
});

describe('learning IPC validation', () => {
  it('accepts well-formed events, including the v2 types', () => {
    const [events] = validateArgs('learning-record-events', learningRecordEventsArgs, [[{ ...ev(1), duration_s: undefined }]]);
    expect(events[0].duration_s).toBe(0);
    expect(validateArgs('learning-record-events', learningRecordEventsArgs, [[{ ...ev(1), type: 'task_done' }]])[0][0].type).toBe('task_done');
  });

  it('validates Learn v2 inputs', () => {
    const intake = {
      role: 'frontend', aim: 'campus', start_date: '2026-10-05', end_date: '2026-12-27', study_days: [1, 2, 3],
      weekday_minutes: 60, weekend_minutes: 120, streams: ['dsa', 'dev'],
    };
    expect(validateArgs('learn-roadmap-generate', learnRoadmapGenerateArgs, [intake])[0]).toMatchObject({ language: 'cpp', role: 'frontend' });
    expect(() => validateArgs('learn-roadmap-generate', learnRoadmapGenerateArgs, [{ ...intake, end_date: '2026-01-01' }])).toThrow();
    expect(() => validateArgs('learn-roadmap-generate', learnRoadmapGenerateArgs, [{ ...intake, role: 'astronaut' }])).toThrow();
    expect(() => validateArgs('learn-roadmap-generate', learnRoadmapGenerateArgs, [{ ...intake, note: 'x'.repeat(30_000) }])).toThrow(/too large|500/);
    expect(validateArgs('learn-roadmap-adjust', learnRoadmapAdjustArgs, ['  more DP please '])[0]).toBe('more DP please');
    expect(() => validateArgs('learn-roadmap-adjust', learnRoadmapAdjustArgs, ['x'.repeat(501)])).toThrow();
    expect(() => validateArgs('learn-problem-note-save', learnProblemNoteSaveArgs, [{ ref: 'not-a-ref', updated_at: '2026-10-05T00:00:00Z' }])).toThrow();
    expect(() => validateArgs('learn-project-check-repo', learnProjectCheckRepoArgs, [{ projectId: 'p', stageId: 's', repoUrl: 'https://evil.example/x/y' }])).toThrow();
    expect(validateArgs('learn-project-check-repo', learnProjectCheckRepoArgs, [{ projectId: 'p', stageId: 's', repoUrl: 'https://github.com/a/b' }])[0].repoUrl).toBe('https://github.com/a/b');
  });

  it('rejects bad ids, types and sizes', () => {
    const bad = (e: unknown) => () => validateArgs('learning-record-events', learningRecordEventsArgs, [[e]]);
    expect(bad({ ...ev(1), id: 'not-a-uuid' })).toThrow(IpcValidationError);
    expect(bad({ ...ev(1), type: 'hacked' })).toThrow(/type/);
    expect(bad({ ...ev(1), created_at: 'yesterday' })).toThrow(/created_at/);
    expect(bad({ ...ev(1), payload: { note: 'x'.repeat(5000) } })).toThrow(/too large/);
    expect(bad({ ...ev(1), duration_s: -1 })).toThrow();
    expect(() => validateArgs('learning-record-events', learningRecordEventsArgs, [[]])).toThrow();
    expect(() => validateArgs('learning-record-events', learningRecordEventsArgs, [Array.from({ length: 501 }, (_, i) => ev(i))])).toThrow();
  });
});
