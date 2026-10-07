import { getApi } from '../../types';

/**
 * Starts the renderer Sentry SDK only when the user opted in and the main process
 * is reporting. The renderer SDK sends nothing itself; it forwards to the main
 * process, which scrubs every event (main/services/telemetry.ts).
 */
export async function startRendererCrashReporting(): Promise<boolean> {
  try {
    const state = await getApi().getTelemetry?.();
    if (!state?.crashReports || !state.active) return false;
    const Sentry = await import('@sentry/electron/renderer');
    Sentry.init({});
    return true;
  } catch {
    return false;
  }
}
