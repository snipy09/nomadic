import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import type { LearningEventInput } from '../../shared/ipc';

// In-memory DB, session and a fake Supabase RPC server (migration 007/012 semantics).
const h = vi.hoisted(() => ({
  db: null as unknown as Database,
  active: null as null | { userId: string; sessionToken: string; deviceFingerprint: string },
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('../db', () => ({ getDb: () => h.db, persistDb: () => {} }));
vi.mock('../services/app-context', () => ({ log: () => {}, errorMessage: (e: unknown) => String(e) }));
vi.mock('../services/session', () => ({
  get session() { return { userId: h.active?.userId ?? null }; },
  getActiveSyncSession: () => h.active,
}));
vi.mock('../services/supabase', () => ({ getAnonSupabase: () => ({ rpc: h.rpc }) }));

import { migrateLearnV2Schema, migrateLearningSchema, listEvents, countUnsynced, getDoc, getPulledUntil, putDoc } from '../services/learning-store';
import { getLearningState, recordLearningEvents, syncLearning } from '../services/learning';
import { saveProblemNote } from '../services/learn-v2';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
interface ServerEvent extends Record<string, unknown> { id: string; received_at: string }
let server: { events: ServerEvent[]; docs: Map<string, { value: unknown; updated_at: string }>; calls: string[]; clock: number; failPush: boolean };

function fakeRpc(name: string, p: Record<string, any>) {
  server.calls.push(name);
  if (p.p_session_token !== 'tok') return Promise.resolve({ data: null, error: { message: 'unauthorized' } });
  const tick = () => new Date(Date.UTC(2026, 9, 1) + ++server.clock * 1000).toISOString().replace('Z', '+00:00');
  switch (name) {
    case 'learning_record_events': {
      if (server.failPush) return Promise.resolve({ data: null, error: { message: 'network down' } });
      let accepted = 0;
      for (const e of p.p_events) {
        if (!server.events.some((x) => x.id === e.id)) server.events.push({ ...e, received_at: tick() });
        accepted++;
      }
      return Promise.resolve({ data: [{ accepted, rejected: 0, error: null }], error: null });
    }
    case 'learning_pull_events':
      return Promise.resolve({ data: server.events.filter((e) => e.received_at > p.p_since).map((e) => ({ ...e, user_id: p.p_user_id })), error: null });
    case 'learning_save_state': {
      const cur = server.docs.get(p.p_kind);
      if (cur && cur.updated_at > p.p_updated_at) return Promise.resolve({ data: [{ ok: false, error: 'stale', updated_at: cur.updated_at }], error: null });
      server.docs.set(p.p_kind, { value: p.p_value, updated_at: p.p_updated_at });
      return Promise.resolve({ data: [{ ok: true, error: null, updated_at: p.p_updated_at }], error: null });
    }
    case 'learning_pull_state':
      return Promise.resolve({ data: [...server.docs].map(([kind, d]) => ({ kind, ...d })), error: null });
  }
  return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
}

const ev = (n: number): LearningEventInput => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: n % 2 ? 'quiz_failed' : 'quiz_passed',
  skill_id: 'html',
  item_id: `html-q${n}`,
  payload: { lesson_id: 'lesson-html' },
  duration_s: 3,
  created_at: `2026-10-01T10:00:0${n}.000Z`,
});

const signIn = () => { h.active = { userId: 'u1', sessionToken: 'tok', deviceFingerprint: 'fp' }; };
const freshDevice = () => { h.db = new SQL.Database(); migrateLearningSchema(h.db); migrateLearnV2Schema(h.db); };

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  freshDevice();
  h.active = null;
  server = { events: [], docs: new Map(), calls: [], clock: 0, failPush: false };
  h.rpc = vi.fn(fakeRpc);
});

describe('learning sync', () => {
  it('keeps progress on the device when signed out and never calls the server', async () => {
    expect(recordLearningEvents([ev(1)]).success).toBe(true);
    const res = await syncLearning();
    expect(res.success).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(getLearningState().pendingSync).toBe(1);
  });

  it('claims pre-sign-in progress, pushes documents and events, and is identical after a reinstall', async () => {
    saveProblemNote('local', { ref: 'lc:two-sum', note: 'Use a map.', resolve_later: true, updated_at: '2026-10-01T09:00:00Z' });
    recordLearningEvents([ev(1), ev(2)]);
    signIn();
    const res = await syncLearning();
    expect(res).toMatchObject({ success: true, pushed: 3, rejected: 0 });
    expect(server.events.map((e) => e.id)).toEqual([ev(1).id, ev(2).id]);
    expect(server.docs.get('notes')?.value).toEqual([expect.objectContaining({ ref: 'lc:two-sum', note: 'Use a map.' })]);
    expect(countUnsynced(h.db, 'u1')).toBe(0);
    const before = getLearningState();

    // Reinstall: empty database, same account.
    freshDevice();
    const restore = await syncLearning();
    expect(restore).toMatchObject({ success: true, pulled: 3 });
    const after = getLearningState();
    expect(after.events.map(({ id, type, item_id, duration_s, created_at }) => ({ id, type, item_id, duration_s, created_at })))
      .toEqual(before.events.map(({ id, type, item_id, duration_s, created_at }) => ({ id, type, item_id, duration_s, created_at })));
    expect(after.notes).toEqual([expect.objectContaining({ ref: 'lc:two-sum', resolve_later: true })]);
    expect(after.pendingSync).toBe(0);
    expect(getPulledUntil(h.db, 'u1')).toBeTruthy();

    // A second sync pulls nothing new and pushes nothing.
    expect(await syncLearning()).toMatchObject({ success: true, pushed: 0, pulled: 0 });
  });

  it('keeps the newer document on both sides', async () => {
    signIn();
    server.docs.set('notes', { value: [{ ref: 'lc:3sum', note: 'cloud', resolve_later: false, updated_at: '2026-10-03T00:00:00Z' }], updated_at: '2026-10-03T00:00:00Z' });
    putDoc(h.db, 'u1', 'notes', [{ ref: 'lc:3sum', note: 'old local', resolve_later: false, updated_at: '2026-10-01T00:00:00Z' }], '2026-10-01T00:00:00Z');
    await syncLearning();
    expect(getDoc(h.db, 'u1', 'notes')?.value).toEqual([expect.objectContaining({ note: 'cloud' })]);
    putDoc(h.db, 'u1', 'notes', [{ ref: 'lc:3sum', note: 'newer local', resolve_later: false, updated_at: '2026-10-05T00:00:00Z' }], '2026-10-05T00:00:00Z');
    await syncLearning();
    expect(server.docs.get('notes')?.updated_at).toBe('2026-10-05T00:00:00Z');
  });

  it('skips documents from the server that fail validation', async () => {
    signIn();
    server.docs.set('roadmap', { value: { id: 'nope' }, updated_at: '2026-10-03T00:00:00Z' });
    const res = await syncLearning();
    expect(res.success).toBe(true);
    expect(getDoc(h.db, 'u1', 'roadmap')).toBe(null);
    expect(getLearningState().roadmap).toBe(null);
  });

  it('leaves events unsynced and reports a friendly error when the push fails', async () => {
    signIn();
    server.failPush = true;
    recordLearningEvents([ev(1)]);
    const res = await syncLearning();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/saved on this device/i);
    expect(countUnsynced(h.db, 'u1')).toBe(1);
    server.failPush = false;
    expect(await syncLearning()).toMatchObject({ success: true, pushed: 1 });
    expect(listEvents(h.db, 'u1')).toHaveLength(1);
  });

  it('drops malformed rows from the server instead of storing them', async () => {
    signIn();
    server.events.push({ id: 'not-a-uuid', type: 'quiz_passed', received_at: '2026-10-01T00:00:01+00:00' } as ServerEvent);
    server.events.push({ ...ev(4), payload: {}, received_at: '2026-10-01T00:00:02+00:00' } as unknown as ServerEvent);
    const res = await syncLearning();
    expect(res).toMatchObject({ success: true, pulled: 1 });
    expect(listEvents(h.db, 'u1').map((e) => e.id)).toEqual([ev(4).id]);
  });
});
