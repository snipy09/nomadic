import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ipc/handle imports electron; CI installs without the Electron binary.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
import initSqlJs, { type Database } from 'sql.js';
import {
  LOCAL_USER,
  claimLocalRows,
  countUnsynced,
  getGoal,
  getPulledUntil,
  goalToSync,
  insertEvents,
  listEvents,
  markEventsSynced,
  markGoalSynced,
  migrateLearningSchema,
  restoreGoal,
  saveGoal,
  setPulledUntil,
  unsyncedEvents,
} from '../services/learning-store';
import { learningRecordEventsArgs, learningSaveGoalArgs } from '../ipc/schemas';
import { IpcValidationError, validateArgs } from '../ipc/handle';
import type { LearningEventInput } from '../../shared/ipc';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  db = new SQL.Database();
  migrateLearningSchema(db);
  migrateLearningSchema(db); // idempotent
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

describe('learning goal', () => {
  const goal = { track_id: 'frontend', horizon_months: 3 as const, daily_hours: 2 as const };

  it('changing pace keeps the start date; changing role starts a new track and archives the old one on sync', () => {
    const a = saveGoal(db, 'u1', goal, '2026-10-01T00:00:00Z');
    expect(goalToSync(db, 'u1')).toEqual({ goal: a, archiveTrackId: null });
    markGoalSynced(db, 'u1', a, '2026-10-01T00:01:00Z');
    expect(goalToSync(db, 'u1')).toBe(null);

    const b = saveGoal(db, 'u1', { ...goal, daily_hours: 4 }, '2026-10-02T00:00:00Z');
    expect(b.started_at).toBe('2026-10-01T00:00:00Z');
    expect(goalToSync(db, 'u1')?.archiveTrackId).toBe(null);
    markGoalSynced(db, 'u1', b, '2026-10-02T00:01:00Z');

    const c = saveGoal(db, 'u1', { ...goal, track_id: 'backend' }, '2026-10-03T00:00:00Z');
    expect(c.started_at).toBe('2026-10-03T00:00:00Z');
    expect(goalToSync(db, 'u1')).toEqual({ goal: c, archiveTrackId: 'frontend' });
  });

  it('does not mark a goal synced if it changed during the push', () => {
    const a = saveGoal(db, 'u1', goal, '2026-10-01T00:00:00Z');
    saveGoal(db, 'u1', { ...goal, horizon_months: 6 }, '2026-10-01T00:00:30Z');
    markGoalSynced(db, 'u1', a, '2026-10-01T00:01:00Z');
    expect(goalToSync(db, 'u1')?.goal.horizon_months).toBe(6);
  });

  it('restores a cloud goal only when the device has none, and claims a pre-sign-in goal', () => {
    const cloud = { ...goal, started_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
    expect(restoreGoal(db, 'u1', cloud, 'now')).toBe(true);
    expect(restoreGoal(db, 'u1', { ...cloud, track_id: 'design' }, 'now')).toBe(false);
    expect(getGoal(db, 'u1')?.track_id).toBe('frontend');
    expect(goalToSync(db, 'u1')).toBe(null);

    saveGoal(db, LOCAL_USER, { ...goal, track_id: 'devops' }, '2026-10-01T00:00:00Z');
    expect(getGoal(db, 'u2')?.track_id).toBe('devops');
    claimLocalRows(db, 'u2');
    expect(getGoal(db, 'u2')?.track_id).toBe('devops');
    expect(getGoal(db, LOCAL_USER)).toBe(null);
  });

  it('tracks the pull cursor per user', () => {
    expect(getPulledUntil(db, 'u1')).toBe(null);
    setPulledUntil(db, 'u1', '2026-10-01T00:00:00+00:00');
    setPulledUntil(db, 'u1', '2026-10-02T00:00:00+00:00');
    expect(getPulledUntil(db, 'u1')).toBe('2026-10-02T00:00:00+00:00');
  });
});

describe('learning IPC validation', () => {
  it('accepts well-formed events and goals', () => {
    const [events] = validateArgs('learning-record-events', learningRecordEventsArgs, [[{ ...ev(1), duration_s: undefined }]]);
    expect(events[0].duration_s).toBe(0);
    expect(validateArgs('learning-save-goal', learningSaveGoalArgs, [{ track_id: 'frontend', horizon_months: 3, daily_hours: 2 }])[0].track_id).toBe('frontend');
  });

  it('rejects bad ids, types, sizes and goals', () => {
    const bad = (e: unknown) => () => validateArgs('learning-record-events', learningRecordEventsArgs, [[e]]);
    expect(bad({ ...ev(1), id: 'not-a-uuid' })).toThrow(IpcValidationError);
    expect(bad({ ...ev(1), type: 'hacked' })).toThrow(/type/);
    expect(bad({ ...ev(1), created_at: 'yesterday' })).toThrow(/created_at/);
    expect(bad({ ...ev(1), payload: { note: 'x'.repeat(5000) } })).toThrow(/too large/);
    expect(bad({ ...ev(1), duration_s: -1 })).toThrow();
    expect(() => validateArgs('learning-record-events', learningRecordEventsArgs, [[]])).toThrow();
    expect(() => validateArgs('learning-record-events', learningRecordEventsArgs, [Array.from({ length: 501 }, (_, i) => ev(i))])).toThrow();
    const goal = (g: unknown) => () => validateArgs('learning-save-goal', learningSaveGoalArgs, [g]);
    expect(goal({ track_id: 'astronaut', horizon_months: 3, daily_hours: 2 })).toThrow();
    expect(goal({ track_id: 'frontend', horizon_months: 2, daily_hours: 2 })).toThrow();
    expect(goal({ track_id: 'frontend', horizon_months: 3, daily_hours: 3 })).toThrow();
  });
});
