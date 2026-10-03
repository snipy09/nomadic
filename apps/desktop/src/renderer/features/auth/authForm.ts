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
