import { beforeEach, describe, expect, it, vi } from 'vitest';

// F9: plan and apply limits come only from the server (migration 011); main
// fails closed when the server cannot be asked.

const rpc = vi.fn();
const session = { userId: 'u-1' as string | null, sessionToken: 'tok' as string | null, deviceFingerprint: 'fp' as string | null };

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() }, app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));
vi.mock('../db.js', () => ({ getDb: () => ({ exec: () => [] }) }));
vi.mock('../services/session.js', () => ({
  getActiveSyncSession: () =>
    session.userId && session.sessionToken && session.deviceFingerprint
      ? { userId: session.userId, sessionToken: session.sessionToken, deviceFingerprint: session.deviceFingerprint }
      : null,
}));
let supabaseAvailable = true;
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => (supabaseAvailable ? { rpc } : null) }));

import {
  consumeApplyQuota,
  getEntitlements,
  invalidateEntitlements,
  mapEntitlementsRow,
  quotaRefusal,
} from '../services/entitlements';
import { buildCheckoutUrl } from '../services/checkout';

const freeRow = {
  ok: true, error: null, plan: 'free', stored_tier: 'trial', account_status: 'active', expires_at: null,
  applies_per_day: 3, applies_used: 1, applies_remaining: 2, feed_jobs: 10, learn_tracks: 1, learn_tracks_active: 1,
  practice_per_day: 10, autonomous_apply: false, resumes: 1, resets_at: '2026-10-03T18:30:00+00:00', server_time: '2026-10-03T10:00:00Z',
};

beforeEach(() => {
  rpc.mockReset();
  invalidateEntitlements();
  supabaseAvailable = true;
  session.userId = 'u-1';
  session.sessionToken = 'tok';
  session.deviceFingerprint = 'fp';
});

describe('mapEntitlementsRow', () => {
  it('maps limits, usage and unlimited (null) values', () => {
    const e = mapEntitlementsRow(freeRow, new Date('2026-10-03T10:00:00Z'));
    expect(e).toMatchObject({
      plan: 'free', storedTier: 'trial', accountStatus: 'active', appliesRemaining: 2,
      limits: { appliesPerDay: 3, feedJobs: 10, learnTracks: 1, autonomousApply: false },
      usage: { appliesToday: 1, learnTracksActive: 1 },
      resetsAt: '2026-10-03T18:30:00.000Z',
    });
    const max = mapEntitlementsRow({ ...freeRow, plan: 'max', applies_per_day: null, applies_remaining: null, feed_jobs: null, autonomous_apply: true });
    expect(max.limits.appliesPerDay).toBeNull();
    expect(max.appliesRemaining).toBeNull();
    expect(max.limits.autonomousApply).toBe(true);
  });
  it('treats an unknown plan as free', () => {
    expect(mapEntitlementsRow({ ...freeRow, plan: 'lifetime' }).plan).toBe('free');
  });
});

describe('getEntitlements', () => {
  it('sends the device session and caches briefly', async () => {
    rpc.mockResolvedValue({ data: [freeRow], error: null });
    const a = await getEntitlements();
    const b = await getEntitlements();
    expect(a.success && a.entitlements.plan).toBe('free');
    expect(b.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_entitlements', { p_user_id: 'u-1', p_session_token: 'tok', p_device_fingerprint: 'fp' });
    await getEntitlements({ fresh: true });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('reports signed out, unauthorized and offline without granting anything', async () => {
    session.userId = null;
    expect(await getEntitlements()).toMatchObject({ success: false, code: 'signed_out' });
    session.userId = 'u-1';
    rpc.mockResolvedValueOnce({ data: [{ ok: false, error: 'unauthorized' }], error: null });
    expect(await getEntitlements()).toMatchObject({ success: false, code: 'unauthorized' });
    rpc.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await getEntitlements()).toMatchObject({ success: false, code: 'offline' });
    supabaseAvailable = false;
    expect(await getEntitlements()).toMatchObject({ success: false, code: 'offline' });
  });
});

describe('consumeApplyQuota', () => {
  it('counts one application and returns what is left', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, error: null, plan: 'free', applies_per_day: 3, applies_used: 2, applies_remaining: 1 }], error: null });
    expect(await consumeApplyQuota()).toEqual({ ok: true, appliesPerDay: 3, appliesUsed: 2, appliesRemaining: 1 });
    expect(rpc).toHaveBeenCalledWith('consume_apply_quota', { p_user_id: 'u-1', p_session_token: 'tok', p_device_fingerprint: 'fp', p_count: 1 });
  });
  it('refuses with a clear message at the limit', async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, error: 'apply_limit_reached', plan: 'free', applies_per_day: 3, applies_used: 3, applies_remaining: 0 }], error: null });
    const r = await consumeApplyQuota();
    expect(r).toMatchObject({ ok: false, limitReached: true, appliesRemaining: 0 });
    expect(r.error).toMatch(/daily apply limit reached \(3 of 3/i);
  });
  it('fails closed when the server is unreachable or the session is gone', async () => {
    rpc.mockRejectedValue(new Error('network'));
    expect(await consumeApplyQuota()).toMatchObject({ ok: false });
    expect((await consumeApplyQuota()).error).toMatch(/nothing was submitted/i);
    session.sessionToken = null;
    expect(await consumeApplyQuota()).toMatchObject({ ok: false, error: expect.stringMatching(/sign in/i) });
  });
  it('maps every server refusal code to a message', () => {
    for (const code of ['account_suspended', 'unauthorized', 'bad_request', 'weird']) {
      expect(quotaRefusal(code, 3, 3).error).toBeTruthy();
    }
  });
});

describe('buildCheckoutUrl', () => {
  it('prefills email and user id on an https Razorpay page', () => {
    const u = new URL(buildCheckoutUrl('https://pages.razorpay.com/nomadic-pro', { email: 'a@b.co', userId: 'u-1' })!);
    expect(u.searchParams.get('email')).toBe('a@b.co');
    expect(u.searchParams.get('user_id')).toBe('u-1');
    expect(buildCheckoutUrl('https://rzp.io/l/abc', {})).toBe('https://rzp.io/l/abc');
  });
  it('rejects non-Razorpay or non-https pages', () => {
    expect(buildCheckoutUrl('http://pages.razorpay.com/x', {})).toBeNull();
    expect(buildCheckoutUrl('https://razorpay.com.evil.example/x', {})).toBeNull();
    expect(buildCheckoutUrl('not a url', {})).toBeNull();
  });
});
