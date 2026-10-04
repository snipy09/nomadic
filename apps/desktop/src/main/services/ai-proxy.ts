import { z } from 'zod';
import type { FormAnswerClient, FormAnswerRequest } from '@job-automator/form-engine';
import type { AiErrorCode, AiQuota, RubricFeedback, RubricFeedbackRequest, RubricFeedbackResult } from '../../shared/ipc.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';

// ── Nomadic AI proxy client ─────────────────────────────────────────────────
// Every model call the desktop makes goes to the `ai-proxy` Edge Function
// (packages/supabase/functions/ai-proxy). It holds the operator's key and enforces
// the plan and the daily AI quota (migration 020); the app ships no model key and
// needs none from the user (DECISIONS #12, #20, #23).
//
// Transport: POST {SUPABASE_URL}/functions/v1/ai-proxy with the public anon key as
// bearer (the function is deployed with verify_jwt) and the device session in the body.
// Prompts, answers and profile facts are never logged here.

export type AiKind = 'rubric_feedback' | 'form_answers' | 'outreach_email' | 'roadmap_plan' | 'roadmap_adjust';

/** Main waits a little longer than the proxy's two 25 s model attempts. */
export const AI_PROXY_TIMEOUT_MS = 60_000;

export type AiProxyResult<T> =
  | { ok: true; result: T; quota: AiQuota | null }
  | { ok: false; code: AiErrorCode; error: string; quota?: AiQuota | null };

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface AiProxyOptions {
  fetchImpl?: FetchFn;
  timeoutMs?: number;
}

export function aiProxyUrl(): string | null {
  const base = process.env.SUPABASE_URL;
  if (!base || !process.env.SUPABASE_ANON_KEY) return null;
  return `${base.replace(/\/+$/, '')}/functions/v1/ai-proxy`;
}

const SERVER_CODES: Record<string, AiErrorCode> = {
  unauthorized: 'unauthorized',
  account_suspended: 'account_suspended',
  plan_required: 'plan_required',
  quota_exceeded: 'quota_exceeded',
  bad_request: 'bad_request',
  payload_too_large: 'bad_request',
  method_not_allowed: 'bad_request',
  ai_unavailable: 'unavailable',
  service_unavailable: 'unavailable',
  ai_failed: 'failed',
};

/** What the user is told for each refusal (`feature` names the AI feature). */
export function aiErrorMessage(code: AiErrorCode, feature: string, quota?: AiQuota | null): string {
  switch (code) {
    case 'not_signed_in': return `Sign in to use ${feature}.`;
    case 'unauthorized': return 'Your session has ended. Sign in again to use AI features.';
    case 'account_suspended': return 'This account is suspended. Contact support.';
    case 'plan_required': return `${capitalize(feature)} is part of the Pro and Max plans.`;
    case 'quota_exceeded':
      return quota?.limit != null
        ? `You have used today's ${quota.limit} ${feature} requests. They reset at midnight IST, or upgrade for more.`
        : `You have used today's ${feature} allowance. It resets at midnight IST.`;
    case 'bad_request': return 'That request was too large or incomplete.';
    case 'unavailable': return 'Nomadic AI is not available right now. Try again later.';
    case 'failed': return 'Nomadic AI could not produce a usable answer. Try again.';
    case 'network': return 'Could not reach Nomadic AI. Check your connection and try again.';
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const quotaSchema = z
  .object({
    plan: z.string().nullable().optional(),
    limit: z.number().nullable().optional(),
    used: z.number().nullable().optional(),
    remaining: z.number().nullable().optional(),
    resets_at: z.string().nullable().optional(),
  })
  .passthrough();

function mapQuota(raw: unknown): AiQuota | null {
  const q = quotaSchema.safeParse(raw);
  if (!q.success) return null;
  return { plan: q.data.plan ?? null, limit: q.data.limit ?? null, used: q.data.used ?? null, remaining: q.data.remaining ?? null, resetsAt: q.data.resets_at ?? null };
}

/** One call to the AI proxy. Never throws. */
export async function callAiProxy(kind: AiKind, payload: unknown, feature: string, opts: AiProxyOptions = {}): Promise<AiProxyResult<unknown>> {
  const s = getActiveSyncSession();
  if (!s) return { ok: false, code: 'not_signed_in', error: aiErrorMessage('not_signed_in', feature) };
  const url = aiProxyUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, code: 'unavailable', error: aiErrorMessage('unavailable', feature) };

  const fetchImpl: FetchFn = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? AI_PROXY_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({ kind, user_id: s.userId, session_token: s.sessionToken, device_fingerprint: s.deviceFingerprint, payload }),
      signal: ctrl.signal,
    });
    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch { /* gateway errors are not always JSON */ }
    if (res.ok && body?.ok === true) {
      log(`[AI] ${kind} ok in ${Date.now() - started} ms`);
      return { ok: true, result: body.result, quota: mapQuota(body.quota) };
    }
    const serverCode = typeof body?.error === 'string' ? body.error : '';
    // A gateway 401 without our error shape means the anon key / JWT check failed, not the user session.
    const code: AiErrorCode = SERVER_CODES[serverCode] ?? (res.status === 401 || res.status === 404 ? 'unavailable' : res.status >= 500 ? 'unavailable' : 'failed');
    const quota = mapQuota(body?.quota);
    log(`[AI] ${kind} refused: HTTP ${res.status} ${serverCode || 'no-code'}`);
    return { ok: false, code, error: aiErrorMessage(code, feature, quota), quota };
  } catch (err) {
    const timedOut = ctrl.signal.aborted;
    log(`[AI] ${kind} ${timedOut ? 'timed out' : 'network error'}: ${err instanceof Error ? err.name : 'error'}`);
    return { ok: false, code: 'network', error: timedOut ? 'Nomadic AI took too long to answer. Try again.' : aiErrorMessage('network', feature) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Rubric feedback (Practice) ──────────────────────────────────────────────

const rubricResultSchema = z.object({
  items: z
    .array(
      z.object({
        criterion_id: z.string(),
        score: z.number().int().min(0).max(4),
        quote: z.string(),
        comment: z.string(),
      })
    )
    .min(1),
  summary: z.string(),
});

export async function requestRubricFeedback(req: RubricFeedbackRequest, opts: AiProxyOptions = {}): Promise<RubricFeedbackResult> {
  const feature = 'AI feedback';
  const res = await callAiProxy(
    'rubric_feedback',
    { entry_id: req.entryId, question: req.question, answer: req.answer, rubric: req.rubric.map((r) => ({ id: r.id, label: r.label, description: r.description })) },
    feature,
    opts
  );
  if (!res.ok) return { success: false, code: res.code, error: res.error, quota: res.quota ?? null };
  const parsed = rubricResultSchema.safeParse(res.result);
  if (!parsed.success) {
    log('[AI] rubric_feedback reply had an unexpected shape');
    return { success: false, code: 'failed', error: aiErrorMessage('failed', feature), quota: res.quota };
  }
  const feedback: RubricFeedback = {
    items: parsed.data.items.map((i) => ({ criterionId: i.criterion_id, score: i.score, quote: i.quote, comment: i.comment })),
    summary: parsed.data.summary,
  };
  return { success: true, feedback, quota: res.quota };
}

// ── Form answers (auto-apply) ───────────────────────────────────────────────

const formResultSchema = z.object({ answers: z.record(z.string(), z.string().nullable()) });

/**
 * FormAnswerClient for the form engine: one batched proxy call per form page. Returns
 * answers only for the questions asked; null (all questions go to the user) on refusal
 * or failure, so the engine never fills an answer the server did not return.
 */
export function createProxyFormAnswerClient(opts: AiProxyOptions = {}): FormAnswerClient {
  return {
    async answerForm(req: FormAnswerRequest) {
      const res = await callAiProxy('form_answers', req, 'AI form answers', opts);
      if (!res.ok) return null;
      const parsed = formResultSchema.safeParse(res.result);
      if (!parsed.success) return null;
      const asked = new Set(req.questions.map((q) => q.id));
      const out: Record<string, string | null> = {};
      for (const id of asked) out[id] = parsed.data.answers[id] ?? null;
      return out;
    },
  };
}
