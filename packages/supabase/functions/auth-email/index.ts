// auth-email: sends password reset and email verification codes through Resend (F2).
//
// POST { action: 'password_reset', email }
//   Always answers { ok: true } whether or not the email has an account, so the endpoint
//   cannot be used to find accounts. The code is created by request_password_reset()
//   (migration 016, service role only) and emailed in the background.
// POST { action: 'email_verification', user_id, session_token, device_fingerprint }
//   request_email_verification() checks the device session, then the code is emailed.
//
// Codes are confirmed by the desktop through confirm_password_reset / confirm_email_verification.
//
// Secrets (supabase secrets set ...): RESEND_API_KEY, RESEND_FROM (e.g. "Nomadic <no-reply@your-domain>").
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { parseAuthEmailRequest, passwordResetEmail, resendPayload, verificationEmail, type EmailContent } from './emails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') || '';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendPayload(RESEND_FROM, to, content)),
  });
  if (!res.ok) {
    // Never log the body we sent: it contains the code.
    console.error(`[auth-email] Resend rejected the email: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

/** Runs after the response when the platform supports it, so timing does not reveal whether an email was sent. */
function inBackground(task: Promise<unknown>): Promise<void> {
  const guarded = task.then(() => undefined).catch((err) => {
    console.error(`[auth-email] Background send failed: ${err instanceof Error ? err.message : err}`);
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(guarded);
    return Promise.resolve();
  }
  return guarded;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method not allowed.' });
  if (!RESEND_API_KEY || !RESEND_FROM || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[auth-email] Missing RESEND_API_KEY / RESEND_FROM or Supabase env.');
    return json(503, { ok: false, reason: 'Email is not configured on the server yet.' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, reason: 'Invalid request.' });
  }
  const parsed = parseAuthEmailRequest(body);
  if ('error' in parsed) return json(400, { ok: false, reason: parsed.error });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (parsed.action === 'password_reset') {
    const { data, error } = await supabase.rpc('request_password_reset', { p_email: parsed.email });
    if (error) {
      console.error(`[auth-email] request_password_reset failed: ${error.message}`);
      return json(500, { ok: false, reason: 'Could not send the email. Try again.' });
    }
    const row = (Array.isArray(data) ? data[0] : data) as { send?: boolean; email?: string; full_name?: string; code?: string } | undefined;
    if (row?.send && row.email && row.code) {
      await inBackground(sendEmail(row.email, passwordResetEmail(row.full_name, row.code)));
    }
    return json(200, { ok: true });
  }

  const { data, error } = await supabase.rpc('request_email_verification', {
    p_user_id: parsed.userId,
    p_session_token: parsed.sessionToken,
    p_device_fingerprint: parsed.deviceFingerprint,
  });
  if (error) {
    console.error(`[auth-email] request_email_verification failed: ${error.message}`);
    return json(500, { ok: false, reason: 'Could not send the email. Try again.' });
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { send?: boolean; reason?: string; email?: string; full_name?: string; code?: string }
    | undefined;
  if (!row?.send || !row.email || !row.code) {
    return json(200, { ok: false, reason: row?.reason || 'Could not send the email. Try again.' });
  }
  const sent = await sendEmail(row.email, verificationEmail(row.full_name, row.code));
  return sent ? json(200, { ok: true }) : json(502, { ok: false, reason: 'The email service did not accept the message. Try again later.' });
});
