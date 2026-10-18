import type {
  BillingPlanId,
  UpiCreateOrderResult,
  UpiErrorCode,
  UpiListOrdersResult,
  UpiOrder,
  UpiOrderStatus,
  UpiSubmitUtrResult,
} from '../../shared/ipc.js';
import { log } from './app-context.js';
import { invalidateEntitlements } from './entitlements.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// UPI direct payments (migration 035). The user pays the operator's UPI ID with the order reference in the
// note and reports the 12-digit UTR; an admin checks it against the bank statement and approves, which
// activates the plan on the server. The UPI ID comes from the server (upi_settings), never from the build.

const MESSAGES: Record<UpiErrorCode, string> = {
  signed_out: 'Sign in to pay for a plan.',
  unauthorized: 'Your session has ended. Sign in again to pay for a plan.',
  offline: 'Could not reach Nomadic. Check your connection and try again.',
  not_configured: 'UPI payments are not set up yet.',
  invalid_plan: 'That plan cannot be bought.',
  rate_limited: 'Too many payment attempts today. Try again tomorrow or contact support.',
  invalid_utr: 'Enter the 12-digit UTR (UPI reference number) from your payment app.',
  not_found: 'This payment was not found. Start again.',
  already_submitted: 'This payment was already sent for review.',
  utr_used: 'This UTR was already used for another payment. Check the number in your payment app.',
  server_outdated: 'UPI payments are not available on the server yet.',
  invalid_coupon: 'That coupon code is not valid.',
  coupon_used: 'This account has already used a coupon.',
  coupon_not_eligible: 'Coupons are for the first paid month only, on an account that is on the Free plan.',
};

const fail = (code: UpiErrorCode) => ({ success: false as const, code, error: MESSAGES[code] });

const STATUSES: readonly UpiOrderStatus[] = ['awaiting_payment', 'submitted', 'approved', 'rejected'];
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function mapUpiOrder(row: Record<string, unknown>): UpiOrder | null {
  const orderId = strOrNull(row['order_id']);
  const reference = strOrNull(row['reference']);
  const amount = Number(row['amount_inr']);
  if (!orderId || !reference || !Number.isFinite(amount)) return null;
  const status = row['status'] as UpiOrderStatus;
  return {
    orderId,
    plan: row['plan'] === 'max' ? 'max' : 'pro',
    amountInr: amount,
    reference,
    utr: strOrNull(row['utr']),
    status: STATUSES.includes(status) ? status : 'awaiting_payment',
    createdAt: strOrNull(row['created_at']),
    submittedAt: strOrNull(row['submitted_at']),
    reviewedAt: strOrNull(row['reviewed_at']),
    reviewNote: strOrNull(row['review_note']),
    couponApplied: row['coupon_applied'] === true,
    listPriceInr: row['list_price_inr'] == null || !Number.isFinite(Number(row['list_price_inr'])) ? null : Number(row['list_price_inr']),
  };
}

/** Builds the UPI intent link any UPI app opens (NPCI deep-link format). */
export function upiIntentUrl(vpa: string, payeeName: string, amountInr: number, reference: string): string {
  const q = new URLSearchParams({ pa: vpa, pn: payeeName, am: amountInr.toFixed(2), cu: 'INR', tn: `Nomadic ${reference}` });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

type Rpc = { ok: true; body: Record<string, unknown> } | { ok: false; code: UpiErrorCode };

async function call(fn: string, params: Record<string, unknown>): Promise<Rpc> {
  const s = getActiveSyncSession();
  if (!s) return { ok: false, code: 'signed_out' };
  const supabase = getAnonSupabase();
  if (!supabase) return { ok: false, code: 'offline' };
  try {
    const { data, error } = await supabase.rpc(fn, {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      ...params,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      log(`[Billing] ${fn} failed: ${error.message}`);
      const missing = code === 'PGRST202' || code === '42883' || /could not find the function/i.test(error.message ?? '');
      return { ok: false, code: missing ? 'server_outdated' : 'offline' };
    }
    const body = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return { ok: false, code: 'offline' };
    if (body['ok'] !== true) {
      const code = String(body['error'] ?? '') as UpiErrorCode;
      log(`[Billing] ${fn} refused: ${code}`);
      return { ok: false, code: code in MESSAGES ? code : 'offline' };
    }
    return { ok: true, body };
  } catch (err: unknown) {
    log(`[Billing] ${fn} error: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, code: 'offline' };
  }
}

export async function createUpiOrder(plan: Exclude<BillingPlanId, 'free'>, coupon?: string): Promise<UpiCreateOrderResult> {
  const code = coupon?.replace(/\s/g, '').toUpperCase() ?? '';
  // The code is checked only on the server (037); it is never stored or logged here.
  const res = await call('billing_upi_create_order', code ? { p_plan: plan, p_coupon: code } : { p_plan: plan });
  if (!res.ok) return fail(res.code);
  const order = mapUpiOrder(res.body);
  const vpa = strOrNull(res.body['vpa']);
  if (!order || !vpa) return fail('offline');
  const payeeName = strOrNull(res.body['payee_name']) ?? 'Nomadic';
  return { success: true, payment: { order, vpa, payeeName, intentUrl: upiIntentUrl(vpa, payeeName, order.amountInr, order.reference) } };
}

export async function submitUpiUtr(orderId: string, utr: string): Promise<UpiSubmitUtrResult> {
  const clean = utr.replace(/\s/g, '');
  if (!/^\d{12}$/.test(clean)) return fail('invalid_utr');
  const res = await call('billing_upi_submit_utr', { p_order_id: orderId, p_utr: clean });
  if (!res.ok) return fail(res.code);
  log(`[Billing] UPI payment ${orderId} sent for review`);
  return { success: true };
}

export async function listUpiOrders(): Promise<UpiListOrdersResult> {
  const res = await call('billing_upi_list_orders', {});
  if (!res.ok) return fail(res.code);
  const rows = Array.isArray(res.body['orders']) ? (res.body['orders'] as Record<string, unknown>[]) : [];
  const orders = rows.map(mapUpiOrder).filter((o): o is UpiOrder => o !== null);
  // An approval changes the plan on the server; drop the cached entitlements so the next read is fresh.
  if (orders.some((o) => o.status === 'approved')) invalidateEntitlements();
  return { success: true, orders };
}
