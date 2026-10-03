import type { LlmClient } from '@job-automator/form-engine';
import { aiProxy, type FormAnswersRequest } from './ai-proxy.js';

// Adapts the form engine's LLM hook to the ai-proxy `form_answers` task. The form
// engine sends { CANDIDATE, JOB, QUESTIONS } as JSON (packages/form-engine/src/answerer.ts);
// only that data is forwarded: the system prompt is owned by the server.

const CANDIDATE_KEYS = [
  'name', 'currentTitle', 'currentCompany', 'desiredTitle', 'yearsOfExperience', 'skills', 'summary', 'education', 'location',
] as const;

function str(v: unknown, max: number): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

/** Builds the proxy request from the form engine's user message, or null if it is not in the expected shape. */
export function toFormAnswersRequest(userMessage: string): FormAnswersRequest | null {
  let parsed: { CANDIDATE?: Record<string, unknown>; JOB?: Record<string, unknown>; QUESTIONS?: unknown };
  try {
    parsed = JSON.parse(userMessage);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.QUESTIONS) || parsed.QUESTIONS.length === 0) return null;

  const candidate: FormAnswersRequest['candidate'] = {};
  for (const key of CANDIDATE_KEYS) {
    const v = str(parsed.CANDIDATE?.[key], key === 'summary' ? 4000 : key === 'skills' ? 2000 : 200);
    if (v) candidate[key] = v;
  }
  const questions: FormAnswersRequest['questions'] = [];
  for (const q of parsed.QUESTIONS.slice(0, 20) as Array<Record<string, unknown>>) {
    const id = str(q?.id, 200);
    const question = str(q?.question, 1000);
    if (!id || !question) continue;
    const maxChars = Math.min(2000, Math.max(50, Number(q.maxChars) || 700));
    questions.push({ id, question, type: q.type === 'cover_letter' ? 'cover_letter' : 'open_ended', maxChars });
  }
  if (!questions.length) return null;

  return {
    candidate,
    job: {
      title: str(parsed.JOB?.title, 300),
      company: str(parsed.JOB?.company, 300),
      description: str(parsed.JOB?.description, 4000),
    },
    questions,
  };
}

export const proxyFormAnswerLlm: LlmClient = {
  async completeJson(_system: string, user: string): Promise<unknown | null> {
    const request = toFormAnswersRequest(user);
    if (!request) return null;
    const res = await aiProxy.formAnswers(request);
    // Any failure (quota, offline, rejected output) leaves those fields for the user to answer.
    return res.ok ? res.data : null;
  },
};
