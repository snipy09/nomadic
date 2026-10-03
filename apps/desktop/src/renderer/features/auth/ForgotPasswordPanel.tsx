import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Field, Input } from '@nomadic/ui';
import {
  EMAIL_CODE_LENGTH, normalizeCode, resetSentMessage, validateResetConfirm, validateResetEmail,
  type ResetConfirmErrors, type ResetConfirmValues,
} from './accountEmail';
import { usePasswordReset } from './usePasswordReset';
import { FormAlert } from './FormAlert';

interface ForgotPasswordPanelProps {
  initialEmail: string;
  /** Back to sign-in, prefilled with the email used here. */
  onDone: (email: string) => void;
}

/** Reset a forgotten password with an emailed code: email -> code + new password -> done. */
export const ForgotPasswordPanel: React.FC<ForgotPasswordPanelProps> = ({ initialEmail, onDone }) => {
  const reset = usePasswordReset();
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [values, setValues] = useState<ResetConfirmValues>({ code: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<ResetConfirmErrors>({});

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateResetEmail(email);
    setEmailError(err);
    if (err) {
      document.getElementById('reset-email')?.focus();
      return;
    }
    await reset.request(email);
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateResetConfirm(values);
    setErrors(errs);
    const first = (['code', 'newPassword', 'confirmPassword'] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`reset-${first}`)?.focus();
      return;
    }
    await reset.confirm(values.code, values.newPassword);
  };

  const set = (key: keyof ResetConfirmValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: key === 'code' ? normalizeCode(e.target.value) : e.target.value }));

  if (reset.step === 'done') {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="text-body-lg font-strong text-fg">Password changed</h2>
            <p className="text-body text-fg-muted">Every computer signed in to this account was signed out. Sign in with your new password.</p>
          </div>
        </div>
        <Button variant="primary" fullWidth onClick={() => onDone(reset.email)} autoFocus>Back to sign in</Button>
      </div>
    );
  }

  if (reset.step === 'confirm') {
    return (
      <form noValidate aria-label="Set a new password" className="flex flex-col gap-4" onSubmit={(e) => void submitConfirm(e)}>
        <div className="flex flex-col gap-1">
          <h2 className="text-body-lg font-strong text-fg">Check your email</h2>
          <p className="text-body text-fg-muted">{resetSentMessage(reset.email)}</p>
        </div>
        <Field label="Code" required error={errors.code} id="reset-code" hint={`${EMAIL_CODE_LENGTH} digits`}>
          <Input value={values.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" disabled={reset.busy} autoFocus />
        </Field>
        <Field label="New password" required error={errors.newPassword} id="reset-newPassword" hint="At least 6 characters.">
          <Input type="password" value={values.newPassword} onChange={set('newPassword')} autoComplete="new-password" disabled={reset.busy} />
        </Field>
        <Field label="Confirm new password" required error={errors.confirmPassword} id="reset-confirmPassword">
          <Input type="password" value={values.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" disabled={reset.busy} />
        </Field>
        <FormAlert message={reset.error} />
        <Button type="submit" variant="primary" fullWidth loading={reset.busy} loadingText="Saving…">Set new password</Button>
        <div className="flex justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={reset.restart} disabled={reset.busy}>Use another email</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void reset.request(reset.email)} disabled={reset.busy}>
            Send a new code
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form noValidate aria-label="Reset password" className="flex flex-col gap-4" onSubmit={(e) => void submitEmail(e)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-body-lg font-strong text-fg">Reset your password</h2>
        <p className="text-body text-fg-muted">Enter the email you signed up with. We will email you a code.</p>
      </div>
      <Field label="Email" required error={emailError} id="reset-email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={reset.busy} autoFocus />
      </Field>
      <FormAlert message={reset.error} />
      <Button type="submit" variant="primary" fullWidth loading={reset.busy} loadingText="Sending…">Email me a code</Button>
      <Button type="button" variant="ghost" fullWidth onClick={() => onDone(email)} disabled={reset.busy}>Back to sign in</Button>
    </form>
  );
};
