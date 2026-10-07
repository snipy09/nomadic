import https from 'https';
import { sendSessionHeartbeat } from '@job-automator/supabase';
import { log, sendToRenderer } from './app-context.js';
import { getAnonSupabase } from './supabase.js';

/**
 * Active online session (single-laptop lock). Mutated by the auth flows and
 * read by every cloud-sync helper.
 */
export const session: {
  userId: string | null;
  sessionToken: string | null;
  deviceFingerprint: string | null;
  deviceName: string | null;
} = {
  userId: null,
  sessionToken: null,
  deviceFingerprint: null,
  deviceName: null,
};

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/** True when cloud sync calls may be made for the active session. */
export function getActiveSyncSession(): { userId: string; sessionToken: string; deviceFingerprint: string } | null {
  if (session.userId && session.sessionToken && session.deviceFingerprint) {
    return {
      userId: session.userId,
      sessionToken: session.sessionToken,
      deviceFingerprint: session.deviceFingerprint,
    };
  }
  return null;
}

export function resolvePublicIp(): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=text', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

export function startHeartbeatLoop(userId: string, sessionToken: string, deviceFingerprint: string): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  session.userId = userId;
  session.sessionToken = sessionToken;
  session.deviceFingerprint = deviceFingerprint;

  log('[Heartbeat] Starting 45-second Single-Laptop session heartbeat...');

  const beat = async () => {
    try {
      const clientIp = await resolvePublicIp().catch(() => '127.0.0.1');
      const supabase = getAnonSupabase();
      if (!supabase) {
        log('[Heartbeat] Supabase not configured — skipping single-device check.');
        return;
      }
      const result = await sendSessionHeartbeat(
        supabase,
        userId,
        sessionToken,
        clientIp,
        deviceFingerprint
      );

      sendToRenderer('heartbeat-status', {
        valid: result.valid,
        reason: result.reason,
        ip: clientIp,
        ended: Boolean(result.ended),
      });

      // A network error is not a server verdict: keep the session and try again next beat.
      if (!result.valid && result.ended) {
        log(`[Heartbeat] Session terminated: ${result.reason}. Single-device lock enforcement.`);
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        session.sessionToken = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[Heartbeat] Note: ${msg}`);
      sendToRenderer('heartbeat-status', { valid: false, reason: msg });
    }
  };

  beat();
  heartbeatInterval = setInterval(beat, 45_000);
}

/** Stops the heartbeat timer. Returns true when a loop was running. */
export function clearHeartbeat(): boolean {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    return true;
  }
  return false;
}

export function stopHeartbeat(): void {
  if (clearHeartbeat()) {
    log('[Heartbeat] Stopped.');
  }
  session.sessionToken = null;
}
