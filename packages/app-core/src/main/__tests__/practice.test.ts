import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import type { PracticeAttempt } from '@job-automator/learning';

const h = vi.hoisted(() => ({
  db: null as unknown as Database,
  session: null as null | { userId: string; sessionToken: string; deviceFingerprint: string },
  rpc: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../db', () => ({ getDb: () => h.db, persistDb: vi.fn() }));
vi.mock('../services/session', () => ({ getActiveSyncSession: () => h.session }));
vi.mock('../services/supabase', () => ({ getAnonSupabase: () => ({ rpc: h.rpc }) }));
vi.mock('../services/app-context', () => ({ log: vi.fn(), errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }));

import { countPracticeToday, getPracticeState, interpretRecordReply, recordPracticeAttempt, utcDayStart } from '../services/practice';
import { listAttempts, migratePracticeSchema, saveAttempt } from '../services/practice-store';
import { attemptToEvent } from '@job-automator/learning';
import { validateArgs } from '../ipc/handle';
import * as schemas from '../ipc/schemas';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs(); });

let seq = 0;
const attempt = (over: Partial<PracticeAttempt> = {}): PracticeAttempt => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  entry_id: 'lc:two-sum',
  entry_kind: 'problem',
  skill_id: 'dsa',
  topics: ['Array'],
  difficulty: 'easy',
  grading: 'self',
  outcome: 'solved',
  score: 1,
  mode: 'single',
  mock_id: null,
  duration_s: 30,
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  h.db = new SQL.Database();
  migratePracticeSchema(h.db);
  h.rpc.mockReset();
});

describe('practice store', () => {
  it('saves attempts once and lists them per user, newest first', () => {
    const a = attempt({ created_at: '2026-10-01T00:00:00.000Z' });
    const b = attempt({ created_at: '2026-10-02T00:00:00.000Z', topics: ['Graph', 'BFS'] });
    expect(saveAttempt(h.db, 'u1', a)).toBe(true);
    expect(saveAttempt(h.db, 'u1', a)).toBe(false);
    saveAttempt(h.db, 'u1', b);
    saveAttempt(h.db, 'u2', attempt());
    expect(listAttempts(h.db, 'u1')).toEqual([b, a]);
    expect(listAttempts(h.db, 'u2')).toHaveLength(1);
    migratePracticeSchema(h.db); // idempotent
  });
});

describe('server reply helpers', () => {
  it('reads the learning_record_events reply', () => {
    expect(interpretRecordReply([{ accepted: 1, rejected: 0, error: null }])).toBe('accepted');
    expect(interpretRecordReply([{ accepted: 0, rejected: 1, error: null }])).toBe('daily_limit');
    expect(interpretRecordReply([{ accepted: 0, rejected: 0, error: 'unauthorized' }])).toBe('unauthorized');
    expect(interpretRecordReply([])).toBe('unknown');
  });

  it('counts only events received since UTC midnight (05:30 IST)', () => {
    const now = new Date('2026-10-03T02:00:00.000Z');
    expect(utcDayStart(now)).toBe('2026-10-03T00:00:00.000Z');
    const counted = new Map([['a', '2026-10-02T23:59:59.000Z'], ['b', '2026-10-03T00:00:00.000Z'], ['c', '2026-10-03T01:00:00.000Z']]);
    expect(countPracticeToday(counted, now)).toBe(2);
  });
});

describe('recordPracticeAttempt', () => {
  it('refuses to record while signed out', async () => {
    h.session = null;
    const res = await recordPracticeAttempt(attempt());
    expect(res).toMatchObject({ success: false, code: 'not_signed_in' });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('sends the attempt as a learning event and caches it once the server accepts', async () => {
    h.session = { userId: 'u1', sessionToken: 't', deviceFingerprint: 'f' };
    const a = attempt();
    h.rpc.mockResolvedValueOnce({ data: [{ accepted: 1, rejected: 0, error: null }], error: null });
    const res = await recordPracticeAttempt(a);
    expect(res.success).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith('learning_record_events', {
      p_user_id: 'u1', p_session_token: 't', p_device_fingerprint: 'f', p_events: [attemptToEvent(a, 'u1')],
    });
    expect(listAttempts(h.db, 'u1')).toEqual([a]);
  });

  it('reports the server-side daily limit and stores nothing', async () => {
    h.session = { userId: 'u1', sessionToken: 't', deviceFingerprint: 'f' };
    h.rpc.mockResolvedValueOnce({ data: [{ accepted: 0, rejected: 1, error: null }], error: null });
    const res = await recordPracticeAttempt(attempt());
    expect(res).toMatchObject({ success: false, code: 'daily_limit' });
    expect(listAttempts(h.db, 'u1')).toEqual([]);
  });

  it('reports network errors as retryable', async () => {
    h.session = { userId: 'u1', sessionToken: 't', deviceFingerprint: 'f' };
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'fetch failed' } });
    expect(await recordPracticeAttempt(attempt())).toMatchObject({ success: false, code: 'network', error: 'fetch failed' });
  });
});

describe('getPracticeState', () => {
  it('pulls the server log, restores practice attempts and counts today', async () => {
    h.session = { userId: 'u9', sessionToken: 't', deviceFingerprint: 'f' };
    const a = attempt();
    const today = new Date().toISOString();
    h.rpc.mockResolvedValueOnce({
      data: [
        { ...attemptToEvent(a, 'u9'), received_at: today },
        { id: '00000000-0000-4000-8000-0000000000ff', user_id: 'u9', type: 'review_done', skill_id: 'sql', item_id: 'sql-q1', payload: {}, duration_s: 0, created_at: today, received_at: today },
        { id: '00000000-0000-4000-8000-0000000000fe', user_id: 'u9', type: 'lesson_viewed', skill_id: 'sql', item_id: null, payload: {}, duration_s: 0, created_at: today, received_at: today },
      ],
      error: null,
    });
    const res = await getPracticeState();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.state.attempts).toEqual([a]);
    expect(res.state.usedToday).toBe(2);
    expect(h.rpc).toHaveBeenCalledWith('learning_pull_events', expect.objectContaining({ p_user_id: 'u9', p_since: '1970-01-01T00:00:00Z' }));
  });

  it('falls back to the local cache when the server is unreachable', async () => {
    h.session = { userId: 'u8', sessionToken: 't', deviceFingerprint: 'f' };
    const a = attempt();
    saveAttempt(h.db, 'u8', a);
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const res = await getPracticeState();
    expect(res).toMatchObject({ success: true, state: { attempts: [a], usedToday: null, signedIn: true, syncError: 'offline' } });
  });
});

describe('practice IPC schema', () => {
  it('accepts a valid attempt and rejects bad input', () => {
    const a = attempt();
    expect(validateArgs('practice-record-attempt', schemas.practiceRecordAttemptArgs, [{ ...a, extra: 1 }])).toEqual([a]);
    expect(() => validateArgs('practice-record-attempt', schemas.practiceRecordAttemptArgs, [{ ...a, score: 5 }])).toThrow(/score/);
    expect(() => validateArgs('practice-record-attempt', schemas.practiceRecordAttemptArgs, ['nope'])).toThrow();
  });
});
