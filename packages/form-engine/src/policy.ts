/**
 * Answer policy for legal, consent and self-identification questions.
 *
 * These questions are NEVER sent to a language model. What the engine does with
 * each class is decided here, in reviewable config. Change a value to
 * 'needs_user' to make the engine stop and ask instead of answering.
 *
 * REVIEW REQUIRED: the defaults below are a proposal and should be signed off by
 * the product owner before shipping.
 */

export type PolicyAction = 'accept' | 'decline' | 'needs_user';

export interface FormPolicy {
  /**
   * Mutual arbitration agreement acknowledgements (Ashby/Greenhouse). These are
   * usually mandatory to apply; acknowledging receipt is the default.
   */
  arbitration: Exclude<PolicyAction, 'decline'>;
  /** "I certify the information provided is true and correct." */
  certification: Exclude<PolicyAction, 'decline'>;
  /** Required privacy notice / data processing / terms consent for the application itself. */
  privacyConsent: Exclude<PolicyAction, 'decline'>;
  /** Marketing, job alerts, talent community, "contact me about future roles". */
  marketingOptIn: PolicyAction;
  /**
   * EEO / voluntary self-identification (gender, race, ethnicity, veteran,
   * disability, sexual orientation) when the profile has no explicit answer.
   */
  selfIdentification: 'decline' | 'needs_user';
  /** Generate a PDF resume from profile facts when no resume file exists. */
  generateResumeWhenMissing: boolean;
}

export const DEFAULT_POLICY: FormPolicy = {
  arbitration: 'accept',
  certification: 'accept',
  privacyConsent: 'accept',
  marketingOptIn: 'decline',
  selfIdentification: 'decline',
  generateResumeWhenMissing: true,
};

/** Option patterns used to pick the right choice for each policy decision. */
export const POLICY_OPTION_PATTERNS = {
  accept: ['^(i )?(acknowledge|agree|accept|consent|certify|confirm)', '\\b(acknowledge|agree|accept|consent|certify|confirm)\\b', '^yes\\b'],
  decline: ['^no\\b', '\\b(do not|don\'t|decline|opt out|unsubscribe)\\b'],
  /** Ordered from most to least specific. */
  selfIdDecline: [
    "decline to (self[- ]?identify|answer|state|disclose)",
    "(do not|don't|dont) wish to (self[- ]?identify|answer|disclose|provide)",
    'prefer not to (say|answer|disclose|self[- ]?identify)',
    'choose not to (disclose|answer|self[- ]?identify)',
    'not (wish|want) to',
    '\\bdecline\\b',
    'prefer not',
  ],
};
