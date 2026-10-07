import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, MonitorSmartphone } from 'lucide-react';
import {
  Button, Card, Checkbox, Field, IconButton, Input, NomadicLogo, Spinner, Tabs, TabsList, TabsTrigger,
} from '@nomadic/ui';
import { getApi, type AppUser } from '../../types';
import { prefs } from '../../store/preferences';
import { friendlyAuthError, validateAuth, type AuthFieldErrors, type AuthFormValues, type AuthMode } from './authForm';
import { TermsDialog } from './TermsDialog';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';
import { VerifyEmailPanel } from './VerifyEmailPanel';
import { IS_MOBILE } from '../../platform';

interface AuthScreenProps {
  onLoginSuccess: (user: AppUser) => void;
  onLog?: (msg: string) => void;
  /** Why the previous session ended (e.g. signed in on another laptop), shown until the next attempt. */
  notice?: string | null;
}

const IDS = { fullName: 'auth-full-name', email: 'auth-email', password: 'auth-password', terms: 'auth-terms' } as const;

const readTerms = () => {
  try { return prefs.getTermsAccepted(); } catch { return false; }
};

/** Set by vite.config.ts; hidden only when the build is known to have no Google client id. */
const GOOGLE_SIGN_IN = ((import.meta as any).env?.VITE_GOOGLE_SIGN_IN as string | undefined) !== 'off';

interface OAuthPayload { success?: boolean; user?: AppUser; conflict?: boolean; activeDevice?: string; error?: string }

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/** Sign in, create an account, or continue with Google. Terms must be accepted for every path. */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess, onLog, notice }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [values, setValues] = useState<AuthFormValues>({ fullName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(readTerms);
  const [termsOpen, setTermsOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(notice ?? null);
  const [conflictDevice, setConflictDevice] = useState<string | null>(null);
  // Which sign-in hit the single-laptop lock: "Continue here" retries the same method with takeover.
  const [conflictVia, setConflictVia] = useState<'password' | 'google'>('password');
  const [googleWaiting, setGoogleWaiting] = useState(false);
  const [termsPrompt, setTermsPrompt] = useState(false);
  // "Continue with Google" opened the terms; accepting them goes on to Google.
  const [googleAfterTerms, setGoogleAfterTerms] = useState(false);
  // 'forgot': password reset flow; 'verify': optional email verification right after sign-up.
  const [view, setView] = useState<'form' | 'forgot' | 'verify'>('form');
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  // Google sign-in finishes in the browser; the main process reports back here.
  useEffect(() => {
    const api = getApi();
    if (!api?.onOauthCallback) return;
    const unsubscribe = api.onOauthCallback(((data: unknown) => {
      const payload = (data ?? {}) as OAuthPayload;
      setGoogleWaiting(false);
      if (payload.conflict) {
        setConflictVia('google');
        setConflictDevice(payload.activeDevice || 'another computer');
        return;
      }
      if (payload.success && payload.user) {
        onLog?.(`[Auth] Signed in with Google as ${payload.user.email}`);
        onLoginSuccess(payload.user);
      } else {
        setFormError(`Google sign-in did not finish${payload.error ? `: ${payload.error}` : '.'} Try again.`);
      }
    }) as unknown as (url: string) => void);
    return () => { unsubscribe?.(); };
  }, [onLoginSuccess, onLog]);

  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);

  // The sign-out notice can arrive just after this screen mounts.
  useEffect(() => {
    if (notice) setFormError(notice);
  }, [notice]);

  const errors: AuthFieldErrors = showErrors ? validateAuth(mode, values, termsAccepted) : {};

  const set = (key: keyof AuthFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setFormError(null);
  };

  const acceptTerms = (v: boolean) => {
    setTermsAccepted(v);
    if (v) setTermsPrompt(false);
    try { prefs.setTermsAccepted(v); } catch { /* preference only */ }
  };

  const switchMode = (next: string) => {
    setMode(next as AuthMode);
    setShowErrors(false);
    setFormError(null);
    setConflictDevice(null);
  };

  const focusFirstInvalid = (errs: AuthFieldErrors) => {
    const first = (['fullName', 'email', 'password', 'terms'] as const).find((k) => errs[k]);
    if (first) document.getElementById(IDS[first])?.focus();
  };

  const submit = async (forceTakeover = false) => {
    const errs = validateAuth(mode, values, termsAccepted);
    setShowErrors(true);
    if (Object.keys(errs).length) {
      focusFirstInvalid(errs);
      return;
    }
    const api = getApi();
    setSubmitting(true);
    setFormError(null);
    setConflictDevice(null);
    try {
      const email = values.email.trim().toLowerCase();
      if (mode === 'signup') {
        if (!api?.authSignup) throw new Error('Sign-up is not available in this build.');
        const res = await api.authSignup({ email, password: values.password, fullName: values.fullName.trim() });
        if (!res?.success || !res.user) {
          setFormError(friendlyAuthError('signup', res?.error));
          return;
        }
        onLog?.(`[Auth] Account created for ${res.user.email}`);
        if (api.authSendVerification) {
          // Offer verification before onboarding. It is optional and never blocks the account.
          setPendingUser(res.user);
          setView('verify');
          return;
        }
        onLoginSuccess(res.user);
        return;
      }
      const res = await api.authLogin({ email, password: values.password, forceTakeover });
      if (res?.conflict && !forceTakeover) {
        setConflictVia('password');
        setConflictDevice(res.activeDevice || 'another computer');
        return;
      }
      if (!res?.success || !res.user) {
        setFormError(friendlyAuthError('signin', res?.error));
        return;
      }
      onLog?.(`[Auth] Signed in as ${res.user.email}`);
      onLoginSuccess(res.user);
    } catch (e) {
      setFormError(friendlyAuthError(mode, e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const startGoogle = async (forceTakeover = false, termsOk = termsAccepted) => {
    if (!termsOk) {
      // Show the terms right away; accepting them continues to Google (the button never looks dead).
      setTermsPrompt(true);
      setFormError(null);
      setGoogleAfterTerms(true);
      setTermsOpen(true);
      return;
    }
    setFormError(null);
    setConflictDevice(null);
    setGoogleWaiting(true);
    try {
      const res = await getApi().authGoogle(forceTakeover ? { forceTakeover: true } : undefined);
      if (!res?.success) {
        setGoogleWaiting(false);
        setFormError(res?.error || 'Could not open Google sign-in in your browser.');
      } else {
        onLog?.('[Auth] Google sign-in opened in the browser');
      }
    } catch {
      setGoogleWaiting(false);
      setFormError('Could not open Google sign-in in your browser.');
    }
  };

  const openForgot = () => {
    setFormError(null);
    setConflictDevice(null);
    setShowErrors(false);
    setView('forgot');
  };

  const backFromForgot = (email: string) => {
    setView('form');
    setMode('signin');
    setShowErrors(false);
    setFormError(null);
    setValues((v) => ({ ...v, email: email || v.email, password: '' }));
    setTimeout(() => document.getElementById(email ? IDS.password : IDS.email)?.focus(), 0);
  };

  const finishSignup = () => {
    const u = pendingUser;
    if (!u) return;
    setPendingUser(null);
    onLoginSuccess(u);
  };

  const busy = submitting || googleWaiting;
  const isSignup = mode === 'signup';
  const title = view === 'forgot' ? 'Reset your password'
    : view === 'verify' ? 'Verify your email'
    : isSignup ? 'Create your account' : 'Sign in to Nomadic';
  // Google needs only the terms, so its prompt does not reveal the form's field errors.
  const termsError = errors.terms ?? (termsPrompt && !termsAccepted ? 'Accept the terms to continue.' : undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 text-fg">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <NomadicLogo className="h-7" />
          <div className="flex flex-col gap-1">
            <h1 className="text-title font-strong text-fg">{title}</h1>
            <p className="text-body text-fg-muted">Placements, internships and the skills to land them.</p>
          </div>
        </header>

        <Card variant="raised" padding="lg" className="gap-5">
          {view === 'forgot' ? (
            <ForgotPasswordFlow initialEmail={values.email} onBack={backFromForgot} />
          ) : view === 'verify' && pendingUser ? (
            <VerifyEmailPanel email={pendingUser.email} autoSend onVerified={finishSignup} onSkip={finishSignup} />
          ) : (
          <>
          <Tabs variant="segmented" value={mode} onValueChange={switchMode} className="items-center">
            <TabsList aria-label="Account">
              <TabsTrigger value="signin" disabled={busy}>Sign in</TabsTrigger>
              <TabsTrigger value="signup" disabled={busy}>Create account</TabsTrigger>
            </TabsList>
          </Tabs>

          {conflictDevice ? (
            <div role="alertdialog" aria-labelledby="auth-conflict-title" aria-describedby="auth-conflict-desc" className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <h2 id="auth-conflict-title" className="text-body-lg font-strong text-fg">Signed in on another computer</h2>
                  <p id="auth-conflict-desc" className="text-body text-fg-muted">
                    Your account is active on {conflictDevice}. One computer can be signed in at a time. Continue here to sign that computer out.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConflictDevice(null)} disabled={submitting}>Cancel</Button>
                <Button variant="primary" loading={submitting} loadingText="Signing in…" onClick={() => void (conflictVia === 'google' ? startGoogle(true) : submit(true))} autoFocus>
                  Continue here
                </Button>
              </div>
            </div>
          ) : (
            <form
              noValidate
              aria-label={isSignup ? 'Create account' : 'Sign in'}
              className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
            >
              {isSignup && (
                <Field label="Full name" required error={errors.fullName} id={IDS.fullName}>
                  <Input value={values.fullName} onChange={set('fullName')} autoComplete="name" disabled={busy} />
                </Field>
              )}
              <Field label="Email" required error={errors.email} id={IDS.email}>
                <Input type="email" value={values.email} onChange={set('email')} autoComplete="email" disabled={busy} autoFocus />
              </Field>
              <Field
                label="Password"
                required
                error={errors.password}
                id={IDS.password}
                hint={isSignup ? 'At least 6 characters.' : undefined}
              >
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={values.password}
                  onChange={set('password')}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  disabled={busy}
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

              <div className="flex flex-col gap-1">
                <Checkbox
                  id={IDS.terms}
                  checked={termsAccepted}
                  onCheckedChange={(v) => acceptTerms(v === true)}
                  invalid={Boolean(termsError)}
                  aria-describedby={termsError ? 'auth-terms-error' : undefined}
                  label="I agree to the terms of service"
                  disabled={busy}
                />
                <div className="flex items-center justify-between gap-2 pl-6">
                  <button
                    type="button"
                    className="text-label text-accent-subtle-fg underline underline-offset-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => setTermsOpen(true)}
                  >
                    Read the terms
                  </button>
                </div>
                {termsError && (
                  <p id="auth-terms-error" role="alert" className="pl-6 text-label text-danger-fg">{termsError}</p>
                )}
              </div>

              {formError && (
                <div
                  ref={formErrorRef}
                  tabIndex={-1}
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg outline-none"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={submitting}
                loadingText={isSignup ? 'Creating account…' : 'Signing in…'}
                disabled={googleWaiting}
              >
                {isSignup ? 'Create account' : 'Sign in'}
              </Button>
              {!isSignup && (
                <Button variant="ghost" size="sm" className="self-center" onClick={openForgot} disabled={busy}>
                  Forgot password?
                </Button>
              )}
            </form>
          )}

          {GOOGLE_SIGN_IN && (
          <>
          <div className="flex items-center gap-3 text-caption text-fg-subtle" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>

          {googleWaiting ? (
            <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-body text-fg">
                <Spinner size="sm" label={null} />
                <span>Finish signing in with Google in your browser.</span>
              </div>
              <p className="text-caption text-fg-muted">
                Nothing opened? Choose “Open browser again”. If Google says access is blocked, cancel and sign in with
                email and password for now.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setGoogleWaiting(false)}>Cancel</Button>
                <Button size="sm" variant="secondary" onClick={() => void startGoogle()}>Open browser again</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" fullWidth leftIcon={<GoogleIcon />} onClick={() => void startGoogle()} disabled={submitting}>
              Continue with Google
            </Button>
          )}
          </>
          )}
          </>
          )}
        </Card>

        <p className="text-center text-caption text-fg-subtle">
          {IS_MOBILE ? 'One account can be signed in on one computer and one phone at a time.' : 'One account can be signed in on one computer at a time.'}
        </p>
      </div>

      <TermsDialog
        open={termsOpen}
        onOpenChange={(open) => {
          setTermsOpen(open);
          if (!open) setGoogleAfterTerms(false);
        }}
        accepted={termsAccepted}
        onAccept={() => {
          acceptTerms(true);
          if (googleAfterTerms) void startGoogle(false, true);
        }}
      />
    </main>
  );
};
