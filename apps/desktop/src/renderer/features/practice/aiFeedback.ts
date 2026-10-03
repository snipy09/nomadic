/**
 * AI rubric feedback on written answers: the typed client the Practice area
 * talks to. Decision 12/20: the model runs behind a server-side proxy that
 * holds the key and enforces per-user limits. That proxy does not exist yet,
 * so the only client is `unavailableFeedbackClient`; no model is called and
 * no feedback is ever produced locally.
 */
import type { RubricCriterion, RubricFeedback, RubricFeedbackRequest } from '../../../shared/ipc';

/** The rubric sent with every written answer. Scores are 0-4 per criterion. */
export const ANSWER_RUBRIC: RubricCriterion[] = [
  { id: 'correctness', label: 'Correctness', description: 'The answer is technically right and answers the question asked.' },
  { id: 'structure', label: 'Structure', description: 'Ideas come in a clear order: approach first, then details.' },
  { id: 'depth', label: 'Depth', description: 'Trade-offs, edge cases or complexity are discussed where they matter.' },
  { id: 'communication', label: 'Communication', description: 'Concise, specific wording an interviewer can follow.' },
];

export const RUBRIC_MAX_SCORE = 4;
export const ANSWER_MAX_CHARS = 8000;

export type FeedbackAvailability =
  | { available: true }
  | { available: false; reason: string };

export interface RubricFeedbackClient {
  availability(): FeedbackAvailability;
  request(req: RubricFeedbackRequest): Promise<RubricFeedback>;
}

export class FeedbackUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FeedbackUnavailableError';
  }
}

const UNAVAILABLE_REASON = 'AI feedback is not available yet. It needs the Nomadic feedback service, which is still being built.';

export const unavailableFeedbackClient: RubricFeedbackClient = {
  availability: () => ({ available: false, reason: UNAVAILABLE_REASON }),
  request: () => Promise.reject(new FeedbackUnavailableError(UNAVAILABLE_REASON)),
};

/** The client the Practice area uses. Swap in an IPC-backed client once the server proxy exists. */
export function getFeedbackClient(): RubricFeedbackClient {
  return unavailableFeedbackClient;
}

/**
 * Checks a reply before it is shown: one item per rubric criterion, scores in
 * range, and every quote copied verbatim from the answer (the model must
 * quote, never paraphrase or invent). Returns the problems found.
 */
export function validateRubricFeedback(answer: string, rubric: RubricCriterion[], fb: RubricFeedback): string[] {
  const problems: string[] = [];
  const ids = new Set(rubric.map((r) => r.id));
  const seen = new Set<string>();
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const haystack = norm(answer);
  for (const item of fb.items) {
    if (!ids.has(item.criterionId)) problems.push(`Unknown criterion "${item.criterionId}".`);
    if (seen.has(item.criterionId)) problems.push(`Criterion "${item.criterionId}" scored twice.`);
    seen.add(item.criterionId);
    if (!Number.isInteger(item.score) || item.score < 0 || item.score > RUBRIC_MAX_SCORE) problems.push(`Score for "${item.criterionId}" is out of range.`);
    if (item.quote && !haystack.includes(norm(item.quote))) problems.push(`Quote for "${item.criterionId}" is not in the answer.`);
  }
  for (const id of ids) if (!seen.has(id)) problems.push(`Criterion "${id}" was not scored.`);
  return problems;
}
