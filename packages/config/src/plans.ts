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
  /**
   * AI rubric feedback requests per day (Asia/Kolkata day); 0 when the plan has no
   * AI feedback. Enforced by the AI proxy through migration 020 consume_ai_quota.
   */
  aiFeedbackPerDay: number;
  /**
   * Batched AI form-answer calls per day (one call per form page with open-ended
   * questions). Enforced by the AI proxy through migration 020 consume_ai_quota.
   */
  aiFormCallsPerDay: number;
  /**
   * AI Learn roadmap generations per day (Asia/Kolkata day). Enforced by the AI proxy
   * through migration 029 consume_ai_quota; the rules planner is always free.
   */
  aiRoadmapPerDay: number;
  /** AI roadmap adjustments per day. Enforced by the AI proxy (migration 029). */
  aiRoadmapAdjustPerDay: number;
  /** Learn projects in progress at once (Infinity = unlimited). Free plans get beginner projects only. */
  learnProjectsActive: number;
  /**
   * AI outreach drafts per day (one email or LinkedIn note each). Enforced by the AI
   * proxy through migration 027 consume_ai_quota.
   */
  aiOutreachDraftsPerDay: number;
  /**
   * AI help answers per day inside a guided project ("I'm stuck on this step"). Enforced by
   * the AI proxy through migration 030 consume_ai_quota; the rest of the guided build is free.
   */
  aiProjectHelpPerDay: number;
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
      aiFeedbackPerDay: 0,
      aiFormCallsPerDay: 10,
      aiRoadmapPerDay: 2,
      aiRoadmapAdjustPerDay: 2,
      learnProjectsActive: 1,
      aiOutreachDraftsPerDay: 3,
      aiProjectHelpPerDay: 5,
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
      aiFeedbackPerDay: 30,
      aiFormCallsPerDay: 40,
      aiRoadmapPerDay: 10,
      aiRoadmapAdjustPerDay: 15,
      learnProjectsActive: 3,
      aiOutreachDraftsPerDay: 25,
      aiProjectHelpPerDay: 40,
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
      aiFeedbackPerDay: 100,
      aiFormCallsPerDay: 300,
      aiRoadmapPerDay: 20,
      aiRoadmapAdjustPerDay: 40,
      learnProjectsActive: Infinity,
      aiOutreachDraftsPerDay: 100,
      aiProjectHelpPerDay: 150,
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

/**
 * The rows of `public.ai_limits()` (migration 029, which replaced 020's), rendered from PLANS.
 * Column order: (plan, ai_feedback, ai_feedback_per_day, ai_form_calls_per_day,
 * ai_roadmap_per_day, ai_roadmap_adjust_per_day).
 * AI limits are always finite (every call costs the operator money).
 */
export function aiLimitsSqlRows(): string[] {
  return PLANS.map((p, i) => {
    const l = p.limits;
    const nums = [l.aiFeedbackPerDay, l.aiFormCallsPerDay, l.aiRoadmapPerDay, l.aiRoadmapAdjustPerDay];
    if (!nums.every(Number.isFinite)) {
      throw new Error(`AI limits must be finite (plan ${p.id})`);
    }
    const row = `('${p.id}', ${l.aiFeedback ? 'TRUE' : 'FALSE'}, ${nums.join(', ')})`;
    return i < PLANS.length - 1 ? `${row},` : row;
  });
}

/**
 * The rows of `public.ai_outreach_limits()` in migration 027, rendered from PLANS.
 * Column order: (plan, ai_outreach_drafts_per_day).
 */
export function aiOutreachLimitsSqlRows(): string[] {
  return PLANS.map((p, i) => {
    const n = p.limits.aiOutreachDraftsPerDay;
    if (!Number.isFinite(n)) throw new Error(`AI limits must be finite (plan ${p.id})`);
    const row = `('${p.id}', ${n})`;
    return i < PLANS.length - 1 ? `${row},` : row;
  });
}

/**
 * The rows of `public.ai_project_help_limits()` in migration 030, rendered from PLANS.
 * Column order: (plan, ai_project_help_per_day).
 */
export function aiProjectHelpLimitsSqlRows(): string[] {
  return PLANS.map((p, i) => {
    const n = p.limits.aiProjectHelpPerDay;
    if (!Number.isFinite(n)) throw new Error(`AI limits must be finite (plan ${p.id})`);
    const row = `('${p.id}', ${n})`;
    return i < PLANS.length - 1 ? `${row},` : row;
  });
}
