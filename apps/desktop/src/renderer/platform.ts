/**
 * Which app this renderer runs in. The Android app (apps/mobile) builds the same renderer with
 * VITE_PLATFORM=android: it has no apply engine, outreach, practice or projects, so those screens are
 * hidden and job actions say "Auto apply from desktop" (the job is saved to the account for the desktop).
 */
export const IS_MOBILE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PLATFORM ?? '') === 'android';

/** Label of the phone's apply action. */
export const DESKTOP_APPLY_LABEL = 'Auto apply from desktop';

/** Tabs the Android app does not have. */
export const MOBILE_HIDDEN_TABS: ReadonlySet<string> = new Set([
  'learner-interview-prep',
  'learner-projects',
  'learner-resources',
  'outreach',
  'opportunities',
  'nav-outreach',
  'nav-resources',
]);
