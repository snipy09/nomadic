/**
 * ai-proxy request handler, with every side effect injected (database, secret, provider,
 * logger) so it runs unchanged under Deno and vitest.
 *
 * Order: method/size -> body contract -> operator key present -> consume_ai_quota (checks
 * the device session, plan and today's count, counts one call) -> model call (timeout,
 * one retry) -> output checks -> reply. If no usable answer comes back after the quota
 * was counted, the call is refunded.
 *
 * Logs carry only kind, outcome codes, timings and the model name: never prompts, answers,
 * profile data, session tokens or the key.
 */
import {
  ERROR_STATUS,
  MAX_BODY_BYTES,
  OutputError,
  RequestError,
  buildPrompt,
  checkOutput,
  parseProxyRequest,
  type AiKind,
  type FormResult,
  type OutreachResult,
  type ProxyErrorCode,
  type RubricResult,
} from './core.ts';
import { ProviderError, keyKind, type AiProvider } from './providers.ts';

export interface QuotaRow {
  ok: boolean;
  error: string | null;
  plan: string | null;
  daily_limit: number | null;
  used: number | null;
  remaining: number | null;
  resets_at: string | null;
}

export interface ProxyDeps {
  /** consume_ai_quota RPC (service_role). Throws when the database cannot be reached. */
  consumeQuota(args: { userId: string; sessionToken: string; deviceFingerprint: string; kind: AiKind }): Promise<QuotaRow | null>;
  /** refund_ai_quota RPC (service_role). */
  refundQuota(args: { userId: string; kind: AiKind }): Promise<void>;
  /** The operator's model key (Vault via server_secret), or null when it is not set. */
  getApiKey(): Promise<string | null>;
  createProvider(apiKey: string): AiProvider;
  log(event: Record<string, unknown>): void;
  /** Per-attempt model timeout (default 25 s). */
  timeoutMs?: number;
  /** Delay before the single retry (default 800 ms). */
  retryDelayMs?: number;
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

export interface ProxyQuota {
  plan: string | null;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  resets_at: string | null;
}

export type ProxyResponseBody =
  | { ok: true; kind: AiKind; result: RubricResult | FormResult | OutreachResult; quota: ProxyQuota; model: string }
  | { ok: false; error: ProxyErrorCode; message: string; quota?: ProxyQuota };

export interface ProxyResponse {
  status: number;
  body: ProxyResponseBody;
}

const MESSAGES: Record<ProxyErrorCode, string> = {
  bad_request: 'The request was not valid.',
  payload_too_large: 'The request is too large.',
  method_not_allowed: 'Use POST.',
  unauthorized: 'Your session has ended. Sign in again.',
  account_suspended: 'This account is suspended. Contact support.',
  plan_required: 'This AI feature is not included in your plan.',
  quota_exceeded: 'You have used today\'s AI allowance. It resets at midnight IST.',
  ai_unavailable: 'The AI service is not available right now. Try again later.',
  ai_failed: 'The AI service could not produce a usable answer. Try again.',
  service_unavailable: 'Nomadic could not be reached. Try again.',
};

const fail = (code: ProxyErrorCode, message = MESSAGES[code], quota?: ProxyQuota): ProxyResponse => ({
  status: ERROR_STATUS[code],
  body: quota ? { ok: false, error: code, message, quota } : { ok: false, error: code, message },
});

const QUOTA_ERRORS: Record<string, ProxyErrorCode> = {
  unauthorized: 'unauthorized',
  account_suspended: 'account_suspended',
  plan_required: 'plan_required',
  quota_exceeded: 'quota_exceeded',
  bad_request: 'bad_request',
};

const toQuota = (r: QuotaRow): ProxyQuota => ({ plan: r.plan, limit: r.daily_limit, used: r.used, remaining: r.remaining, resets_at: r.resets_at });

export async function handleAiProxy(method: string, bodyText: string, deps: ProxyDeps): Promise<ProxyResponse> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  if (method !== 'POST') return fail('method_not_allowed');
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return fail('payload_too_large');

  let req;
  try {
    let raw: unknown;
    try { raw = JSON.parse(bodyText); } catch { throw new RequestError('bad_request', 'body is not JSON'); }
    req = parseProxyRequest(raw);
  } catch (err) {
    if (err instanceof RequestError) return fail(err.code, `${MESSAGES[err.code]} (${err.message})`);
    throw err;
  }
  const kind = req.kind;

  let apiKey: string | null;
  try {
    apiKey = await deps.getApiKey();
  } catch {
    deps.log({ kind, outcome: 'secret_unreadable' });
    return fail('service_unavailable');
  }
  if (!apiKey) {
    deps.log({ kind, outcome: 'no_api_key' });
    return fail('ai_unavailable');
  }
  let provider: AiProvider;
  try {
    provider = deps.createProvider(apiKey);
  } catch (err) {
    deps.log({ kind, outcome: 'provider_config', detail: err instanceof Error ? err.message : 'error' });
    return fail('ai_unavailable');
  }

  let row: QuotaRow | null;
  try {
    row = await deps.consumeQuota({ userId: req.user_id, sessionToken: req.session_token, deviceFingerprint: req.device_fingerprint, kind });
  } catch {
    deps.log({ kind, outcome: 'quota_rpc_failed' });
    return fail('service_unavailable');
  }
  if (!row) return fail('service_unavailable');
  if (!row.ok) {
    const code = QUOTA_ERRORS[row.error ?? ''] ?? 'service_unavailable';
    deps.log({ kind, outcome: code });
    return fail(code, MESSAGES[code], toQuota(row));
  }
  const quota = toQuota(row);

  const prompt = buildPrompt(req);
  const timeoutMs = deps.timeoutMs ?? 25_000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastCode = 'unknown';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await provider.generateJson({ ...prompt, timeoutMs });
      const result = checkOutput(req, out);
      deps.log({ kind, outcome: 'ok', attempt, model: provider.model, ms: now() - t0 });
      return { status: 200, body: { ok: true, kind, result, quota, model: provider.model } };
    } catch (err) {
      const retryable = err instanceof OutputError || (err instanceof ProviderError && err.retryable);
      lastCode = err instanceof ProviderError ? err.code : err instanceof OutputError ? 'invalid_output' : 'exception';
      deps.log({
        kind,
        outcome: 'attempt_failed',
        attempt,
        code: lastCode,
        // Provider and output messages never contain prompts, replies or the key.
        detail: err instanceof ProviderError || err instanceof OutputError ? err.message : 'unexpected error',
        ...(err instanceof ProviderError && err.code === 'auth' ? { key_kind: keyKind(apiKey) } : {}),
        model: provider.model,
      });
      if (!retryable || attempt === 2) break;
      await sleep(deps.retryDelayMs ?? 800);
    }
  }

  try {
    await deps.refundQuota({ userId: req.user_id, kind });
  } catch {
    deps.log({ kind, outcome: 'refund_failed' });
  }
  const configProblem = lastCode === 'auth' || lastCode === 'model_not_found' || lastCode === 'not_configured';
  return fail(configProblem ? 'ai_unavailable' : 'ai_failed', undefined, quota.used == null ? quota : { ...quota, used: Math.max(0, quota.used - 1), remaining: quota.remaining == null ? null : quota.remaining + 1 });
}

