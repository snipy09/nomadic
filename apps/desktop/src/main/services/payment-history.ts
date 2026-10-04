import type { PaymentHistoryResult, PaymentRecord } from '../../shared/ipc.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// Payment history (migration 024 billing_list_payments): the caller's own captured payments,
// session-checked on the server. Used for the Payments list and receipts in Settings → Account.

const PLANS: readonly PaymentRecord['plan'][] = ['pro', 'max', 'lifetime'];
const STATUSES: readonly PaymentRecord['status'][] = ['captured', 'failed', 'refunded'];

export function mapPaymentRow(row: Record<string, unknown>): PaymentRecord | null {
  const paymentId = typeof row['payment_id'] === 'string' ? row['payment_id'] : '';
  if (!paymentId) return null;
  const amount = Number(row['amount_inr']);
  const paidAt = row['paid_at'] ? new Date(String(row['paid_at'])) : null;
  return {
    paymentId,
    plan: PLANS.includes(row['plan'] as PaymentRecord['plan']) ? (row['plan'] as PaymentRecord['plan']) : 'pro',
    amountInr: row['amount_inr'] == null || !Number.isFinite(amount) ? null : amount,
    status: STATUSES.includes(row['status'] as PaymentRecord['status']) ? (row['status'] as PaymentRecord['status']) : 'captured',
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toISOString() : null,
  };
}

export async function getPaymentHistory(): Promise<PaymentHistoryResult> {
  const s = getActiveSyncSession();
  if (!s) return { success: false, code: 'signed_out', error: 'Sign in to see your payments.' };
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, code: 'offline', error: 'Could not reach Nomadic to load your payments.' };
  try {
    const { data, error } = await supabase.rpc('billing_list_payments', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
    });
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    if (rows[0] && rows[0]['ok'] === false) {
      return { success: false, code: 'unauthorized', error: 'Your session has ended. Sign in again to see your payments.' };
    }
    return { success: true, payments: rows.map(mapPaymentRow).filter((p): p is PaymentRecord => p !== null) };
  } catch (err: unknown) {
    log(`[Billing] billing_list_payments failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code: 'offline', error: 'Could not load your payments. Check your connection and try again.' };
  }
}
