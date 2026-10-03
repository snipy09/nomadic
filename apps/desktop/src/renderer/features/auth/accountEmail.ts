/** Pure helpers for password reset and email verification. No React, no IPC. */
import { MIN_PASSWORD_LENGTH } from './authForm';

/** Must match migration 016 and the zod schema in main/ipc/schemas.ts. */
export const EMAIL_CODE_LENGTH = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps digits only, so "1234 5678" or "1234-5678" pasted from the email still works. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

export function validateResetEmail(email: string): string | undefined {
  const e = email.trim();
  if (!e) return 'Enter your email.';
  if (!EMAIL.test(e)) return 'Enter a valid email address.';
  return undefined;
}

export function validateCode(code: string): string | undefined {
  const c = normalizeCode(code);
  if (!c) return 'Enter the code from the email.';
  if (c.length !== EMAIL_CODE_LENGTH) return `The code has ${EMAIL_CODE_LENGTH} digits.`;
  return undefined;
}

export interface ResetConfirmValues {
  code: string;
  newPassword: string;
  confirmPassword: string;
}

export type ResetConfirmErrors = Partial<Record<keyof ResetConfirmValues, string>>;

export function validateResetConfirm(v: ResetConfirmValues): ResetConfirmErrors {
  const e: ResetConfirmErrors = {};
  const codeErr = validateCode(v.code);
  if (codeErr) e.code = codeErr;
  if (!v.newPassword) e.newPassword = 'Enter a new password.';
  else if (v.newPassword.length < MIN_PASSWORD_LENGTH) e.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!e.newPassword && v.confirmPassword !== v.newPassword) e.confirmPassword = 'The passwords do not match.';
  return e;
}

/** What the request step shows after sending. Same text whether or not the email has an account. */
export function resetSentMessage(email: string): string {
  return `If ${email.trim().toLowerCase()} has a Nomadic account, we sent it an ${EMAIL_CODE_LENGTH}-digit code. It expires in 30 minutes.`;
}
