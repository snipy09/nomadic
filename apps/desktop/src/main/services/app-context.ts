import type { BrowserWindow } from 'electron';
import type { EventName, IpcEvents } from '../../shared/ipc.js';

/**
 * Process-wide handle on the main window plus the logger that mirrors main
 * process logs into the renderer's log console.
 */
let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

/** Typed `webContents.send` for main -> renderer push events. */
export function sendToRenderer<E extends EventName>(event: E, payload: IpcEvents[E]): void {
  mainWindow?.webContents.send(event, payload);
}

export function log(msg: string): void {
  const stamped = `[${new Date().toISOString()}] ${msg}`;
  console.log(stamped);
  sendToRenderer('log', stamped);
}

/** Brings the main window to the front (used after OAuth callbacks). */
export function focusMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
