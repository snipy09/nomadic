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

const RECENT_LOG_LINES = 200;
const recentLog: string[] = [];

export function log(msg: string): void {
  const stamped = `[${new Date().toISOString()}] ${msg}`;
  console.log(stamped);
  recentLog.push(stamped);
  if (recentLog.length > RECENT_LOG_LINES) recentLog.shift();
  sendToRenderer('log', stamped);
}

/** The last log lines of this run, oldest first (for diagnostics; redact before sharing). */
export function getRecentLogLines(): string[] {
  return [...recentLog];
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
