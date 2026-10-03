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
  /** Applications the auto-apply engine may submit per week. */
  applicationsPerWeek: number;
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
      'Job match score on every listing',
      'Local-first candidate storage',
    ],
    limits: {
      learnTracks: 1,
      practicePerDay: 10,
      applicationsPerWeek: 0,
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
      'Semi-auto apply, 50 applications a week',
      '5 resumes',
    ],
    limits: {
      learnTracks: Infinity,
      practicePerDay: Infinity,
      applicationsPerWeek: 50,
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
      'Autonomous auto-apply, unlimited',
      'Priority job feed refresh',
      'Priority form solver and cloud sync',
    ],
    limits: {
      learnTracks: Infinity,
      practicePerDay: Infinity,
      applicationsPerWeek: Infinity,
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
