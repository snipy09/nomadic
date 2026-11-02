/**
 * Model providers behind one interface (DECISIONS #20): Google Gemini today, Groq later.
 * Pure TypeScript (fetch is injected), shared by the Edge Function and vitest.
 * Never put the API key, prompts or replies in an error message.
 */
import type { JsonSchema } from './core.ts';

export type ProviderErrorCode =
  | 'auth'             // key missing, invalid, expired or not allowed for this API
  | 'model_not_found'  // the configured model name does not exist for this key
  | 'not_configured'   // provider selected but not implemented / no key
  | 'rate_limited'     // upstream 429
  | 'timeout'
  | 'upstream'         // 5xx or network failure
  | 'blocked'          // safety block / no candidate
  | 'bad_output';      // reply was not the JSON we asked for

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
  get retryable(): boolean {
    return this.code === 'rate_limited' || this.code === 'timeout' || this.code === 'upstream' || this.code === 'bad_output';
  }
}

export interface GenerateJsonRequest {
  system: string;
  user: string;
  schema: JsonSchema;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiProvider {
  readonly name: 'gemini' | 'groq';
  readonly model: string;
  /** The model that served (or last failed) the latest call, when it can differ from `model`. */
  readonly lastModel?: string;
  /** Returns the parsed JSON reply. Throws ProviderError. */
  generateJson(req: GenerateJsonRequest): Promise<unknown>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

// Google serves 2.5 models only to keys that used them before (changelog, 18 Sep 2026).
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/**
 * Tried in order when the primary answers fast with 503 (overloaded), 429 or 404, so a busy
 * model does not fail the request; after a primary timeout the retry uses these only, lite
 * first. The lite alias runs on separate capacity. Override with the AI_FALLBACK_MODELS
 * function secret (comma-separated, or "none").
 */
export const DEFAULT_GEMINI_FALLBACKS = ['gemini-3.6-flash', 'gemini-flash-lite-latest'];
/** Errors that mean "this model cannot answer right now", where another model may. */
const FALLBACK_CODES: ProviderErrorCode[] = ['upstream', 'rate_limited', 'model_not_found'];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{1,80}$/;

/** What kind of Google key this is, for diagnostics only (never the key itself). */
export function keyKind(key: string): 'AQ' | 'AIza' | 'other' {
  return key.startsWith('AQ.') ? 'AQ' : key.startsWith('AIza') ? 'AIza' : 'other';
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) throw new ProviderError('timeout', `model call timed out after ${ms} ms`);
    if (err instanceof ProviderError) throw err;
    throw new ProviderError('upstream', 'network error calling the model');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Gemini (generativelanguage.googleapis.com v1beta, generateContent).
 * The key goes in the `x-goog-api-key` header, never the URL, so it cannot end up in
 * proxy or access logs. Works with classic `AIza...` keys and the newer `AQ.` keys.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  readonly model: string;
  readonly fallbacks: string[];
  lastModel: string;
  /** Set when the primary timed out: later calls on this provider (the handler's retry) skip it. */
  private primarySlow = false;

  constructor(
    private readonly apiKey: string,
    model: string | undefined,
    private readonly fetchImpl: FetchLike,
    fallbacks: string[] = []
  ) {
    const clean = (s: string) => s.trim().replace(/^models\//, '');
    const m = clean(model || DEFAULT_GEMINI_MODEL);
    if (!MODEL_RE.test(m)) throw new ProviderError('not_configured', 'invalid model name');
    this.model = m;
    this.lastModel = m;
    this.fallbacks = [...new Set(fallbacks.map(clean).filter((f) => f && f !== m && MODEL_RE.test(f)))];
  }

  /** The models to try, in order. After a primary timeout, fallbacks only, lite (fastest) first. */
  modelOrder(): string[] {
    if (!this.primarySlow || !this.fallbacks.length) return [this.model, ...this.fallbacks];
    const lite = (m: string) => (/lite/.test(m) ? 0 : 1);
    return [...this.fallbacks].sort((a, b) => lite(a) - lite(b));
  }

  /**
   * Calls the primary model, then each fallback while the failure is "busy / missing", not a
   * bad key or reply. A timeout ends this call (no time left) but steers the retry to fallbacks.
   */
  async generateJson(req: GenerateJsonRequest): Promise<unknown> {
    if (!this.apiKey) throw new ProviderError('auth', 'no Gemini API key configured');
    const started = Date.now();
    let first: ProviderError | null = null;
    for (const model of this.modelOrder()) {
      const left = req.timeoutMs - (Date.now() - started);
      if (first && left < Math.min(5_000, req.timeoutMs / 2)) break;
      this.lastModel = model;
      try {
        return await this.callModel(model, { ...req, timeoutMs: first ? left : req.timeoutMs });
      } catch (err) {
        if (err instanceof ProviderError && err.code === 'timeout' && model === this.model) this.primarySlow = true;
        if (!(err instanceof ProviderError) || !FALLBACK_CODES.includes(err.code)) throw err;
        // Keep the most telling error: an overloaded primary beats a missing fallback.
        if (!first || (first.code === 'model_not_found' && err.code !== 'model_not_found')) first = err;
      }
    }
    throw first ?? new ProviderError('upstream', 'no Gemini model answered');
  }

  private async callModel(model: string, req: GenerateJsonRequest): Promise<unknown> {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.2,
      maxOutputTokens: req.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: req.schema,
    };
    // 2.5 Flash models think by default; these short, schema-bound tasks do not need it.
    if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig,
    });
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
    const { status, ok, text } = await withTimeout(req.timeoutMs, async (signal) => {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body,
        signal,
      });
      return { status: res.status, ok: res.ok, text: await res.text() };
    });
    if (!ok) throw geminiHttpError(status, text);
    let data: GeminiResponse;
    try {
      data = JSON.parse(text) as GeminiResponse;
    } catch {
      throw new ProviderError('bad_output', 'Gemini returned a non-JSON envelope');
    }
    if (data.promptFeedback?.blockReason) throw new ProviderError('blocked', `prompt blocked (${data.promptFeedback.blockReason})`);
    const cand = data.candidates?.[0];
    if (!cand) throw new ProviderError('blocked', 'no candidate returned');
    if (cand.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason)) {
      throw new ProviderError(cand.finishReason === 'SAFETY' ? 'blocked' : 'bad_output', `finish reason ${cand.finishReason}`);
    }
    const raw = (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    try {
      return JSON.parse(raw);
    } catch {
      throw new ProviderError('bad_output', cand.finishReason === 'MAX_TOKENS' ? 'reply was cut off' : 'reply was not valid JSON');
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

/** Maps a Gemini HTTP error to a ProviderError, recognising key problems explicitly. */
export function geminiHttpError(status: number, bodyText: string): ProviderError {
  let reason = '';
  let gStatus = '';
  try {
    const e = (JSON.parse(bodyText) as { error?: { status?: string; details?: Array<{ reason?: string }> } }).error;
    gStatus = e?.status || '';
    reason = (e?.details || []).map((d) => d.reason).find(Boolean) || '';
  } catch { /* not JSON */ }
  const authReasons = ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'ACCESS_TOKEN_TYPE_UNSUPPORTED', 'SERVICE_DISABLED'];
  if (status === 401 || status === 403 || authReasons.includes(reason) || gStatus === 'UNAUTHENTICATED' || gStatus === 'PERMISSION_DENIED') {
    return new ProviderError('auth', `Gemini rejected the API key (HTTP ${status}${reason ? `, ${reason}` : gStatus ? `, ${gStatus}` : ''})`, status);
  }
  if (status === 404) return new ProviderError('model_not_found', 'Gemini model not found for this key', status);
  if (status === 429) return new ProviderError('rate_limited', 'Gemini rate limit or quota reached', status);
  if (status >= 500) return new ProviderError('upstream', `Gemini error HTTP ${status}`, status);
  return new ProviderError('bad_output', `Gemini refused the request (HTTP ${status}${gStatus ? `, ${gStatus}` : ''})`, status);
}

/** Groq: selectable by AI_PROVIDER=groq once implemented and benchmarked (DECISIONS #20). */
export class GroqProvider implements AiProvider {
  readonly name = 'groq' as const;
  constructor(readonly model: string = 'not-configured') {}
  generateJson(): Promise<unknown> {
    return Promise.reject(new ProviderError('not_configured', 'the Groq provider is not implemented yet'));
  }
}

/** Parses AI_FALLBACK_MODELS: unset → defaults, "none" → no fallback, else a comma list. */
export function parseFallbackModels(raw: string | undefined): string[] {
  if (raw == null || !raw.trim()) return DEFAULT_GEMINI_FALLBACKS;
  if (raw.trim().toLowerCase() === 'none') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function createProvider(opts: { provider?: string; model?: string; fallbackModels?: string[]; apiKey: string; fetchImpl: FetchLike }): AiProvider {
  const name = (opts.provider || 'gemini').toLowerCase();
  if (name === 'gemini') return new GeminiProvider(opts.apiKey, opts.model, opts.fetchImpl, opts.fallbackModels ?? DEFAULT_GEMINI_FALLBACKS);
  if (name === 'groq') return new GroqProvider(opts.model);
  throw new ProviderError('not_configured', `unknown AI provider "${name}"`);
}

/** The Vault secret that holds the key for a provider. */
export function providerSecretName(provider: string | undefined): string {
  return (provider || 'gemini').toLowerCase() === 'groq' ? 'groq_api_key' : 'gemini_api_key';
}
