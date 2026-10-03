import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Button, Card, Field, Input } from '@nomadic/ui';
import { EMAIL_CODE_LENGTH, normalizeCode, validateCode } from './accountEmail';
import { useEmailVerification } from './useEmailVerification';
import { FormAlert } from './FormAlert';

interface EmailVerificationBannerProps {
  userId: string | number | null | undefined;
}

/**
 * Asks a signed-in user to verify their email. Shown only when the server says the
 * email is unverified; nothing is shown while the status is unknown.
 */
export const EmailVerificationBanner: React.FC<EmailVerificationBannerProps> = ({ userId }) => {
  const v = useEmailVerification(userId);
  const [dismissed, setDismissed] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();

  if (v.verified !== false || dismissed) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCode(code);
    setCodeError(err);
    if (err) {
      document.getElementById('verify-code')?.focus();
      return;
    }
    await v.confirm(code);
  };

  return (
    <Card variant="outline" padding="md" className="mx-auto mb-5 w-full max-w-6xl gap-3" role="region" aria-label="Verify your email">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-body font-strong text-fg">Verify your email</h2>
          <p className="text-body text-fg-muted">
            {v.codeSent
              ? `We sent an ${EMAIL_CODE_LENGTH}-digit code to ${v.email ?? 'your email'}. It expires in 24 hours.`
              : `Confirm ${v.email ?? 'your email'} so you can reset your password if you forget it.`}
          </p>
        </div>
      </div>

      {v.codeSent ? (
        <form noValidate aria-label="Verify email code" className="flex flex-wrap items-end gap-2" onSubmit={(e) => void submit(e)}>
          <Field label="Code" required error={codeError} id="verify-code" className="min-w-48 flex-1">
            <Input
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={v.confirming}
              autoFocus
            />
          </Field>
          <Button type="submit" variant="primary" loading={v.confirming} loadingText="Verifying…">Verify</Button>
          <Button type="button" variant="ghost" onClick={() => void v.send()} disabled={v.sending || v.confirming}>
            Send a new code
          </Button>
        </form>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDismissed(true)}>Later</Button>
          <Button variant="primary" loading={v.sending} loadingText="Sending…" onClick={() => void v.send()}>Email me a code</Button>
        </div>
      )}
      <FormAlert message={v.error} />
    </Card>
  );
};
