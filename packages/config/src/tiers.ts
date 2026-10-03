import type { PlanId } from './plans';

/**
 * Maps any stored tier string (users_profile.subscription_tier, legacy aliases)
 * to a plan. Unknown, empty and 'trial' are Free.
 */
export function normalizeTier(tier?: string | null): PlanId {
  const t = String(tier ?? '')
    .toLowerCase()
    .trim();
  if (['max', 'seeker_max', 'lifetime', 'enterprise', 'turbo'].includes(t)) return 'max';
  if (['pro', 'lite', 'learner_pro', 'seeker_pro', 'learner', 'seeker'].includes(t)) return 'pro';
  return 'free';
}

const RANK: Record<PlanId, number> = { free: 0, pro: 1, max: 2 };

export function tierRank(tier?: string | null): number {
  return RANK[normalizeTier(tier)];
}

export function hasPlanAccess(userTier: string | null | undefined, required: PlanId): boolean {
  return tierRank(userTier) >= RANK[required];
}
