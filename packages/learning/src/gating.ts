/**
 * Free vs paid limits for Learn. The server enforces the same numbers
 * (migration 007: learning_can_start_track / learning_record_practice).
 * Free = 1 active track + 10 practice attempts per day.
 */
export type LearnTier = 'free' | 'pro' | 'max';

export interface LearnLimits {
  activeTracks: number;
  practicePerDay: number;
  companySets: boolean;
  aiFeedback: boolean;
}

export const LEARN_LIMITS: Record<LearnTier, LearnLimits> = {
  free: { activeTracks: 1, practicePerDay: 10, companySets: false, aiFeedback: false },
  pro: { activeTracks: Infinity, practicePerDay: Infinity, companySets: true, aiFeedback: true },
  max: { activeTracks: Infinity, practicePerDay: Infinity, companySets: true, aiFeedback: true },
};

/** users_profile.subscription_tier -> Learn tier ('trial' and unknown are free). */
export function learnTierFor(subscriptionTier: string | null | undefined): LearnTier {
  if (subscriptionTier === 'max' || subscriptionTier === 'enterprise' || subscriptionTier === 'lifetime') return 'max';
  if (subscriptionTier === 'pro') return 'pro';
  return 'free';
}
