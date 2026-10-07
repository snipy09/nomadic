import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Field, Input } from '@nomadic/ui';
import { getApi } from '../../types';
import { CODE_LENGTH, RESET_FALLBACK_ERROR, normalizeCode, validateCode } from './authForm';

interface VerifyEmailPanelProps {
  email?: string;
  /** Send a code as soon as the panel opens (after sign-up, or when the user chose "Verify email"). */
  autoSend?: boolean;
  onVerified: () => void;
  /** Verification is optional: the account works without it. */
  onSkip?: () => void;
  skipLabel?: string;
}

/** Sends a 6-digit code to the signed-in account's email and confirms it. */
export const VerifyEmailPanel: React.FC<VerifyEmailPanelProps> = ({ email, autoSend = false, onVerified, onSkip, skipLabel = 'Skip for now' }) => {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'send' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoSent = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const send = async () => {
    const api = getApi();
    if (!api?.authSendVerification) {
      setError('Email verification is not available in this build.');
      return;
    }
    setBusy('send');
    setError(null);
    setNotice(null);
    try {
      const res = await api.authSendVerification();
      if (res?.success && res.alreadyVerified) {
        onVerified();
        return;
      }
      if (!res?.success) {
        setError(res?.error || RESET_FALLBACK_ERROR);
        return;
      }
      const again = sent;
      setSent(true);
      setNotice(
        `${again ? 'A new code is on its way' : 'We sent a 6-digit code'}${email ? ` to ${email}` : ''}. It expires in 15 minutes.`
      );
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      setError(RESET_FALLBACK_ERROR);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    // Guarded so a StrictMode double effect does not send two emails.
    if (autoSend && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  const confirm = async () => {
    setShowErrors(true);
    if (validateCode(code)) {
      codeRef.current?.focus();
      return;
    }
    const api = getApi();
    if (!api?.authConfirmVerification) {
      setError('Email verification is not available in this build.');
      return;
    }
    setBusy('confirm');
    setError(null);
    try {
      const res = await api.authConfirmVerification({ code: normalizeCode(code) });
      if (!res?.success) {
        setError(res?.error || RESET_FALLBACK_ERROR);
        if (res?.code === 'invalid_code') { setCode(''); setShowErrors(false); }
        return;
      }
      onVerified();
    } catch {
      setError(RESET_FALLBACK_ERROR);
    } finally {
      setBusy(null);
    }
  };

  const codeError = showErrors ? validateCode(code) : undefined;

  return (
    <form
      noValidate
      aria-label="Verify your email"
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); void confirm(); }}
    >
      <p className="text-body text-fg-muted">
        Verifying {email ? <span className="font-strong text-fg">{email}</span> : 'your email'} makes sure you can reset
        your password if you forget it. Everything in Nomadic works while you decide.
      </p>
      {notice && <p role="status" className="text-body text-fg">{notice}</p>}
      {sent && (
        <Field label="Code" required error={codeError} id="verify-code">
          <Input
            ref={codeRef}
            value={code}
            onChange={(e) => { setCode(normalizeCode(e.target.value)); setError(null); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH + 2}
            disabled={busy !== null}
          />
        </Field>
      )}
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg outline-none"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {sent ? (
        <Button type="submit" variant="primary" fullWidth loading={busy === 'confirm'} loadingText="Verifying…" disabled={busy === 'send'}>
          Verify email
        </Button>
      ) : (
        <Button variant="primary" fullWidth loading={busy === 'send'} loadingText="Sending code…" onClick={() => void send()}>
          Send code
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onSkip ? (
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy !== null}>{skipLabel}</Button>
        ) : <span />}
        {sent && (
          <Button variant="ghost" size="sm" onClick={() => void send()} loading={busy === 'send'} loadingText="Sending…" disabled={busy === 'confirm'}>
            Send a new code
          </Button>
        )}
      </div>
    </form>
  );
};
