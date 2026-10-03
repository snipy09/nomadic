// Edge Function: send-email-code (DECISIONS #22, migration 019).
//
// POST { "purpose": "reset", "email": "..." }
// POST { "purpose": "verify", "user_id": "...", "session_token": "...", "device_fingerprint": "..." }
//
// The desktop main process calls it with the anon key as the bearer token, so it deploys with
// verify_jwt = true (the default). It calls request_email_code with the service-role client and emails the
// code through Resend. A reset request always gets the same 200 { ok: true } (no account enumeration).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the Edge runtime; the Resend key and sender come from
// Vault through server_secret (018). Never logs codes, keys or email addresses.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleSendEmailCode } from './handler.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handleSendEmailCode(req, {
    async requestCode(args) {
      const { data, error } = await admin.rpc('request_email_code', {
        p_email: args.email,
        p_purpose: args.purpose,
        p_user_id: args.userId,
        p_session_token: args.sessionToken,
        p_device_fingerprint: args.deviceFingerprint,
      });
      if (error) throw new Error('request_email_code failed');
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
    async getSecret(name) {
      const { data, error } = await admin.rpc('server_secret', { p_name: name });
      if (error) throw new Error('server_secret failed');
      return typeof data === 'string' && data.length > 0 ? data : null;
    },
    fetch: (input, init) => fetch(input, init),
    waitUntil: typeof EdgeRuntime !== 'undefined' ? (p) => EdgeRuntime!.waitUntil(p) : undefined,
    log: (msg) => console.error(msg),
  })
);
