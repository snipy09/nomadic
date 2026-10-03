/**
 * AI rubric feedback on written answers: the typed client the Practice area
 * talks to. Decisions 12/20/23: the model runs behind the server-side Nomadic AI
 * proxy, which holds the key and enforces the plan (`aiFeedback`) and the daily
 * quota. The renderer asks main over IPC ('ai-rubric-feedback'); main calls the
 * proxy. No model is ever called from the renderer and no feedback is produced
 * locally. Every reply is checked again here before it is shown.
 */
import type { AiErrorCode, AiQuota, RubricCriterion, RubricFeedback, RubricFeedbackRequest } from '../../../shared/ipc';
import { getApi, type ElectronAPI } from '../../types';

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

/** A refusal or failure from the AI proxy, with the server's reason code. */
export class FeedbackRequestError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly quota: AiQuota | null = null
  ) {
    super(message);
    this.name = 'FeedbackRequestError';
  }
}

/** Refusals the user can fix by upgrading. */
export function isUpgradeError(err: unknown): boolean {
  return err instanceof FeedbackRequestError && (err.code === 'plan_required' || err.code === 'quota_exceeded');
}

const UNAVAILABLE_REASON = 'AI feedback is not available here. It works in the Nomadic desktop app.';

export const unavailableFeedbackClient: RubricFeedbackClient = {
  availability: () => ({ available: false, reason: UNAVAILABLE_REASON }),
  request: () => Promise.reject(new FeedbackUnavailableError(UNAVAILABLE_REASON)),
};

const MISQUOTE_MESSAGE = 'The feedback did not match your answer, so it is not shown. Try again.';

/** Client backed by main's 'ai-rubric-feedback' channel. */
export function ipcFeedbackClient(api: Pick<ElectronAPI, 'aiRubricFeedback'>): RubricFeedbackClient {
  return {
    availability: () => ({ available: true }),
    async request(req) {
      if (!api.aiRubricFeedback) throw new FeedbackUnavailableError(UNAVAILABLE_REASON);
      const res = await api.aiRubricFeedback(req);
      if (!res.success) throw new FeedbackRequestError(res.code, res.error, res.quota ?? null);
      if (validateRubricFeedback(req.answer, req.rubric, res.feedback).length) throw new FeedbackRequestError('failed', MISQUOTE_MESSAGE);
      return res.feedback;
    },
  };
}

/** The client the Practice area uses: IPC in the desktop app, unavailable elsewhere. */
export function getFeedbackClient(): RubricFeedbackClient {
  const api = getApi();
  return typeof api.aiRubricFeedback === 'function' ? ipcFeedbackClient(api) : unavailableFeedbackClient;
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
