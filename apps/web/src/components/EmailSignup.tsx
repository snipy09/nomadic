import { FormEvent, useId, useRef, useState } from 'react';
import { SIGNUP } from '../content';
import { EMAIL_PATTERN, joinWaitlist } from '../waitlist';

type Status = 'idle' | 'sending' | 'done' | 'invalid' | 'failed';

interface EmailSignupProps {
  /** Where on the site the form sits, stored with the address. */
  source: string;
  className?: string;
}

/** Launch email capture. Sits on the dark ultramarine sections. */
export default function EmailSignup({ source, className = '' }: EmailSignupProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;

    // Bots fill every field; people never see this one.
    if (new FormData(event.currentTarget).get('company')) {
      setStatus('done');
      return;
    }

    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setStatus('invalid');
      inputRef.current?.focus();
      return;
    }

    setStatus('sending');
    try {
      await joinWaitlist(value, source);
      setStatus('done');
    } catch {
      setStatus('failed');
    }
  }

  const message =
    status === 'done' ? SIGNUP.done : status === 'invalid' ? SIGNUP.invalid : status === 'failed' ? SIGNUP.failed : '';
  const hasError = status === 'invalid' || status === 'failed';

  return (
    <div className={`max-w-xl ${className}`}>
      {status === 'done' ? (
        <p className="border-l-4 border-marigold py-2 pl-4 text-lg font-bold" role="status">
          {message}
        </p>
      ) : (
        <form noValidate onSubmit={onSubmit}>
          <label htmlFor={`${id}-email`} className="block font-bold">
            {SIGNUP.label}
          </label>
          <div className="mt-3 flex flex-col gap-2 min-[480px]:flex-row min-[480px]:gap-0">
            <input
              ref={inputRef}
              id={`${id}-email`}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (hasError) setStatus('idle');
              }}
              placeholder={SIGNUP.placeholder}
              aria-invalid={status === 'invalid' || undefined}
              aria-describedby={`${id}-msg ${id}-note`}
              className="min-h-14 w-full min-w-0 flex-1 rounded border-2 border-white bg-white px-4 text-lg text-ink placeholder:text-ink-soft min-[480px]:rounded-r-none"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="min-h-14 shrink-0 rounded border-2 border-marigold bg-marigold px-6 text-lg font-bold text-ink transition-colors hover:border-white hover:bg-white disabled:cursor-wait disabled:opacity-80 min-[480px]:rounded-l-none"
            >
              {status === 'sending' ? SIGNUP.sending : SIGNUP.button}
            </button>
          </div>

          {/* Honeypot: off screen, out of the tab order and hidden from assistive tech. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Company
              <input type="text" name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <p id={`${id}-msg`} role="alert" className={`font-bold text-marigold ${message ? 'mt-3' : ''}`}>
            {message}
          </p>
        </form>
      )}
      <p id={`${id}-note`} className="mt-3 text-sm text-white/80">
        {SIGNUP.note}
      </p>
    </div>
  );
}
