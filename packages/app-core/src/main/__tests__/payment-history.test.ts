import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionToken: string; deviceFingerprint: string },
  rpc: vi.fn(),
}));
vi.mock('../services/session', () => ({ getActiveSyncSession: () => h.session }));
vi.mock('../services/supabase', () => ({ getAnonSupabase: () => ({ rpc: h.rpc }) }));
vi.mock('../services/app-context', () => ({ log: vi.fn() }));

import { getPaymentHistory, mapPaymentRow } from '../services/payment-history';

beforeEach(() => {
  h.session = { userId: 'u-1', sessionToken: 'tok', deviceFingerprint: 'fp' };
  h.rpc.mockReset();
});

describe('payment history', () => {
  it('maps rows and passes the device session', async () => {
    h.rpc.mockResolvedValue({
      data: [
        { ok: true, payment_id: 'pay_2', plan: 'max', amount_inr: '599.00', status: 'captured', paid_at: '2026-10-02T10:00:00Z' },
        { ok: true, payment_id: 'pay_1', plan: 'pro', amount_inr: 249, status: 'refunded', paid_at: '2026-09-01T10:00:00Z' },
      ],
      error: null,
    });
    const res = await getPaymentHistory();
    expect(h.rpc).toHaveBeenCalledWith('billing_list_payments', { p_user_id: 'u-1', p_session_token: 'tok', p_device_fingerprint: 'fp' });
    expect(res).toEqual({
      success: true,
      payments: [
        { paymentId: 'pay_2', plan: 'max', amountInr: 599, status: 'captured', paidAt: '2026-10-02T10:00:00.000Z' },
        { paymentId: 'pay_1', plan: 'pro', amountInr: 249, status: 'refunded', paidAt: '2026-09-01T10:00:00.000Z' },
      ],
    });
  });

  it('no payments is an empty list, not an error', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getPaymentHistory()).toEqual({ success: true, payments: [] });
  });

  it('signed out, ended session and network errors are distinct', async () => {
    h.session = null;
    expect(await getPaymentHistory()).toMatchObject({ success: false, code: 'signed_out' });
    h.session = { userId: 'u-1', sessionToken: 'tok', deviceFingerprint: 'fp' };
    h.rpc.mockResolvedValue({ data: [{ ok: false, error: 'unauthorized' }], error: null });
    expect(await getPaymentHistory()).toMatchObject({ success: false, code: 'unauthorized' });
    h.rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    expect(await getPaymentHistory()).toMatchObject({ success: false, code: 'offline' });
  });

  it('never invents values: unknown amount stays null, rows without an id are dropped', () => {
    expect(mapPaymentRow({ payment_id: 'p', plan: 'weird', amount_inr: null, status: 'x', paid_at: null }))
      .toEqual({ paymentId: 'p', plan: 'pro', amountInr: null, status: 'captured', paidAt: null });
    expect(mapPaymentRow({ payment_id: '' })).toBeNull();
  });
});
