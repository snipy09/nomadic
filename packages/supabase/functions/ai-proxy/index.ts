// ai-proxy: the only way the desktop app reaches an LLM (decisions 12, 20, 23).
//
// POST { task, input, session: { user_id, session_token, device_fingerprint } }
//   1. validates the envelope and the task input (zod, tasks.ts); only allow-listed tasks exist,
//   2. ai_consume_quota() checks the device session and the per-plan daily quota (migration 017),
//   3. calls Google Gemini with a server-owned prompt and JSON output,
//   4. validates the output with zod and rejects links; on any failure the quota unit is refunded.
//
// Secrets (supabase secrets set ...): GEMINI_API_KEY, GEMINI_MODEL (required; no default, so a
// retired model is never called by accident). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY come from the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { TASK_INPUTS, buildPrompt, geminiText, proxyRequest, validateOutput } from './tasks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || '';
const GEMINI_TIMEOUT_MS = 30_000;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function callGemini(system: string, user: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      // Key in a header, not the URL, so it never lands in proxy or access logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    console.error(`[ai-proxy] Gemini error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return null;
  }
  return geminiText(await res.json());
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'bad_request', reason: 'Method not allowed.' });
  if (!GEMINI_API_KEY || !GEMINI_MODEL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ai-proxy] Missing GEMINI_API_KEY / GEMINI_MODEL or Supabase env.');
    return json(503, { ok: false, code: 'not_configured', reason: 'AI is not configured on the server yet.' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'bad_request', reason: 'Invalid request.' });
  }
  const envelope = proxyRequest.safeParse(body);
  if (!envelope.success) return json(400, { ok: false, code: 'bad_request', reason: 'Invalid request.' });
  const { task, session } = envelope.data;
  const input = TASK_INPUTS[task].safeParse(envelope.data.input);
  if (!input.success) return json(400, { ok: false, code: 'bad_request', reason: 'Invalid input for this AI task.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: quotaData, error: quotaError } = await supabase.rpc('ai_consume_quota', {
    p_user_id: session.user_id,
    p_session_token: session.session_token,
    p_device_fingerprint: session.device_fingerprint,
    p_task: task,
  });
  if (quotaError) {
    console.error(`[ai-proxy] ai_consume_quota failed: ${quotaError.message}`);
    return json(500, { ok: false, code: 'server_error', reason: 'AI is unavailable right now. Try again.' });
  }
  const quota = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as
    | { ok: boolean; reason: string; used: number | null; daily_limit: number | null; day: string }
    | undefined;
  if (!quota?.ok) {
    const reason = quota?.reason || 'AI is not available for this account.';
    const code = reason.startsWith('Unauthorized') ? 'unauthorized' : reason.includes('limit') ? 'quota_exceeded' : 'not_in_plan';
    return json(code === 'unauthorized' ? 401 : 429, { ok: false, code, reason, used: quota?.used ?? null, limit: quota?.daily_limit ?? null });
  }

  const refund = async () => {
    const { error } = await supabase.rpc('ai_refund_quota', { p_user_id: session.user_id, p_task: task, p_day: quota.day });
    if (error) console.error(`[ai-proxy] refund failed: ${error.message}`);
  };

  const { system, user } = buildPrompt(task, input.data);
  let raw: string | null = null;
  try {
    raw = await callGemini(system, user);
  } catch (err) {
    console.error(`[ai-proxy] Gemini call failed: ${err instanceof Error ? err.message : err}`);
  }
  if (!raw) {
    await refund();
    return json(502, { ok: false, code: 'model_error', reason: 'The AI service did not answer. Try again.' });
  }

  const result = validateOutput(task, input.data, raw);
  if (!result.ok) {
    console.error(`[ai-proxy] ${task} output rejected: ${result.error}`);
    await refund();
    return json(502, { ok: false, code: 'invalid_output', reason: 'The AI answer could not be used. Try again.' });
  }
  return json(200, { ok: true, task, data: result.data, used: quota.used, limit: quota.daily_limit });
});
