import { app, Menu } from 'electron';
import { startDesktopApp } from '@nomadic/app-core/main/app';
import { macMenuTemplate } from './menu.js';

/**
 * Nomadic for macOS: the shared desktop app (packages/app-core) with the macOS conventions.
 *
 * - The Chromium sandbox is on and the GPU is used (the Windows-only GPU workarounds and sandbox fallback live in
 *   apps/desktop).
 * - The app keeps running with no window open; clicking the Dock icon opens a new one (handled in the shared app).
 * - A standard macOS menu, so Cmd+C / Cmd+V / Cmd+Q and the Window menu work as Mac users expect.
 */
function configureChromium(): void {
  app.enableSandbox();
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
}

startDesktopApp({
  id: 'mac',
  configureChromium,
  keepRunningWithoutWindows: true,
  onReady: () => Menu.setApplicationMenu(Menu.buildFromTemplate(macMenuTemplate('Nomadic'))),
});
