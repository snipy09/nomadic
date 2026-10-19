import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionToken: string; deviceFingerprint: string },
  rpc: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../services/session', () => ({ getActiveSyncSession: () => h.session }));
vi.mock('../services/supabase', () => ({ getAnonSupabase: () => ({ rpc: h.rpc }) }));
vi.mock('../services/app-context', () => ({ log: vi.fn() }));
vi.mock('../services/entitlements', () => ({ invalidateEntitlements: h.invalidate }));

import { createUpiOrder, listUpiOrders, submitUpiUtr, upiIntentUrl } from '../services/upi-payments';

const SESSION = { p_user_id: 'u-1', p_session_token: 'tok', p_device_fingerprint: 'fp' };
const row = (over: Record<string, unknown> = {}) => ({
  order_id: 'o-1', plan: 'pro', amount_inr: '249.00', reference: 'NMD-7K3Q9X', utr: null, status: 'awaiting_payment',
  created_at: '2026-10-17T10:00:00Z', submitted_at: null, reviewed_at: null, review_note: null, ...over,
});

beforeEach(() => {
  h.session = { userId: 'u-1', sessionToken: 'tok', deviceFingerprint: 'fp' };
  h.rpc.mockReset();
  h.invalidate.mockReset();
});

describe('UPI payments', () => {
  it('builds a UPI intent link with the amount and reference', () => {
    const url = upiIntentUrl('shop@okbank', 'Nomadic Learning', 249, 'NMD-7K3Q9X');
    expect(url).toBe('upi://pay?pa=shop%40okbank&pn=Nomadic%20Learning&am=249.00&cu=INR&tn=Nomadic%20NMD-7K3Q9X');
  });

  it('creates an order with the server UPI ID and the device session', async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, ...row(), vpa: 'shop@okbank', payee_name: 'Nomadic' }, error: null });
    const res = await createUpiOrder('pro');
    expect(h.rpc).toHaveBeenCalledWith('billing_upi_create_order', { ...SESSION, p_plan: 'pro' });
    expect(res).toMatchObject({
      success: true,
      payment: { vpa: 'shop@okbank', payeeName: 'Nomadic', order: { orderId: 'o-1', amountInr: 249, reference: 'NMD-7K3Q9X', status: 'awaiting_payment' } },
    });
    if (res.success) expect(res.payment.intentUrl).toContain('am=249.00');
  });

  it('sends a coupon code upper-cased and maps the discounted order', async () => {
    h.rpc.mockResolvedValue({
      data: { ok: true, ...row({ amount_inr: 1, coupon_applied: true, list_price_inr: 249 }), vpa: 'shop@okbank', payee_name: 'Nomadic' },
      error: null,
    });
    const res = await createUpiOrder('pro', ' ab cd ');
    expect(h.rpc).toHaveBeenCalledWith('billing_upi_create_order', { ...SESSION, p_plan: 'pro', p_coupon: 'ABCD' });
    expect(res).toMatchObject({ success: true, payment: { order: { amountInr: 1, couponApplied: true, listPriceInr: 249 } } });
    if (res.success) expect(res.payment.intentUrl).toContain('am=1.00');
  });

  it('maps coupon refusals', async () => {
    for (const code of ['invalid_coupon', 'coupon_used', 'coupon_not_eligible'] as const) {
      h.rpc.mockResolvedValue({ data: { ok: false, error: code }, error: null });
      expect(await createUpiOrder('max', 'X')).toMatchObject({ success: false, code });
    }
  });

  it('maps refusals, missing functions and network errors to codes', async () => {
    h.session = null;
    expect(await createUpiOrder('pro')).toMatchObject({ success: false, code: 'signed_out' });
    h.session = { userId: 'u-1', sessionToken: 'tok', deviceFingerprint: 'fp' };
    h.rpc.mockResolvedValue({ data: { ok: false, error: 'not_configured' }, error: null });
    expect(await createUpiOrder('max')).toMatchObject({ success: false, code: 'not_configured' });
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await createUpiOrder('max')).toMatchObject({ success: false, code: 'server_outdated' });
    h.rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    expect(await createUpiOrder('max')).toMatchObject({ success: false, code: 'offline' });
    h.rpc.mockResolvedValue({ data: { ok: false, error: 'something_new' }, error: null });
    expect(await createUpiOrder('max')).toMatchObject({ success: false, code: 'offline' });
  });

  it('checks the UTR before calling the server', async () => {
    expect(await submitUpiUtr('o-1', '12345')).toMatchObject({ success: false, code: 'invalid_utr' });
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await submitUpiUtr('o-1', '4123 4567 8901')).toEqual({ success: true });
    expect(h.rpc).toHaveBeenCalledWith('billing_upi_submit_utr', { ...SESSION, p_order_id: 'o-1', p_utr: '412345678901' });
    h.rpc.mockResolvedValue({ data: { ok: false, error: 'utr_used' }, error: null });
    expect(await submitUpiUtr('o-2', '412345678901')).toMatchObject({ success: false, code: 'utr_used' });
  });

  it('lists orders and drops cached entitlements once one is approved', async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, orders: [row({ status: 'submitted', utr: '412345678901' })] }, error: null });
    const res = await listUpiOrders();
    expect(res).toMatchObject({ success: true, orders: [{ orderId: 'o-1', status: 'submitted', utr: '412345678901' }] });
    expect(h.invalidate).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: { ok: true, orders: [row({ status: 'approved' }), { bad: true }] }, error: null });
    const res2 = await listUpiOrders();
    expect(res2.success && res2.orders).toHaveLength(1);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
});
