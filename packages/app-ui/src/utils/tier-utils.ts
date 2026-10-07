import { formatPrice, getPlan, normalizeTier as normalizeConfigTier } from '@nomadic/config';

export type SubscriptionTier = 'free' | 'pro' | 'max';

/**
 * 3-tier normalization (Free / Pro / Max); prices live in @nomadic/config
 * Maps legacy database tier strings and aliases to canonical 3-tier system:
 * - 'free' | 'trial' -> 'free'
 * - 'pro' | 'lite' | 'learner_pro' | 'seeker_pro' | 'learner' | 'seeker' -> 'pro'
 * - 'max' | 'seeker_max' | 'lifetime' | 'enterprise' | 'turbo' -> 'max'
 */
export function normalizeTier(tier?: string | null): SubscriptionTier {
  return normalizeConfigTier(tier);
}

/**
 * Returns numeric hierarchy rank for permissions:
 * 0: Free
 * 1: Pro
 * 2: Max
 */
export function getTierLevel(tier?: string | null): number {
  const norm = normalizeTier(tier);
  switch (norm) {
    case 'pro':
      return 1;
    case 'max':
      return 2;
    default:
      return 0;
  }
}

/**
 * Checks if a user's tier has at least the required tier level
 */
export function hasFeatureAccess(
  userTier: string | null | undefined,
  requiredTier: SubscriptionTier
): boolean {
  return getTierLevel(userTier) >= getTierLevel(requiredTier);
}

export function getTierDisplayName(tier?: string | null): string {
  const plan = getPlan(normalizeTier(tier));
  return plan.priceInr === 0 ? `${plan.name} Plan` : `${plan.name} Plan (${formatPrice(plan.priceInr)}/mo)`;
}

export function getTierBadgeProps(tier?: string | null): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  const norm = normalizeTier(tier);
  switch (norm) {
    case 'max':
      return {
        label: 'MAX',
        bgClass: 'bg-ink-950 dark:bg-white',
        textClass: 'text-white dark:text-ink-950',
        borderClass: 'border-ink-800 dark:border-white',
      };
    case 'pro':
      return {
        label: 'PRO',
        bgClass: 'bg-powder-600',
        textClass: 'text-white',
        borderClass: 'border-powder-500',
      };
    default:
      return {
        label: 'FREE',
        bgClass: 'bg-ink-100 dark:bg-ink-800',
        textClass: 'text-ink-600 dark:text-ink-400',
        borderClass: 'border-ink-200 dark:border-ink-700',
      };
  }
}
