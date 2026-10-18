/**
 * Android entry: start the in-WebView host (local database, device id, the shared app-core IPC handlers and
 * preload, which sets `window.api`), then the shared UI (packages/app-ui) with VITE_PLATFORM=android.
 */
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import './touch.css';

declare const __APP_VERSION__: string;

// A few reused modules read `process` (env values are replaced at build time).
(globalThis as unknown as { process?: unknown }).process ??= { env: {}, platform: 'android', versions: {}, cwd: () => '/' };

async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Browser.open({ url, presentationStyle: 'popover' });
  else window.open(url, '_blank', 'noopener');
}

async function start() {
  const { bootHost } = await import('./host/boot');
  await bootHost({ version: __APP_VERSION__, openExternal });
  if (Capacitor.isNativePlatform()) {
    // Android back: close the top dialog or go back in the app's own history; at the root, leave the app.
    CapApp.addListener('backButton', ({ canGoBack }) => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      const handled = !document.dispatchEvent(esc);
      if (handled) return;
      if (canGoBack) window.history.back();
      else void CapApp.minimizeApp();
    });
  }
  const { mountApp } = await import('@nomadic/app-ui/mount');
  mountApp();
  // CI's emulator smoke test looks for this line in logcat.
  console.info('[Nomadic] host ready');
}

start().catch((err) => {
  console.error('[Nomadic] start failed', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="font-family:system-ui;padding:24px"><h1 style="font-size:20px;font-weight:700">Nomadic could not start</h1>' +
      '<p style="color:#6e6e73">Close the app and open it again. If this keeps happening, reinstall it; your account data is safe on the server.</p></div>';
  }
});
