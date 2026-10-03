import { useCallback, useState } from 'react';
import { getApi } from '../../types';
import { normalizeCode } from './accountEmail';

export type ResetStep = 'request' | 'confirm' | 'done';

export interface PasswordResetState {
  step: ResetStep;
  email: string;
  busy: boolean;
  error: string | null;
  /** Sends (or re-sends) the code. Moves to `confirm` on success. */
  request: (email: string) => Promise<boolean>;
  confirm: (code: string, newPassword: string) => Promise<boolean>;
  /** Back to the email step, e.g. to fix a typo. */
  restart: () => void;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Two-step reset: request a code by email, then submit the code with a new password. */
export function usePasswordReset(): PasswordResetState {
  const [step, setStep] = useState<ResetStep>('request');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (raw: string) => {
    const api = getApi();
    if (!api.requestPasswordReset) {
      setError('Password reset is not available in this build.');
      return false;
    }
    const next = raw.trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestPasswordReset(next);
      if (!res?.success) {
        setError(res?.error || 'Could not send the code. Try again.');
        return false;
      }
      setEmail(next);
      setStep('confirm');
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not send the code. Try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const confirm = useCallback(async (code: string, newPassword: string) => {
    const api = getApi();
    if (!api.confirmPasswordReset) {
      setError('Password reset is not available in this build.');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.confirmPasswordReset({ email, code: normalizeCode(code), newPassword });
      if (!res?.success) {
        setError(res?.error || 'Could not reset the password. Try again.');
        return false;
      }
      setStep('done');
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not reset the password. Try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [email]);

  const restart = useCallback(() => {
    setStep('request');
    setError(null);
  }, []);

  return { step, email, busy, error, request, confirm, restart };
}
