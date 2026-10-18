import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// F12: admin actions are session-checked RPCs made with the anon key. The desktop
// must send the device session with every call and must never use a service-role client.

const rpc = vi.fn();
const session = { current: null as null | { userId: string; sessionToken: string; deviceFingerprint: string } };
let supabaseConfigured = true;

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' }, ipcMain: { handle: vi.fn() } }));
vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));
vi.mock('../services/session.js', () => ({ getActiveSyncSession: () => session.current }));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => (supabaseConfigured ? { rpc } : null) }));

import {
  adminErrorMessage, callAdminRpc, contentHistory, listAudit, listContent, listUsers, scrapeHealth, setResourceStatus,
  setUserPlan, setUserStatus, toAuditEntry, toScrapeHealth, toUserRow, updateLesson, listUpiOrders, reviewUpiOrder,
} from '../services/admin';
import {
  adminListUsersArgs, adminReviewUpiOrderArgs, adminSetResourceStatusArgs, adminSetUserPlanArgs, adminSetUserStatusArgs, adminUpdateLessonArgs,
} from '../ipc/schemas';

const SESSION = { userId: '00000000-0000-0000-0000-00000000000a', sessionToken: 'tok', deviceFingerprint: 'fp' };
const TARGET = '00000000-0000-0000-0000-00000000000c';
const SESSION_PARAMS = { p_user_id: SESSION.userId, p_session_token: 'tok', p_device_fingerprint: 'fp' };

beforeEach(() => {
  rpc.mockReset();
  session.current = SESSION;
  supabaseConfigured = true;
});

describe('callAdminRpc', () => {
  it('sends the active device session with every call', async () => {
    rpc.mockResolvedValue({ data: { ok: true, total: 0, users: [] }, error: null });
    await listUsers({ query: '  a@b.co ' });
    expect(rpc).toHaveBeenCalledWith('admin_list_users', {
      ...SESSION_PARAMS, p_query: 'a@b.co', p_tier: null, p_status: null, p_limit: 50, p_offset: 0,
    });
  });

  it('refuses without a session and never calls the server', async () => {
    session.current = null;
    const res = await listUsers({});
    expect(res).toEqual({ ok: false, code: 'no_session', error: adminErrorMessage('no_session') });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a build without cloud config', async () => {
    supabaseConfigured = false;
    const res = await scrapeHealth(7);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('not_configured');
  });

  it('passes the server refusal through with a readable message', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'forbidden' }, error: null });
    const res = await listUsers({});
    expect(res).toEqual({ ok: false, code: 'forbidden', error: 'This account does not have admin access.' });
  });

  it('keeps the current version on a conflict', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 4 }, error: null });
    const res = await setResourceStatus({ id: 'r1', expectedVersion: 3, status: 'retired', reason: 'Dead link' });
    expect(res).toMatchObject({ ok: false, code: 'version_conflict', currentVersion: 4 });
  });

  it('maps a missing function (migration 014 not applied) to server_outdated', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_list_users' } });
    const res = await listUsers({});
    expect(res.ok === false && res.code).toBe('server_outdated');
  });

  it('maps transport errors and thrown calls to network', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    expect((await listAudit({})).ok === false).toBe(true);
    rpc.mockRejectedValue(new Error('offline'));
    const res = await callAdminRpc('admin_list_audit', {});
    expect(res.ok === false && res.code).toBe('network');
  });

  it('rejects a malformed body', async () => {
    rpc.mockResolvedValue({ data: 'nope', error: null });
    const res = await listUsers({});
    expect(res.ok === false && res.code).toBe('bad_response');
  });

  it('gives unknown codes a generic message', () => {
    expect(adminErrorMessage('weird')).toMatch(/weird/);
  });
});

describe('admin calls', () => {
  it('setUserPlan trims the reason and clears expiry for lifetime', async () => {
    rpc.mockResolvedValue({ data: { ok: true, audit_id: 12 }, error: null });
    const res = await setUserPlan({ targetId: TARGET, tier: 'lifetime', expiresAt: '2030-01-01T00:00:00.000Z', reason: '  Founding user ' });
    expect(rpc).toHaveBeenCalledWith('admin_set_user_plan', {
      ...SESSION_PARAMS, p_target_id: TARGET, p_tier: 'lifetime', p_expires_at: null, p_reason: 'Founding user',
    });
    expect(res).toEqual({ ok: true, data: { auditId: 12 } });
  });

  it('setUserStatus returns how many devices were signed out', async () => {
    rpc.mockResolvedValue({ data: { ok: true, audit_id: 3, sessions_ended: 2 }, error: null });
    const res = await setUserStatus({ targetId: TARGET, status: 'suspended', reason: 'Chargeback' });
    expect(rpc.mock.calls[0][0]).toBe('admin_set_user_status');
    expect(res).toEqual({ ok: true, data: { auditId: 3, sessionsEnded: 2 } });
  });

  it('updateLesson sends the expected version and drops blank key points', async () => {
    rpc.mockResolvedValue({ data: { ok: true, audit_id: 5, version: 3 }, error: null });
    const res = await updateLesson({
      id: 'arrays-intro', expectedVersion: 2, title: ' Arrays ', summaryMd: 'Text', keyPoints: ['One', '  ', ' Two '],
      status: 'review', reason: 'Fix typo',
    });
    expect(rpc).toHaveBeenCalledWith('admin_update_lesson', {
      ...SESSION_PARAMS, p_lesson_id: 'arrays-intro', p_expected_version: 2, p_title: 'Arrays', p_summary_md: 'Text',
      p_key_points: ['One', 'Two'], p_status: 'review', p_reason: 'Fix typo',
    });
    expect(res).toEqual({ ok: true, data: { auditId: 5, version: 3 } });
  });

  it('listContent maps rows for the requested kind', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, kind: 'resources', items: [{ id: 'r1', title: 'T', url: 'https://x.co', provider: 'P', type: 'doc', status: 'active', version: 2, skill_ids: ['a'], last_checked: '2026-10-01T00:00:00Z', http_status: 200, fail_count: 0, source: 'seed' }] },
      error: null,
    });
    const res = await listContent({ kind: 'resources', status: 'active' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kind: 'resources', p_status: 'active', p_query: null });
    expect(res.ok && res.data.kind === 'resources' && res.data.items[0]).toMatchObject({ id: 'r1', httpStatus: 200, skillIds: ['a'], version: 2 });
  });

  it('contentHistory maps versions', async () => {
    rpc.mockResolvedValue({ data: { ok: true, versions: [{ version: 1, snapshot: { title: 'Old' }, edited_by_email: 'a@x.co', created_at: 'now' }] }, error: null });
    const res = await contentHistory({ type: 'lesson', id: 'l1' });
    expect(res).toEqual({ ok: true, data: [{ version: 1, snapshot: { title: 'Old' }, editedByEmail: 'a@x.co', createdAt: 'now' }] });
  });
});

describe('row mappers', () => {
  it('never exposes credentials and defaults unknown values safely', () => {
    const row = toUserRow({ id: 'u', email: 'e', subscription_tier: null, role: 'owner', status: 'weird', password_hash: 'x', license_key: 'k' });
    expect(row).toEqual({
      id: 'u', email: 'e', fullName: '', tier: 'trial', role: 'user', status: 'active', expiresAt: null, createdAt: null,
      lastLogin: null, appsCount: 0, activeSessions: 0,
    });
    expect(Object.keys(row)).not.toContain('password_hash');
  });

  it('maps audit entries', () => {
    const e = toAuditEntry({ id: '7', actor_email: 'a@x.co', action: 'user.suspended', target_type: 'user', target_id: 'u', before: { status: 'active' }, after: null, created_at: 't' });
    expect(e).toMatchObject({ id: 7, actorEmail: 'a@x.co', targetType: 'user', before: { status: 'active' }, after: null, reason: null });
  });

  it('maps scrape health', () => {
    const h = toScrapeHealth({
      since: 's',
      runs: [{ id: '1', source: 'naukri', status: 'error', error: 'HTTP 503', fetched: '3', published: false }],
      sources: [{ source: 'naukri', runs: 2, failures: 1, last_status: 'error' }],
      active_jobs_by_source: { naukri: '40' },
    });
    expect(h.runs[0]).toMatchObject({ source: 'naukri', status: 'error', error: 'HTTP 503', fetched: 3, published: false });
    expect(h.sources[0]).toMatchObject({ source: 'naukri', failures: 1, lastStatus: 'error', lastOkAt: null });
    expect(h.activeJobsBySource).toEqual({ naukri: 40 });
  });
});

describe('IPC schemas', () => {
  it('require a reason and a UUID target for user changes', () => {
    const [plan] = adminSetUserPlanArgs;
    expect(plan.safeParse({ targetId: TARGET, tier: 'pro', expiresAt: null, reason: 'ok' }).success).toBe(false);
    expect(plan.safeParse({ targetId: 'not-a-uuid', tier: 'pro', expiresAt: null, reason: 'Ticket 1' }).success).toBe(false);
    expect(plan.safeParse({ targetId: TARGET, tier: 'enterprise', expiresAt: null, reason: 'Ticket 1' }).success).toBe(false);
    expect(plan.safeParse({ targetId: TARGET, tier: 'pro', expiresAt: '2030-01-01T00:00:00.000Z', reason: 'Ticket 1' }).success).toBe(true);
    const [status] = adminSetUserStatusArgs;
    expect(status.safeParse({ targetId: TARGET, status: 'deleted', reason: 'Ticket 1' }).success).toBe(false);
  });

  it('reject unknown fields (no role or field smuggling)', () => {
    const [status] = adminSetUserStatusArgs;
    expect(status.safeParse({ targetId: TARGET, status: 'active', reason: 'Ticket 1', role: 'admin' }).success).toBe(false);
    const [list] = adminListUsersArgs;
    expect(list.safeParse({ limit: 5000 }).success).toBe(false);
  });

  it('bound lesson edits and resource statuses', () => {
    const [lesson] = adminUpdateLessonArgs;
    const ok = { id: 'l1', expectedVersion: 1, title: 'T', summaryMd: 'Body', keyPoints: [], status: 'review', reason: 'Fix' };
    expect(lesson.safeParse(ok).success).toBe(true);
    expect(lesson.safeParse({ ...ok, keyPoints: Array(21).fill('x') }).success).toBe(false);
    expect(lesson.safeParse({ ...ok, expectedVersion: 0 }).success).toBe(false);
    const [resource] = adminSetResourceStatusArgs;
    expect(resource.safeParse({ id: 'r1', expectedVersion: 1, status: 'deleted', reason: 'Fix' }).success).toBe(false);
  });
});

describe('no service-role key in the desktop app', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('main-process Supabase helpers only build the anon client', () => {
    const src = read('../services/supabase.ts');
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/getServiceSupabase|getAdminSupabase/);
  });

  it('the admin service only calls RPCs, never tables', () => {
    const src = read('../services/admin.ts');
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/SERVICE_ROLE/);
  });
});

describe('UPI payment review', () => {
  const ORDER = '00000000-0000-0000-0000-0000000000f1';

  it('lists the review queue and maps rows', async () => {
    rpc.mockResolvedValue({ data: { ok: true, orders: [{ order_id: ORDER, user_id: TARGET, email: 't@x.co', full_name: 'T', plan: 'max', amount_inr: '599.00', reference: 'NMD-7K3Q9X', utr: '412345678901', status: 'submitted', created_at: '2026-10-17T10:00:00Z', submitted_at: '2026-10-17T10:05:00Z', reviewed_at: null, review_note: null }] }, error: null });
    const res = await listUpiOrders({ status: 'submitted' });
    expect(rpc).toHaveBeenCalledWith('admin_list_upi_orders', { ...SESSION_PARAMS, p_status: 'submitted' });
    expect(res).toMatchObject({ ok: true, data: [{ orderId: ORDER, plan: 'max', amountInr: 599, utr: '412345678901', status: 'submitted' }] });
    await listUpiOrders({});
    expect(rpc).toHaveBeenLastCalledWith('admin_list_upi_orders', { ...SESSION_PARAMS, p_status: null });
  });

  it('approves with a trimmed reason and names migration 035 when it is missing', async () => {
    rpc.mockResolvedValue({ data: { ok: true, audit_id: 7, status: 'approved', tier: 'pro', expires_at: '2026-11-17T00:00:00Z' }, error: null });
    const res = await reviewUpiOrder({ orderId: ORDER, decision: 'approve', reason: '  UTR on statement ' });
    expect(rpc).toHaveBeenCalledWith('admin_review_upi_order', { ...SESSION_PARAMS, p_order_id: ORDER, p_decision: 'approve', p_reason: 'UTR on statement' });
    expect(res).toEqual({ ok: true, data: { auditId: 7, status: 'approved', tier: 'pro', expiresAt: '2026-11-17T00:00:00Z' } });
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_review_upi_order' } });
    const old = await reviewUpiOrder({ orderId: ORDER, decision: 'reject', reason: 'No credit' });
    expect(old.ok === false && old.error).toMatch(/035/);
  });

  it('validates review input', () => {
    expect(adminReviewUpiOrderArgs[0].safeParse({ orderId: ORDER, decision: 'approve', reason: 'ok fine' }).success).toBe(true);
    expect(adminReviewUpiOrderArgs[0].safeParse({ orderId: 'x', decision: 'approve', reason: 'ok fine' }).success).toBe(false);
    expect(adminReviewUpiOrderArgs[0].safeParse({ orderId: ORDER, decision: 'refund', reason: 'ok fine' }).success).toBe(false);
  });
});