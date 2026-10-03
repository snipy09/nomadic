import type { BillingPlanId, Entitlements, EntitlementsResult } from '../../shared/ipc.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// ── Entitlements (F9) ───────────────────────────────────────────────────────
// The server (migration 011) is the only authority on plan and limits:
//   get_entitlements     -> plan, expiry, today's usage
//   consume_apply_quota  -> atomically counts applications against today's limit
// Main caches entitlements for a few seconds so screens can ask freely while a
// plan change still shows up within the "< 10 s" bar. Nothing here grants a
// paid feature when the server cannot be reached (fail closed).

export const ENTITLEMENTS_TTL_MS = 5_000;

const PLAN_IDS: readonly BillingPlanId[] = ['free', 'pro', 'max'];

let cache: { key: string; at: number; value: Entitlements } | null = null;

export function invalidateEntitlements(): void {
  cache = null;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Maps one get_entitlements row to the IPC shape. Unknown plan strings are Free. */
export function mapEntitlementsRow(row: Record<string, unknown>, now: Date = new Date()): Entitlements {
  const plan = PLAN_IDS.includes(row['plan'] as BillingPlanId) ? (row['plan'] as BillingPlanId) : 'free';
  const status = row['account_status'];
  return {
    plan,
    storedTier: row['stored_tier'] == null ? null : String(row['stored_tier']),
    accountStatus: status === 'suspended' || status === 'expired' ? status : 'active',
    expiresAt: iso(row['expires_at']),
    limits: {
      appliesPerDay: num(row['applies_per_day']),
      feedJobs: num(row['feed_jobs']),
      learnTracks: num(row['learn_tracks']),
      practicePerDay: num(row['practice_per_day']),
      autonomousApply: row['autonomous_apply'] === true,
      resumes: num(row['resumes']),
    },
    usage: {
      appliesToday: num(row['applies_used']) ?? 0,
      learnTracksActive: num(row['learn_tracks_active']) ?? 0,
    },
    appliesRemaining: num(row['applies_remaining']),
    resetsAt: iso(row['resets_at']),
    fetchedAt: now.toISOString(),
  };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

/** Server entitlements for the signed-in device session. */
export async function getEntitlements(options: { fresh?: boolean } = {}): Promise<EntitlementsResult> {
  const s = getActiveSyncSession();
  if (!s) return { success: false, code: 'signed_out', error: 'Sign in to see your plan.' };
  const key = `${s.userId}:${s.sessionToken}`;
  if (!options.fresh && cache && cache.key === key && Date.now() - cache.at < ENTITLEMENTS_TTL_MS) {
    return { success: true, entitlements: cache.value };
  }
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, code: 'offline', error: 'Could not reach Nomadic to check your plan.' };
  try {
    const { data, error } = await supabase.rpc('get_entitlements', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('empty response');
    if (row['ok'] !== true) {
      invalidateEntitlements();
      return { success: false, code: 'unauthorized', error: 'Your session has ended. Sign in again to see your plan.' };
    }
    const value = mapEntitlementsRow(row);
    cache = { key, at: Date.now(), value };
    return { success: true, entitlements: value };
  } catch (err: unknown) {
    log(`[Billing] get_entitlements failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code: 'offline', error: 'Could not reach Nomadic to check your plan. Check your connection and try again.' };
  }
}

export interface QuotaResult {
  ok: boolean;
  /** Human-readable reason when refused. */
  error?: string;
  limitReached?: boolean;
  appliesPerDay?: number | null;
  appliesUsed?: number;
  appliesRemaining?: number | null;
}

/** Message shown when the server refuses an application. */
export function quotaRefusal(code: string, limit: number | null | undefined, used: number | undefined): QuotaResult {
  switch (code) {
    case 'apply_limit_reached':
      return {
        ok: false,
        limitReached: true,
        appliesPerDay: limit ?? null,
        appliesUsed: used,
        appliesRemaining: limit == null ? null : Math.max(0, limit - (used ?? 0)),
        error: `Daily apply limit reached (${used ?? 0} of ${limit ?? 0} used today). It resets at midnight, or upgrade for more.`,
      };
    case 'account_suspended':
      return { ok: false, error: 'This account is suspended. Contact support.' };
    case 'unauthorized':
      return { ok: false, error: 'Your session has ended. Sign in again before submitting.' };
    case 'bad_request':
      return { ok: false, error: 'Too many applications in one request.' };
    default:
      return { ok: false, error: 'Could not reach Nomadic to check your apply limit. Nothing was submitted. Check your connection and try again.' };
  }
}

/**
 * Counts `count` applications against today's server-side limit, all or
 * nothing. Call immediately before submitting; never submit when `ok` is false.
 */
export async function consumeApplyQuota(count = 1): Promise<QuotaResult> {
  const s = getActiveSyncSession();
  if (!s) return { ok: false, error: 'Sign in to submit applications.' };
  const supabase = getAnonSupabase();
  if (!supabase) return quotaRefusal('offline', null, 0);
  try {
    const { data, error } = await supabase.rpc('consume_apply_quota', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_count: count,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('empty response');
    invalidateEntitlements();
    const limit = num(row['applies_per_day']);
    const used = num(row['applies_used']) ?? undefined;
    if (row['ok'] !== true) return quotaRefusal(String(row['error'] ?? ''), limit, used);
    return { ok: true, appliesPerDay: limit, appliesUsed: used, appliesRemaining: num(row['applies_remaining']) };
  } catch (err: unknown) {
    log(`[Billing] consume_apply_quota failed: ${err instanceof Error ? err.message : String(err)}`);
    return quotaRefusal('offline', null, 0);
  }
}
