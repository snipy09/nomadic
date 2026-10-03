/**
 * Plans and prices. The ONLY place prices are defined: the website, the
 * desktop app's upgrade screens and admin read from here.
 */
export type PlanId = 'free' | 'pro' | 'max';

export interface PlanLimits {
  /** Active Learn tracks (Infinity = unlimited). */
  learnTracks: number;
  /** Graded practice attempts per day. */
  practicePerDay: number;
  /**
   * Reviewed applications that may be submitted per day (Asia/Kolkata day).
   * Enforced by the server (migration 011 consume_apply_quota).
   */
  appliesPerDay: number;
  /** Job board listings visible per page; Infinity = the full board with paging. */
  feedJobs: number;
  autonomousApply: boolean;
  companyQuestionSets: boolean;
  aiFeedback: boolean;
  resumes: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in INR (whole rupees). */
  priceInr: number;
  summary: string;
  features: string[];
  featured: boolean;
  limits: PlanLimits;
}

export const CURRENCY = 'INR';

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    summary: 'See how the pieces fit together.',
    featured: false,
    features: [
      '1 active learning track',
      '10 practice questions a day, with spaced review',
      'Top 10 curated direct jobs',
      'Apply with review, 3 applications a day',
      'Job match score on every listing',
      'Local-first candidate storage',
    ],
    limits: {
      learnTracks: 1,
      practicePerDay: 10,
      appliesPerDay: 3,
      feedJobs: 10,
      autonomousApply: false,
      companyQuestionSets: false,
      aiFeedback: false,
      resumes: 1,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceInr: 249,
    summary: 'The full toolkit, with you approving each application.',
    featured: true,
    features: [
      'Unlimited learning tracks and practice',
      'Company question sets and AI feedback on answers',
      'Full direct ATS job feed with 18, 36 and 54 per page',
      'Apply with review, 10 applications a day',
      '5 resumes',
    ],
    limits: {
      learnTracks: Infinity,
      practicePerDay: Infinity,
      appliesPerDay: 10,
      feedJobs: Infinity,
      autonomousApply: false,
      companyQuestionSets: true,
      aiFeedback: true,
      resumes: 5,
    },
  },
  {
    id: 'max',
    name: 'Max',
    priceInr: 599,
    summary: 'Everything in Pro, with Nomadic running the repetitive work.',
    featured: false,
    features: [
      'Everything in Pro',
      'Unlimited applications, including autonomous apply',
      'Priority job feed refresh',
      'Priority form solver and cloud sync',
    ],
    limits: {
      learnTracks: Infinity,
      practicePerDay: Infinity,
      appliesPerDay: Infinity,
      feedJobs: Infinity,
      autonomousApply: true,
      companyQuestionSets: true,
      aiFeedback: true,
      resumes: Infinity,
    },
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan ${id}`);
  return plan;
}

export function formatPrice(priceInr: number): string {
  return `₹${priceInr.toLocaleString('en-IN')}`;
}

/** "Free costs ₹0. Pro is ₹249 a month and Max is ₹599 a month." */
export function pricingSentence(): string {
  const [free, ...paid] = PLANS;
  const parts = paid.map((p) => `${p.name} is ${formatPrice(p.priceInr)} a month`);
  return `${free.name} costs ${formatPrice(free.priceInr)}. ${parts.join(' and ')}.`;
}

/** Unlimited (Infinity) limits travel as null over JSON, IPC and SQL. */
export function limitOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/** Remaining allowance (null = unlimited), never below zero. */
export function remainingAllowance(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used);
}

/**
 * The rows of `public.plan_limits()` in migration 011, rendered from PLANS.
 * A test asserts the migration contains exactly these lines, so limits stay
 * defined only here. Column order: (plan, applies_per_day, feed_jobs,
 * learn_tracks, practice_per_day, autonomous_apply, resumes); NULL = unlimited.
 */
export function planLimitsSqlRows(): string[] {
  const n = (v: number) => (Number.isFinite(v) ? String(v) : 'NULL');
  return PLANS.map((p, i) => {
    const l = p.limits;
    const row = `('${p.id}', ${n(l.appliesPerDay)}, ${n(l.feedJobs)}, ${n(l.learnTracks)}, ${n(l.practicePerDay)}, ${l.autonomousApply ? 'TRUE' : 'FALSE'}, ${n(l.resumes)})`;
    return i < PLANS.length - 1 ? `${row},` : row;
  });
}
