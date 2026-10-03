/** Pure helpers for the sign-in / sign-up screen. No React, no IPC. */

export type AuthMode = 'signin' | 'signup';

export interface AuthFormValues {
  fullName: string;
  email: string;
  password: string;
}

export type AuthFieldErrors = Partial<Record<'fullName' | 'email' | 'password' | 'terms', string>>;

/** Must match register_user (migration 009) and signupLocalAccount in the main process. */
export const MIN_PASSWORD_LENGTH = 6;

/** The one message for a wrong email or password. Never says which of the two was wrong. */
export const BAD_CREDENTIALS = 'Incorrect email or password.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuth(mode: AuthMode, v: AuthFormValues, termsAccepted: boolean): AuthFieldErrors {
  const e: AuthFieldErrors = {};
  const email = v.email.trim();
  if (mode === 'signup' && !v.fullName.trim()) e.fullName = 'Enter your name.';
  if (!email) e.email = 'Enter your email.';
  else if (!EMAIL.test(email)) e.email = 'Enter a valid email address.';
  if (!v.password) e.password = 'Enter your password.';
  else if (mode === 'signup' && v.password.length < MIN_PASSWORD_LENGTH) {
    e.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!termsAccepted) e.terms = 'Accept the terms to continue.';
  return e;
}

/**
 * Turns a main-process / server error into what the user sees.
 * Anything that is about the credentials collapses into one generic message so the
 * screen never reveals whether an account exists for an email.
 */
export function friendlyAuthError(mode: AuthMode, raw: string | undefined | null): string {
  const msg = (raw ?? '').trim();
  if (!msg) return mode === 'signup' ? 'Sign-up failed. Please try again.' : 'Sign-in failed. Please try again.';
  const aboutCredentials =
    /incorrect|invalid (credentials|email|password)|wrong password|no account|not found|does not exist|user not|license was issued/i;
  if (mode === 'signin' && aboutCredentials.test(msg)) return BAD_CREDENTIALS;
  return msg;
}

// ── Password reset and email verification ─────────────────────────────────

export const CODE_LENGTH = 6;

/** Keeps only digits, at most six (people paste "123 456" or "123-456"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function validateEmailOnly(email: string): string | undefined {
  const e = email.trim();
  if (!e) return 'Enter your email.';
  if (!EMAIL.test(e)) return 'Enter a valid email address.';
  return undefined;
}

export function validateCode(code: string): string | undefined {
  return normalizeCode(code).length === CODE_LENGTH ? undefined : `Enter the ${CODE_LENGTH}-digit code from the email.`;
}

export type ResetFieldErrors = Partial<Record<'code' | 'password', string>>;

/** Same password rule as sign-up (trimmed, at least 6 characters). */
export function validateResetConfirm(code: string, password: string): ResetFieldErrors {
  const e: ResetFieldErrors = {};
  const codeError = validateCode(code);
  if (codeError) e.code = codeError;
  if (!password.trim()) e.password = 'Enter a new password.';
  else if (password.trim().length < MIN_PASSWORD_LENGTH) e.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return e;
}

/** Fallback when the main process gives no message (never says whether an account exists). */
export const RESET_FALLBACK_ERROR = 'Something went wrong. Please try again.';
