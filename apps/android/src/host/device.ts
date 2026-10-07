import { createHash } from './node/crypto';
import { idbGet, idbSet } from './idb';

/**
 * This phone's identity for the device session (replaces packages/app-core/src/main/device.ts in the APK).
 * The fingerprint starts with "mobile-" so the server counts it in the phone slot (migration 032):
 * an account can be active on one computer and one phone at the same time.
 */

let deviceId: string | null = null;

export async function loadDeviceId(): Promise<void> {
  const saved = await idbGet('device.id').catch(() => null);
  if (typeof saved === 'string' && saved) {
    deviceId = saved;
    return;
  }
  deviceId = globalThis.crypto.randomUUID();
  await idbSet('device.id', deviceId);
}

/** "Pixel 7 (Android 14)" from the WebView user agent; "Android phone" when it does not say. */
export function phoneName(userAgent: string): string {
  const m = userAgent.match(/Android\s+([\d.]+);\s*([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/);
  if (!m) return 'Android phone';
  const model = m[2].trim();
  return model && model !== 'K' ? `${model} (Android ${m[1]})` : `Android ${m[1]} phone`;
}

export function getDeviceIdentifier(_userDataPath?: string): { deviceFingerprint: string; deviceName: string } {
  if (!deviceId) throw new Error('Device id not loaded');
  return {
    deviceFingerprint: `mobile-${createHash('sha256').update(deviceId).digest('hex')}`,
    deviceName: phoneName(navigator.userAgent),
  };
}
