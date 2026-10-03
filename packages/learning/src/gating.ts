/**
 * Free vs paid limits for Learn, read from the shared plan config
 * (@nomadic/config). The server enforces the same numbers in migration 007
 * (learning_start_track / learning_record_events).
 */
import { getPlan, normalizeTier, type PlanId } from '@nomadic/config';

export type LearnTier = PlanId;

export interface LearnLimits {
  activeTracks: number;
  practicePerDay: number;
  companySets: boolean;
  aiFeedback: boolean;
}

function limitsFor(id: PlanId): LearnLimits {
  const l = getPlan(id).limits;
  return { activeTracks: l.learnTracks, practicePerDay: l.practicePerDay, companySets: l.companyQuestionSets, aiFeedback: l.aiFeedback };
}

export const LEARN_LIMITS: Record<LearnTier, LearnLimits> = { free: limitsFor('free'), pro: limitsFor('pro'), max: limitsFor('max') };

/** users_profile.subscription_tier -> Learn tier ('trial' and unknown are free). */
export function learnTierFor(subscriptionTier: string | null | undefined): LearnTier {
  return normalizeTier(subscriptionTier);
}
