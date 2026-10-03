import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button, Field, IconButton, Input } from '@nomadic/ui';
import { getApi } from '../../types';
import {
  CODE_LENGTH, MIN_PASSWORD_LENGTH, RESET_FALLBACK_ERROR, normalizeCode, validateEmailOnly, validateResetConfirm,
  type ResetFieldErrors,
} from './authForm';

interface ForgotPasswordFlowProps {
  initialEmail?: string;
  /** Back to the sign-in form, with the email to prefill. */
  onBack: (email: string) => void;
}

type Step = 'email' | 'code' | 'done';

const IDS = { email: 'reset-email', code: 'reset-code', password: 'reset-password' } as const;

/**
 * Email -> 6-digit code + new password -> done. The "code sent" message is the same whether or not an
 * account exists for the email (SECURITY_CHECKLIST S2d); every code failure shows one message.
 */
export const ForgotPasswordFlow: React.FC<ForgotPasswordFlowProps> = ({ initialEmail = '', onBack }) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail.trim());
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'send' | 'resend' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const emailError = showErrors && step === 'email' ? validateEmailOnly(email) : undefined;
  const confirmErrors: ResetFieldErrors = showErrors && step === 'code' ? validateResetConfirm(code, password) : {};

  const requestCode = async (mode: 'send' | 'resend') => {
    const api = getApi();
    if (!api?.authRequestPasswordReset) {
      setError('Password reset is not available in this build.');
      return;
    }
    setBusy(mode);
    setError(null);
    setNotice(null);
    try {
      const res = await api.authRequestPasswordReset({ email: email.trim().toLowerCase() });
      if (!res?.success) {
        setError(res?.error || RESET_FALLBACK_ERROR);
        return;
      }
      setShowErrors(false);
      if (mode === 'send') setStep('code');
      else setNotice('If an account exists for this email, a new code is on its way. Earlier codes no longer work.');
    } catch {
      setError(RESET_FALLBACK_ERROR);
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = () => {
    setShowErrors(true);
    if (validateEmailOnly(email)) {
      document.getElementById(IDS.email)?.focus();
      return;
    }
    void requestCode('send');
  };

  const submitCode = async () => {
    setShowErrors(true);
    const errs = validateResetConfirm(code, password);
    if (Object.keys(errs).length) {
      document.getElementById(errs.code ? IDS.code : IDS.password)?.focus();
      return;
    }
    const api = getApi();
    if (!api?.authConfirmPasswordReset) {
      setError('Password reset is not available in this build.');
      return;
    }
    setBusy('confirm');
    setError(null);
    setNotice(null);
    try {
      const res = await api.authConfirmPasswordReset({
        email: email.trim().toLowerCase(),
        code: normalizeCode(code),
        newPassword: password,
      });
      if (!res?.success) {
        setError(res?.error || RESET_FALLBACK_ERROR);
        if (res?.code === 'invalid_code') { setCode(''); setShowErrors(false); }
        return;
      }
      setStep('done');
    } catch {
      setError(RESET_FALLBACK_ERROR);
    } finally {
      setBusy(null);
    }
  };

  const errorBox = error && (
    <div
      ref={errorRef}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg outline-none"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </div>
  );

  if (step === 'done') {
    return (
      <section aria-labelledby="reset-done-title" className="flex flex-col gap-4">
        <div className="flex items-start gap-3" role="status">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 id="reset-done-title" className="text-body-lg font-strong text-fg">Password updated</h2>
            <p className="text-body text-fg-muted">
              Sign in with your new password. Any computer that was signed in to your account has been signed out.
            </p>
          </div>
        </div>
        <Button variant="primary" fullWidth onClick={() => onBack(email.trim().toLowerCase())} autoFocus>
          Back to sign in
        </Button>
      </section>
    );
  }

  if (step === 'code') {
    return (
      <form
        noValidate
        aria-label="Choose a new password"
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void submitCode(); }}
      >
        <p className="text-body text-fg-muted" role="status">
          If an account exists for <span className="font-strong text-fg">{email.trim().toLowerCase()}</span>, we sent a{' '}
          {CODE_LENGTH}-digit code to it. The code expires in 15 minutes. Check your spam folder if it does not arrive.
        </p>
        <Field label="Code" required error={confirmErrors.code} id={IDS.code}>
          <Input
            value={code}
            onChange={(e) => { setCode(normalizeCode(e.target.value)); setError(null); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH + 2}
            disabled={busy !== null}
            autoFocus
          />
        </Field>
        <Field
          label="New password"
          required
          error={confirmErrors.password}
          id={IDS.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            autoComplete="new-password"
            disabled={busy !== null}
            rightSlot={
              <IconButton
                size="sm"
                variant="ghost"
                label={showPassword ? 'Hide password' : 'Show password'}
                icon={showPassword ? <EyeOff /> : <Eye />}
                onClick={() => setShowPassword((s) => !s)}
              />
            }
          />
        </Field>
        {errorBox}
        {notice && <p role="status" className="text-label text-fg-muted">{notice}</p>}
        <Button type="submit" variant="primary" fullWidth loading={busy === 'confirm'} loadingText="Updating password…" disabled={busy !== null && busy !== 'confirm'}>
          Update password
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => onBack(email.trim().toLowerCase())} disabled={busy !== null}>
            Back to sign in
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void requestCode('resend')} loading={busy === 'resend'} loadingText="Sending…" disabled={busy !== null && busy !== 'resend'}>
            Send a new code
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      noValidate
      aria-label="Reset password"
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); submitEmail(); }}
    >
      <p className="text-body text-fg-muted">Enter the email you signed up with and we will send you a {CODE_LENGTH}-digit code.</p>
      <Field label="Email" required error={emailError} id={IDS.email}>
        <Input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          autoComplete="email"
          disabled={busy !== null}
          autoFocus
        />
      </Field>
      {errorBox}
      <Button type="submit" variant="primary" fullWidth loading={busy === 'send'} loadingText="Sending code…">
        Send code
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onBack(email.trim().toLowerCase())} disabled={busy !== null}>
        Back to sign in
      </Button>
    </form>
  );
};
