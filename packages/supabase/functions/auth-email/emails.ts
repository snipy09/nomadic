// Pure parts of the auth-email Edge Function: request parsing and email content.
// No Deno or network imports, so they are unit-tested from
// packages/supabase/src/__tests__/auth-email.test.ts.

export type AuthEmailRequest =
  | { action: 'password_reset'; email: string }
  | { action: 'email_verification'; userId: string; sessionToken: string; deviceFingerprint: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseAuthEmailRequest(body: unknown): AuthEmailRequest | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  if (b.action === 'password_reset') {
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
    return { action: 'password_reset', email };
  }
  if (b.action === 'email_verification') {
    const userId = typeof b.user_id === 'string' ? b.user_id : '';
    const sessionToken = typeof b.session_token === 'string' ? b.session_token : '';
    const deviceFingerprint = typeof b.device_fingerprint === 'string' ? b.device_fingerprint : '';
    if (!UUID.test(userId) || !sessionToken || sessionToken.length > 500 || !deviceFingerprint || deviceFingerprint.length > 500) {
      return { error: 'Sign in again to verify your email.' };
    }
    return { action: 'email_verification', userId, sessionToken, deviceFingerprint };
  }
  return { error: 'Unknown action.' };
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function greeting(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi,';
}

function render(fullName: string | null | undefined, intro: string, code: string, validity: string, outro: string): EmailContent & { subject: '' } {
  const hello = greeting(fullName);
  const text = `${hello}\n\n${intro}\n\n${code}\n\n${validity}\n\n${outro}\n\nNomadic`;
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b;line-height:1.5">
<p>${escapeHtml(hello)}</p>
<p>${escapeHtml(intro)}</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:ui-monospace,Consolas,monospace">${escapeHtml(code)}</p>
<p>${escapeHtml(validity)}</p>
<p style="color:#52525b">${escapeHtml(outro)}</p>
<p>Nomadic</p>
</body></html>`;
  return { subject: '', text, html };
}

// The emails contain the code only, never a link: the code is typed into the desktop app.
export function passwordResetEmail(fullName: string | null | undefined, code: string): EmailContent {
  return {
    ...render(
      fullName,
      'Use this code in the Nomadic app to set a new password:',
      code,
      'The code works once and expires in 30 minutes.',
      'If you did not ask to reset your password, ignore this email. Your password stays the same.'
    ),
    subject: `${code} is your Nomadic password reset code`,
  };
}

export function verificationEmail(fullName: string | null | undefined, code: string): EmailContent {
  return {
    ...render(
      fullName,
      'Use this code in the Nomadic app to verify your email address:',
      code,
      'The code works once and expires in 24 hours.',
      'If you did not create a Nomadic account, ignore this email.'
    ),
    subject: `${code} is your Nomadic verification code`,
  };
}

/** Body for POST https://api.resend.com/emails. */
export function resendPayload(from: string, to: string, content: EmailContent): Record<string, unknown> {
  return { from, to: [to], subject: content.subject, text: content.text, html: content.html };
}
