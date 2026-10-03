import { handle } from './handle.js';
import { feedbackArgs, openExternalUrlArgs, telemetrySetArgs, updateChannelArgs } from './schemas.js';
import { openExternalUrl } from '../services/system.js';
import { updates } from '../services/updates-runtime.js';
import { dismissWhatsNew, getWhatsNew } from '../services/whats-new.js';
import { getTelemetryState, setTelemetry } from '../services/telemetry-runtime.js';
import { sendFeedback } from '../services/feedback.js';

/** External links, updates, what's new, crash-report consent and feedback. */
export function registerSystemIpc(): void {
  handle('open-external-url', openExternalUrlArgs, (url) => openExternalUrl(url));
  handle('updater-get-status', () => updates.status());
  handle('updater-check', () => updates.check());
  handle('updater-download', () => updates.download());
  handle('updater-install', () => updates.install());
  handle('updater-set-channel', updateChannelArgs, (channel) => updates.setChannel(channel));
  handle('get-update-policy', () => updates.policy());
  handle('whats-new-get', () => getWhatsNew());
  handle('whats-new-dismiss', () => {
    dismissWhatsNew();
    return { success: true };
  });
  handle('telemetry-get', () => getTelemetryState());
  handle('telemetry-set', telemetrySetArgs, (enabled) => setTelemetry(enabled));
  handle('send-feedback', feedbackArgs, (input) => sendFeedback(input));
}
