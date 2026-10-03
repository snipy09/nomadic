import type { TelemetryState } from '../../shared/ipc.js';
import { getAppSettings, updateAppSettings } from './app-settings.js';
import { isCrashReportingActive, startCrashReporting } from './telemetry.js';
import { currentAppVersion } from './updates-runtime.js';
import { log } from './app-context.js';

// Injected at build time from SENTRY_DSN (build-main.mjs). Empty means reporting is unavailable.
const SENTRY_DSN = process.env.SENTRY_DSN || '';

export function getTelemetryState(): TelemetryState {
  return { crashReports: getAppSettings().crashReports, available: Boolean(SENTRY_DSN), active: isCrashReportingActive() };
}

/** Called before the app is ready; starts reporting only with consent. */
export function initCrashReporting(): Promise<boolean> {
  return startCrashReporting({ consent: () => getAppSettings().crashReports, dsn: SENTRY_DSN, release: `nomadic@${currentAppVersion()}` });
}

export async function setTelemetry(enabled: boolean): Promise<TelemetryState> {
  updateAppSettings({ crashReports: enabled });
  if (enabled) await initCrashReporting();
  log(`[Telemetry] Crash reports ${enabled ? 'on' : 'off'}.`);
  return getTelemetryState();
}
