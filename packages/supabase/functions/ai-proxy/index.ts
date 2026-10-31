// ai-proxy Edge Function (Deno): the only place the operator's model key is used
// (DECISIONS #12, #20, #23). The desktop app POSTs here with the project's anon key as the
// bearer (deploy with verify_jwt = true) plus the user's device session in the body; this
// function checks the session, plan and daily quota through consume_ai_quota (migration 020,
// service_role only), calls the model with a strict JSON schema and checks the reply.
//
// Environment (set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: AI_PROVIDER (gemini | groq, default gemini), AI_MODEL (default gemini-3.8-flash),
//           AI_TIMEOUT_MS (per attempt, default 25000).
// The key itself is read from Vault: server_secret('gemini_api_key') (migration 018).
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { handleAiProxy, type QuotaRow } from './handler.ts';
import { createProvider, providerSecretName, type FetchLike } from './providers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AI_PROVIDER = Deno.env.get('AI_PROVIDER') ?? 'gemini';
const AI_MODEL = Deno.env.get('AI_MODEL') ?? undefined;
const AI_TIMEOUT_MS = Number(Deno.env.get('AI_TIMEOUT_MS') ?? '') || 25_000;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// The key is cached per isolate for a few minutes so a rotated key is picked up quickly.
const KEY_TTL_MS = 5 * 60_000;
let keyCache: { value: string | null; at: number } | null = null;

async function getApiKey(): Promise<string | null> {
  if (keyCache && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.value;
  const { data, error } = await db.rpc('server_secret', { p_name: providerSecretName(AI_PROVIDER) });
  if (error) throw new Error('server_secret failed');
  const value = typeof data === 'string' && data.trim() ? data.trim() : null;
  keyCache = { value, at: Date.now() };
  return value;
}

const fetchImpl: FetchLike = (url, init) => fetch(url, init);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req: Request) => {
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > 64 * 1024) return json(413, { ok: false, error: 'payload_too_large', message: 'The request is too large.' });
  const bodyText = req.method === 'POST' ? await req.text() : '';
  try {
    const res = await handleAiProxy(req.method, bodyText, {
      timeoutMs: AI_TIMEOUT_MS,
      getApiKey,
      createProvider: (apiKey) => createProvider({ provider: AI_PROVIDER, model: AI_MODEL, apiKey, fetchImpl }),
      consumeQuota: async ({ userId, sessionToken, deviceFingerprint, kind }) => {
        const { data, error } = await db.rpc('consume_ai_quota', {
          p_user_id: userId,
          p_session_token: sessionToken,
          p_device_fingerprint: deviceFingerprint,
          p_kind: kind,
        });
        if (error) throw new Error('consume_ai_quota failed');
        const row = Array.isArray(data) ? data[0] : data;
        return (row ?? null) as QuotaRow | null;
      },
      refundQuota: async ({ userId, kind }) => {
        const { error } = await db.rpc('refund_ai_quota', { p_user_id: userId, p_kind: kind });
        if (error) throw new Error('refund_ai_quota failed');
      },
      // One JSON line per event; the handler never passes prompts, answers or secrets here.
      log: (event) => console.log(JSON.stringify({ fn: 'ai-proxy', ...event })),
    });
    return json(res.status, res.body);
  } catch {
    console.error(JSON.stringify({ fn: 'ai-proxy', outcome: 'unhandled' }));
    return json(500, { ok: false, error: 'ai_failed', message: 'The AI service failed. Try again.' });
  }
});
