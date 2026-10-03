import type {
  EmailStatusResult,
  PasswordResetConfirmInput,
  SuccessResult,
} from '../../shared/ipc.js';
import { log } from './app-context.js';
import { session } from './session.js';
import { getAnonSupabase } from './supabase.js';

// ── Password reset and email verification (F2, migration 016) ─────────────
// Codes are created and emailed server-side by the auth-email Edge Function
// (Resend). The desktop only asks for an email to be sent and submits the
// code the user typed; it never sees or stores a code itself.

const NOT_CONFIGURED = 'Account emails need the licensing server, which is not configured.';
const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';
const NO_SESSION = 'Sign in again to verify your email.';

async function callAuthEmail(body: Record<string, unknown>): Promise<SuccessResult> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { success: false, error: NOT_CONFIGURED };
  try {
    const res = await fetch(`${url}/functions/v1/auth-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
    if (data?.ok) return { success: true };
    return { success: false, error: data?.reason || `The email could not be sent (HTTP ${res.status}). Try again.` };
  } catch (err: unknown) {
    log(`[Account email] auth-email unreachable: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: UNREACHABLE };
  }
}

function firstRow(data: unknown): Record<string, unknown> | undefined {
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
}

function activeSession(): { userId: string; sessionToken: string; deviceFingerprint: string } | null {
  if (!session.userId || !session.sessionToken || !session.deviceFingerprint) return null;
  return { userId: session.userId, sessionToken: session.sessionToken, deviceFingerprint: session.deviceFingerprint };
}

/** Sends a reset code if the email has an account. The answer is the same either way. */
export function requestPasswordReset(email: string): Promise<SuccessResult> {
  return callAuthEmail({ action: 'password_reset', email: email.trim().toLowerCase() });
}

export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<SuccessResult> {
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, error: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.rpc('confirm_password_reset', {
      p_email: input.email.trim().toLowerCase(),
      p_code: input.code.trim(),
      p_new_password: input.newPassword,
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!row?.['ok']) return { success: false, error: String(row?.['reason'] || 'Could not reset the password. Try again.') };
    log('[Account email] Password reset confirmed; all devices were signed out.');
    return { success: true };
  } catch (err: unknown) {
    log(`[Account email] confirm_password_reset failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: UNREACHABLE };
  }
}

export async function sendVerificationEmail(): Promise<SuccessResult> {
  const s = activeSession();
  if (!s) return { success: false, error: NO_SESSION };
  return callAuthEmail({
    action: 'email_verification',
    user_id: s.userId,
    session_token: s.sessionToken,
    device_fingerprint: s.deviceFingerprint,
  });
}

export async function confirmEmailVerification(code: string): Promise<SuccessResult & { verifiedAt?: string }> {
  const s = activeSession();
  if (!s) return { success: false, error: NO_SESSION };
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, error: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.rpc('confirm_email_verification', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_code: code.trim(),
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!row?.['ok']) return { success: false, error: String(row?.['reason'] || 'Could not verify the code. Try again.') };
    return { success: true, verifiedAt: row['email_verified_at'] ? String(row['email_verified_at']) : undefined };
  } catch (err: unknown) {
    log(`[Account email] confirm_email_verification failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: UNREACHABLE };
  }
}

/** Server truth for the signed-in account. Never guessed locally. */
export async function getEmailStatus(): Promise<EmailStatusResult> {
  const s = activeSession();
  if (!s) return { success: false, error: NO_SESSION };
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, error: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.rpc('account_email_status', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
    });
    if (error) throw error;
    const row = firstRow(data);
    if (!row?.['ok']) return { success: false, error: String(row?.['error'] || NO_SESSION) };
    const verifiedAt = row['email_verified_at'] ? String(row['email_verified_at']) : undefined;
    return { success: true, email: String(row['email'] ?? ''), verified: Boolean(verifiedAt), verifiedAt };
  } catch (err: unknown) {
    log(`[Account email] account_email_status failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: UNREACHABLE };
  }
}
