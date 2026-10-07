import type {
  EmailCodeResult,
  EmailVerificationConfirmInput,
  EmailVerificationStatus,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
} from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { log } from './app-context.js';
import { hashLogin } from './auth.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// ── Password reset and email verification ─────────────────────────────────
// Codes are created and emailed by the `send-email-code` Edge Function (service role, Resend); the desktop
// calls it with the anon key as the bearer token. Codes are checked by the anon RPCs from migration 019.
// Reset requests always look the same whether or not an account exists (SECURITY_CHECKLIST S2d), and every
// code failure collapses into one message. Codes and passwords are never logged.

/** Must match register_user (009), signupLocalAccount and confirm_password_reset (019). */
export const MIN_PASSWORD_LENGTH = 6;

export const SEND_EMAIL_CODE_PATH = '/functions/v1/send-email-code';
const REQUEST_TIMEOUT_MS = 15_000;

export const INVALID_CODE_MESSAGE = 'That code is not valid or has expired. Request a new code.';
const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const NOT_CONFIGURED: EmailCodeResult = {
  success: false,
  code: 'not_configured',
  error: 'This needs the licensing server, which is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
};
const NOT_SIGNED_IN: EmailCodeResult = {
  success: false,
  code: 'not_signed_in',
  error: 'Connect to the internet and sign in again to verify your email.',
};
const SESSION_ENDED: EmailCodeResult = {
  success: false,
  code: 'unauthorized',
  error: 'Your session has ended. Sign in again to verify your email.',
};

interface FunctionReply {
  status: number;
  body: Record<string, unknown>;
}

/** POSTs to the Edge Function. Returns null when the server is not configured; throws when unreachable. */
async function callSendEmailCode(payload: Record<string, unknown>): Promise<FunctionReply | null> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}${SEND_EMAIL_CODE_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch { /* non-JSON body (gateway error) */ }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const firstRow = (data: unknown): Record<string, unknown> | undefined =>
  (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;

/** Business logic behind `auth-request-password-reset`. */
export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<EmailCodeResult> {
  const email = input.email.trim().toLowerCase();
  let reply: FunctionReply | null;
  try {
    reply = await callSendEmailCode({ purpose: 'reset', email });
  } catch (err: unknown) {
    log(`[Auth] Password reset request could not reach the server: ${err instanceof Error ? err.name : 'error'}`);
    return { success: false, code: 'network', error: NETWORK_MESSAGE };
  }
  if (!reply) return NOT_CONFIGURED;
  if (reply.status === 200) return { success: true };
  if (reply.status === 400) return { success: false, error: 'Enter a valid email address.' };
  log(`[Auth] Password reset request failed: HTTP ${reply.status}`);
  return { success: false, code: 'network', error: 'Could not send a code right now. Try again in a few minutes.' };
}

/** Business logic behind `auth-confirm-password-reset`. */
export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<EmailCodeResult> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  // Same handling as sign-up: the password is trimmed and must be at least 6 characters.
  const password = input.newPassword.trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, code: 'invalid_password', error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const supabase = getAnonSupabase();
  if (!supabase) return NOT_CONFIGURED;

  let row: Record<string, unknown> | undefined;
  try {
    const { data, error } = await supabase.rpc('confirm_password_reset', {
      p_email: email,
      p_code: code,
      p_new_password: password,
    });
    if (error) throw error;
    row = firstRow(data);
  } catch (err: unknown) {
    log(`[Auth] Password reset could not reach the server: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code: 'network', error: NETWORK_MESSAGE };
  }

  if (!row?.['ok']) {
    const reason = String(row?.['reason'] ?? '');
    if (/^Password must/i.test(reason)) return { success: false, code: 'invalid_password', error: reason };
    return { success: false, code: 'invalid_code', error: INVALID_CODE_MESSAGE };
  }

  // The offline cache must not keep accepting the old password on this computer.
  try {
    const db = getDb();
    db.run('UPDATE user_cache SET password_hash = ? WHERE email = ?', [hashLogin(email, password), email]);
    persistDb();
  } catch (err: unknown) {
    log(`[Auth] Offline cache not updated after reset: ${err instanceof Error ? err.message : String(err)}`);
  }
  log('[Auth] Password reset completed; other sessions were signed out by the server.');
  return { success: true };
}

/** Business logic behind `auth-send-verification`. */
export async function sendVerificationEmail(): Promise<EmailCodeResult> {
  const s = getActiveSyncSession();
  if (!s) return NOT_SIGNED_IN;
  let reply: FunctionReply | null;
  try {
    reply = await callSendEmailCode({
      purpose: 'verify',
      user_id: s.userId,
      session_token: s.sessionToken,
      device_fingerprint: s.deviceFingerprint,
    });
  } catch (err: unknown) {
    log(`[Auth] Verification email could not reach the server: ${err instanceof Error ? err.name : 'error'}`);
    return { success: false, code: 'network', error: NETWORK_MESSAGE };
  }
  if (!reply) return NOT_CONFIGURED;
  switch (reply.status) {
    case 200:
      return { success: true, alreadyVerified: reply.body['alreadyVerified'] === true };
    case 401:
      return SESSION_ENDED;
    case 429:
      return { success: false, code: 'rate_limited', error: 'Too many codes requested. Try again in an hour.' };
    case 502:
      return { success: false, code: 'email_failed', error: 'We could not send the email right now. Try again later.' };
    default:
      log(`[Auth] Verification email failed: HTTP ${reply.status}`);
      return { success: false, code: 'network', error: 'Could not send a code right now. Try again in a few minutes.' };
  }
}

/** Business logic behind `auth-confirm-verification`. */
export async function confirmEmailVerification(input: EmailVerificationConfirmInput): Promise<EmailCodeResult> {
  const s = getActiveSyncSession();
  if (!s) return NOT_SIGNED_IN;
  const supabase = getAnonSupabase();
  if (!supabase) return NOT_CONFIGURED;
  let row: Record<string, unknown> | undefined;
  try {
    const { data, error } = await supabase.rpc('confirm_email_verification', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_code: input.code.trim(),
    });
    if (error) throw error;
    row = firstRow(data);
  } catch (err: unknown) {
    log(`[Auth] Email verification could not reach the server: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code: 'network', error: NETWORK_MESSAGE };
  }
  if (row?.['ok']) return { success: true, alreadyVerified: row['reason'] === 'already_verified' };
  if (row?.['reason'] === 'unauthorized') return SESSION_ENDED;
  return { success: false, code: 'invalid_code', error: INVALID_CODE_MESSAGE };
}

/** Business logic behind `auth-verification-status`. */
export async function getEmailVerificationStatus(): Promise<EmailVerificationStatus> {
  const s = getActiveSyncSession();
  if (!s) return { success: false, code: 'not_signed_in' };
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, code: 'not_configured' };
  try {
    const { data, error } = await supabase.rpc('email_verification_status', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!row?.['ok']) return { success: false, code: 'unauthorized' };
    const verifiedAt = row['verified_at'] ? String(row['verified_at']) : null;
    return { success: true, verified: verifiedAt !== null, verifiedAt, email: row['email'] ? String(row['email']) : undefined };
  } catch (err: unknown) {
    log(`[Auth] Verification status unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code: 'network' };
  }
}
