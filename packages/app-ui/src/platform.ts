/**
 * Which app this shared UI runs in, set at build time by each app's Vite config (VITE_PLATFORM):
 * apps/desktop = 'windows', apps/mac = 'mac', apps/android = 'android'.
 *
 * The Android app has no apply engine, outreach, practice or projects, so those screens are hidden and job actions
 * say "Auto apply from desktop" (the job is saved to the account for the desktop). Prefer a capability below over
 * checking the platform name, and keep platform-only screens in the app's own folder.
 */
export type PlatformId = 'windows' | 'mac' | 'android';

const raw = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PLATFORM ?? '').toLowerCase();

/** Unknown or unset (tests, the browser preview) counts as Windows, the first desktop platform. */
export const PLATFORM: PlatformId = raw === 'android' || raw === 'mac' ? raw : 'windows';

export const IS_MOBILE = PLATFORM === 'android';
export const IS_MAC = PLATFORM === 'mac';
export const IS_DESKTOP = !IS_MOBILE;

/** Label of the phone's apply action. */
export const DESKTOP_APPLY_LABEL = 'Auto apply from desktop';

/** Tabs the Android app does not have. */
export const MOBILE_HIDDEN_TABS: ReadonlySet<string> = new Set([
  'learner-interview-prep',
  /** Home is the News page on the phone. */
  'news',
  'learner-projects',
  'learner-resources',
  'outreach',
  'opportunities',
  'nav-outreach',
  'nav-resources',
]);
