import { z } from 'zod';
import { log } from './app-context.js';
import { session } from './session.js';

// ── AI proxy client (decisions 12, 20, 23) ────────────────────────────────
// The app never calls an LLM provider directly. Every AI request goes to the
// ai-proxy Edge Function with the device session; the server owns the prompt,
// the API key and the per-plan daily quota (migration 017), and validates the
// model output. Outputs are validated again here so a bad response can never
// reach the UI. Schemas mirror packages/supabase/functions/ai-proxy/tasks.ts
// (ai-proxy-client.test.ts runs both against the same fixtures).

export type AiTask = 'form_answers' | 'practice_feedback' | 'roadmap_explanation';

export type AiProxyErrorCode =
  | 'no_session'
  | 'not_configured'
  | 'unauthorized'
  | 'quota_exceeded'
  | 'not_in_plan'
  | 'bad_request'
  | 'model_error'
  | 'invalid_output'
  | 'server_error'
  | 'network';

export type AiProxyResult<T> =
  | { ok: true; data: T; used?: number; limit?: number }
  | { ok: false; code: AiProxyErrorCode; error: string };

export interface FormAnswersRequest {
  candidate: Partial<Record<
    'name' | 'currentTitle' | 'currentCompany' | 'desiredTitle' | 'yearsOfExperience' | 'skills' | 'summary' | 'education' | 'location',
    string
  >>;
  job: { title?: string; company?: string; description?: string };
  questions: Array<{ id: string; question: string; type: 'open_ended' | 'cover_letter'; maxChars: number }>;
}

export interface PracticeFeedbackRequest {
  question: string;
  category?: string;
  answer: string;
}

export interface RoadmapExplanationRequest {
  role: string;
  horizon?: string;
  milestones: Array<{ title: string; skills?: string[]; estimatedHours?: number }>;
}

export const formAnswersOutput = z.object({
  answers: z.record(z.string(), z.string().max(4000).nullable()),
});

export const practiceFeedbackOutput = z.object({
  score: z.number().int().min(0).max(100),
  review: z.string().min(1).max(800),
  strengths: z.array(z.string().min(1).max(300)).max(4),
  improvements: z.array(z.string().min(1).max(300)).min(1).max(4),
});

export const roadmapExplanationOutput = z.object({
  summary: z.string().min(1).max(1200),
  milestones: z.array(z.object({ index: z.number().int().min(0), why: z.string().min(1).max(600) })).max(12),
});

export type FormAnswersResult = z.infer<typeof formAnswersOutput>;
export type PracticeFeedback = z.infer<typeof practiceFeedbackOutput>;
export type RoadmapExplanation = z.infer<typeof roadmapExplanationOutput>;

const KNOWN_CODES = new Set<AiProxyErrorCode>([
  'not_configured', 'unauthorized', 'quota_exceeded', 'not_in_plan', 'bad_request', 'model_error', 'invalid_output', 'server_error',
]);

async function call<T>(task: AiTask, input: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<AiProxyResult<T>> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, code: 'not_configured', error: 'AI needs the Nomadic server, which is not configured.' };
  if (!session.userId || !session.sessionToken || !session.deviceFingerprint) {
    return { ok: false, code: 'no_session', error: 'Sign in again to use AI features.' };
  }

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        task,
        input,
        session: { user_id: session.userId, session_token: session.sessionToken, device_fingerprint: session.deviceFingerprint },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err: unknown) {
    log(`[AI] ${task}: server unreachable (${err instanceof Error ? err.message : String(err)})`);
    return { ok: false, code: 'network', error: 'Could not reach the Nomadic server. Check your connection.' };
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; code?: string; reason?: string; data?: unknown; used?: number; limit?: number }
    | null;
  if (!body?.ok) {
    const code = KNOWN_CODES.has(body?.code as AiProxyErrorCode) ? (body!.code as AiProxyErrorCode) : 'server_error';
    log(`[AI] ${task}: ${code} (HTTP ${res.status})`);
    return { ok: false, code, error: body?.reason || 'AI is unavailable right now. Try again.' };
  }

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    log(`[AI] ${task}: server returned an unexpected shape`);
    return { ok: false, code: 'invalid_output', error: 'The AI answer could not be used. Try again.' };
  }
  return { ok: true, data: parsed.data, used: body.used, limit: body.limit };
}

export const aiProxy = {
  formAnswers: (input: FormAnswersRequest) => call('form_answers', input, formAnswersOutput),
  practiceFeedback: (input: PracticeFeedbackRequest) => call('practice_feedback', input, practiceFeedbackOutput),
  explainRoadmap: (input: RoadmapExplanationRequest) => call('roadmap_explanation', input, roadmapExplanationOutput),
};
