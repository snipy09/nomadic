import type { ErrorEvent, EventHint } from '@sentry/electron/main';

// Opt-in crash and error reporting (decision 9, SAAS_PLAN B5). Sentry starts
// only when the user turned it on in Settings and the build has a DSN
// (SENTRY_DSN at build time; a DSN only allows sending events, it is not a secret).
// Every event is scrubbed: no user, no request data, no breadcrumbs with
// values, no emails, tokens or home-directory paths.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const USER_PATH = /([A-Za-z]:\\+Users\\+|\/home\/|\/Users\/)[^\\/\s"']+/g;
const TOKENISH = /\b[A-Za-z0-9_-]{32,}\b/g;

export function scrubText(s: string): string {
  return s.replace(EMAIL, '<email>').replace(USER_PATH, (_m, p: string) => `${p}<user>`).replace(TOKENISH, '<token>');
}

/** beforeSend: returns null (drop) when consent is off, otherwise a scrubbed copy. */
export function scrubEvent(event: ErrorEvent, consent: boolean): ErrorEvent | null {
  if (!consent) return null;
  const e: ErrorEvent = { ...event };
  delete e.user;
  delete e.request;
  delete e.server_name;
  if (e.extra) e.extra = {};
  if (e.contexts) {
    const { app, os, device, runtime, browser, chrome, electron, trace } = e.contexts as Record<string, never>;
    e.contexts = Object.fromEntries(Object.entries({ app, os, device, runtime, browser, chrome, electron, trace }).filter(([, v]) => v !== undefined));
  }
  if (e.message) e.message = scrubText(e.message);
  e.breadcrumbs = (e.breadcrumbs ?? [])
    .filter((b) => b.category !== 'ui.input' && b.category !== 'console')
    .map((b) => ({ ...b, message: b.message ? scrubText(b.message) : b.message, data: undefined }));
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v) => ({
        ...v,
        value: v.value ? scrubText(v.value) : v.value,
        stacktrace: v.stacktrace
          ? {
              ...v.stacktrace,
              frames: v.stacktrace.frames?.map((f) => ({
                ...f,
                abs_path: f.abs_path ? scrubText(f.abs_path) : f.abs_path,
                filename: f.filename ? scrubText(f.filename) : f.filename,
                vars: undefined,
              })),
            }
          : v.stacktrace,
      })),
    };
  }
  return e;
}

export type BeforeSend = (event: ErrorEvent, hint: EventHint) => ErrorEvent | null;

export function makeBeforeSend(getConsent: () => boolean): BeforeSend {
  return (event) => scrubEvent(event, getConsent());
}

// ── Runtime wiring ────────────────────────────────────────────────────────

let started = false;

/**
 * Starts Sentry in the main process when the user opted in and the build has a DSN.
 * Safe to call again after consent is turned on; it only initialises once.
 * Returns whether reporting is active.
 */
export async function startCrashReporting(opts: { consent: () => boolean; dsn: string; release: string }): Promise<boolean> {
  if (started) return true;
  if (!opts.consent() || !opts.dsn) return false;
  const Sentry = await import('@sentry/electron/main');
  Sentry.init({
    dsn: opts.dsn,
    release: opts.release,
    // Collect nothing about the person or their traffic; only the error itself.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Drops events if consent is withdrawn later in the session.
    beforeSend: makeBeforeSend(opts.consent),
    beforeBreadcrumb: (b) => (b.category === 'console' || b.category === 'ui.input' ? null : { ...b, data: undefined }),
  });
  started = true;
  return true;
}

export function isCrashReportingActive(): boolean {
  return started;
}
