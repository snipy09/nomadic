import { shell } from 'electron';
import type { BillingPlanId, CheckoutResult } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';

// ── Razorpay checkout (F9) ──────────────────────────────────────────────────
// Payment happens on a Razorpay Payment Page in the user's browser. The page
// URL per plan is injected at build time (RAZORPAY_CHECKOUT_URL_PRO /
// RAZORPAY_CHECKOUT_URL_MAX). The account email and user id are pre-filled so
// the razorpay-webhook edge function can match the payment to this account
// (it reads notes.user_id, then the payer email). The plan is never taken from
// the page: handle_razorpay_payment_success derives it from the amount paid.

const ALLOWED_HOSTS = ['razorpay.com', 'rzp.io'];

export function checkoutBaseUrl(plan: Exclude<BillingPlanId, 'free'>): string {
  return (plan === 'max' ? process.env.RAZORPAY_CHECKOUT_URL_MAX : process.env.RAZORPAY_CHECKOUT_URL_PRO) || '';
}

/** Builds the checkout URL, or null when the configured page is missing or not a Razorpay https URL. */
export function buildCheckoutUrl(base: string, prefill: { email?: string | null; userId?: string | null }): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (prefill.email) url.searchParams.set('email', prefill.email);
  if (prefill.userId) url.searchParams.set('user_id', prefill.userId);
  return url.toString();
}

function accountEmail(userId: string): string | null {
  try {
    const res = getDb().exec('SELECT email FROM user_cache WHERE supabase_id = ? LIMIT 1', [userId]);
    const v = res[0]?.values[0]?.[0];
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

export async function startCheckout(plan: Exclude<BillingPlanId, 'free'>): Promise<CheckoutResult> {
  const s = getActiveSyncSession();
  if (!s) return { success: false, error: 'Sign in before upgrading so the payment reaches your account.' };
  const base = checkoutBaseUrl(plan);
  if (!base) return { success: false, notConfigured: true, error: 'Online checkout is not available in this build.' };
  const url = buildCheckoutUrl(base, { email: accountEmail(s.userId), userId: s.userId });
  if (!url) {
    log('[Billing] Checkout URL is not an https Razorpay page; refusing to open it.');
    return { success: false, notConfigured: true, error: 'Online checkout is not available in this build.' };
  }
  try {
    await shell.openExternal(url);
    log(`[Billing] Opened ${plan} checkout in the browser.`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not open the browser.' };
  }
}
