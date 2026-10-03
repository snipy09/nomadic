// Runtime-independent core of the send-email-code Edge Function (index.ts wires it to Deno and Supabase),
// so it can be unit-tested with mocks. Never logs codes, keys or email addresses.
import { buildEmail, type EmailPurpose } from './template.ts';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** Resend's shared test sender: delivers only to the Resend account owner's address until a domain is verified. */
export const DEFAULT_FROM = 'Nomadic <onboarding@resend.dev>';

export interface RequestCodeArgs {
  email: string | null;
  purpose: EmailPurpose;
  userId: string | null;
  sessionToken: string | null;
  deviceFingerprint: string | null;
}

/** One row of public.request_email_code (migration 019). */
export interface RequestCodeRow {
  status: string;
  code: string | null;
  email: string | null;
}

export interface SendEmailCodeDeps {
  /** Calls request_email_code with the service-role client. Throws on a database error. */
  requestCode(args: RequestCodeArgs): Promise<RequestCodeRow | null>;
  /** server_secret(name) (migration 018); null when not set. */
  getSecret(name: 'resend_api_key' | 'email_from'): Promise<string | null>;
  fetch: typeof fetch;
  /** Keeps the email send running after the response (EdgeRuntime.waitUntil). */
  waitUntil?: (p: Promise<unknown>) => void;
  log?: (msg: string) => void;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** The single answer to every well-formed reset request (unknown email, rate limited, sent, send failed). */
export const RESET_ACCEPTED = { ok: true } as const;

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBody(raw: unknown): RequestCodeArgs | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const purpose = b.purpose;
  if (purpose === 'reset') {
    const email = str(b.email, 320);
    if (!email) return null;
    return { email: email.trim().toLowerCase(), purpose, userId: null, sessionToken: null, deviceFingerprint: null };
  }
  if (purpose === 'verify') {
    const userId = str(b.user_id, 64);
    const sessionToken = str(b.session_token, 500);
    const deviceFingerprint = str(b.device_fingerprint, 500);
    if (!userId || !UUID.test(userId) || !sessionToken || !deviceFingerprint) return null;
    // The email always comes from the account (request_email_code ignores any email for 'verify').
    return { email: null, purpose, userId, sessionToken, deviceFingerprint };
  }
  return null;
}

/** Sends the email through Resend. Returns true when Resend accepted it. */
export async function sendWithResend(
  deps: SendEmailCodeDeps,
  to: string,
  purpose: EmailPurpose,
  code: string
): Promise<boolean> {
  const log = deps.log ?? (() => {});
  let apiKey: string | null;
  let from: string | null;
  try {
    apiKey = await deps.getSecret('resend_api_key');
    from = await deps.getSecret('email_from');
  } catch {
    log('[send-email-code] could not read the email secrets');
    return false;
  }
  if (!apiKey) {
    log('[send-email-code] resend_api_key is not set in Vault');
    return false;
  }
  const sender = from && from.trim() ? from.trim() : DEFAULT_FROM;
  const content = buildEmail(purpose, code);
  try {
    const res = await deps.fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: [to], subject: content.subject, text: content.text, html: content.html }),
    });
    if (res.ok) return true;
    let name = '';
    try {
      const body = (await res.json()) as { name?: unknown };
      name = typeof body?.name === 'string' ? body.name : '';
    } catch { /* body is optional */ }
    const hint = sender === DEFAULT_FROM && (res.status === 403 || res.status === 422)
      ? ' (the default onboarding@resend.dev sender only delivers to the Resend account owner; verify a domain and set the email_from secret)'
      : '';
    log(`[send-email-code] Resend refused the email: HTTP ${res.status}${name ? ` ${name}` : ''}${hint}`);
    return false;
  } catch {
    log('[send-email-code] Resend could not be reached');
    return false;
  }
}

export async function handleSendEmailCode(req: Request, deps: SendEmailCodeDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  const args = parseBody(raw);
  if (!args) return json(400, { ok: false, error: 'bad_request' });

  let row: RequestCodeRow | null;
  try {
    row = await deps.requestCode(args);
  } catch {
    log('[send-email-code] request_email_code failed');
    return json(503, { ok: false, error: 'unavailable' });
  }
  const status = row?.status ?? 'skip';

  if (args.purpose === 'reset') {
    // Same response whether or not the account exists (SECURITY_CHECKLIST S2d). The email is sent after the
    // response when the runtime allows it, so response time does not depend on Resend either.
    if (status === 'invalid') return json(400, { ok: false, error: 'bad_request' });
    if (status === 'send' && row?.code && row.email) {
      const p = sendWithResend(deps, row.email, 'reset', row.code).catch(() => false);
      if (deps.waitUntil) deps.waitUntil(p);
      else await p;
    }
    return json(200, { ...RESET_ACCEPTED });
  }

  // verify: the caller proved who they are with a session, so precise statuses are safe.
  switch (status) {
    case 'send': {
      if (!row?.code || !row.email) return json(503, { ok: false, error: 'unavailable' });
      const sent = await sendWithResend(deps, row.email, 'verify', row.code);
      return sent ? json(200, { ok: true }) : json(502, { ok: false, error: 'email_failed' });
    }
    case 'already_verified':
      return json(200, { ok: true, alreadyVerified: true });
    case 'rate_limited':
      return json(429, { ok: false, error: 'rate_limited' });
    case 'unauthorized':
      return json(401, { ok: false, error: 'unauthorized' });
    default:
      return json(400, { ok: false, error: 'bad_request' });
  }
}
