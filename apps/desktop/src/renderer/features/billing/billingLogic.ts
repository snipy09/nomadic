import { getPlan, limitOrNull, normalizeTier, tierRank, type PlanId } from '@nomadic/config';
import type { Entitlements } from '../../../shared/ipc';

/** What the renderer knows about the plan: 'unknown' means the server could not be asked. */
export type EntitlementsStatus = 'loading' | 'ready' | 'unknown';

/**
 * Feed listings shown per page. Unknown (offline, signed out) is treated as
 * Free: paid features fail closed. Saved jobs are never limited by this.
 */
export function feedLimit(status: EntitlementsStatus, ent: Entitlements | null): number | null {
  if (status === 'ready' && ent) return ent.limits.feedJobs;
  return limitOrNull(getPlan('free').limits.feedJobs);
}

export type ApplyGate =
  | { kind: 'allowed'; remaining: number | null }
  | { kind: 'limit_reached'; limit: number | null }
  | { kind: 'suspended' }
  | { kind: 'loading' }
  | { kind: 'unknown'; error: string };

/** May the user start an apply run? The server still counts every submission. */
export function applyGate(status: EntitlementsStatus, ent: Entitlements | null, error?: string): ApplyGate {
  if (status === 'loading') return { kind: 'loading' };
  if (status !== 'ready' || !ent) return { kind: 'unknown', error: error || 'Could not check your plan.' };
  if (ent.accountStatus === 'suspended') return { kind: 'suspended' };
  if (ent.appliesRemaining === 0) return { kind: 'limit_reached', limit: ent.limits.appliesPerDay };
  return { kind: 'allowed', remaining: ent.appliesRemaining };
}

/** "2 of 3 applications left today" / "Unlimited applications". */
export function appliesLeftLabel(ent: Entitlements | null): string | null {
  if (!ent) return null;
  if (ent.limits.appliesPerDay === null) return 'Unlimited applications';
  const left = ent.appliesRemaining ?? 0;
  return `${left} of ${ent.limits.appliesPerDay} application${ent.limits.appliesPerDay === 1 ? '' : 's'} left today`;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One line under the plan name in Settings > Account. */
export function renewalLine(ent: Entitlements, now: Date = new Date()): string {
  const date = formatDate(ent.expiresAt);
  if (ent.accountStatus === 'suspended') return 'This account is suspended. Contact support.';
  if (ent.accountStatus === 'expired') {
    const was = ent.storedTier && ent.storedTier !== 'trial' ? getPlan(normalizeTier(ent.storedTier)).name : 'Your trial';
    return date ? `${was} ended on ${date}. You are on the Free plan.` : 'Your paid period ended. You are on the Free plan.';
  }
  if (ent.plan === 'free') return ent.storedTier === 'trial' && date ? `Trial account until ${date}. Upgrade any time.` : 'Upgrade any time.';
  if (!date) return 'No end date.';
  const days = Math.ceil((new Date(ent.expiresAt!).getTime() - now.getTime()) / 86_400_000);
  return days <= 7 ? `Paid until ${date} (${days} day${days === 1 ? '' : 's'} left). Pay again to renew.` : `Paid until ${date}. Pay again before then to renew.`;
}

export const planRank = (p: PlanId): number => tierRank(p);
