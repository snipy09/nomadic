import * as React from 'react';
import { TooltipProvider } from './components/Tooltip';
import { ToastProvider } from './components/Toast';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const media = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Resolve a preference to the theme that will actually show. */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref;
  return media()?.matches ? 'dark' : 'light';
}

/**
 * Apply a theme to an element (default <html>): sets `data-theme` and toggles the
 * `dark` class so existing `darkMode: 'class'` Tailwind screens follow along.
 * 'system' removes data-theme so styles.css falls back to prefers-color-scheme.
 */
export function applyTheme(pref: ThemePreference, root: HTMLElement = document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', pref === 'light');
  return resolved;
}

export interface UseThemeOptions {
  /** localStorage key to persist the preference. Pass null to disable. */
  storageKey?: string | null;
  defaultTheme?: ThemePreference;
}

function readStored(key: string | null | undefined): ThemePreference | null {
  if (!key) return null;
  try {
    const v = window.localStorage.getItem(key);
    return v === 'light' || v === 'dark' || v === 'system' ? v : null;
  } catch {
    return null;
  }
}

/** Theme preference state, applied to <html> and kept in sync with the OS when 'system'. */
export function useTheme({ storageKey = 'nomadic.theme', defaultTheme = 'system' }: UseThemeOptions = {}) {
  const [theme, setThemeState] = React.useState<ThemePreference>(() =>
    typeof window === 'undefined' ? defaultTheme : readStored(storageKey) ?? defaultTheme,
  );
  const [resolved, setResolved] = React.useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'light' : resolveTheme(theme),
  );

  React.useEffect(() => {
    setResolved(applyTheme(theme));
    if (theme !== 'system') return;
    const mq = media();
    if (!mq) return;
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next);
        } catch {
          /* storage unavailable: preference lasts for the session */
        }
      }
    },
    [storageKey],
  );

  return { theme, resolvedTheme: resolved, setTheme } as const;
}

export interface UIProviderProps {
  children: React.ReactNode;
  tooltipDelay?: number;
  toastDuration?: number;
}

/** Root provider: tooltips + toasts. Wrap the app once. */
export function UIProvider({ children, tooltipDelay, toastDuration }: UIProviderProps) {
  return (
    <TooltipProvider delayDuration={tooltipDelay}>
      <ToastProvider duration={toastDuration}>{children}</ToastProvider>
    </TooltipProvider>
  );
}
