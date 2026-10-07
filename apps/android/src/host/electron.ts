/**
 * The parts of Electron the desktop's main-process code uses, implemented inside the Android WebView.
 * The desktop IPC handlers (packages/app-core/src/main/ipc) register on `ipcMain` here and the desktop preload
 * calls `ipcRenderer.invoke`: both ends live in one JS context, so a call is a direct function call that
 * still goes through the same zod validation in `ipc/handle.ts`.
 */

type Listener = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, Listener>();
const subscribers = new Map<string, Set<Listener>>();

/** Channels the APK does not offer (apply, outreach, practice, projects, ...) answer with this. */
export const DESKTOP_ONLY_ERROR = 'This works in the Nomadic desktop app. Open it on your computer to continue.';

let externalOpener: (url: string) => Promise<void> = async (url) => {
  window.open(url, '_blank', 'noopener');
};

export function setExternalOpener(fn: (url: string) => Promise<void>): void {
  externalOpener = fn;
}

export function registeredChannels(): string[] {
  return [...handlers.keys()];
}

const fakeEvent = { sender: { id: 1 }, senderFrame: { url: 'https://localhost/' } };

export const ipcMain = {
  handle(channel: string, listener: Listener): void {
    handlers.set(channel, listener);
  },
  removeHandler(channel: string): void {
    handlers.delete(channel);
  },
  on(): void {
    /* no main-side listeners are used by the APK */
  },
};

export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const h = handlers.get(channel);
    if (!h) return { success: false, ok: false, code: 'desktop_only', error: DESKTOP_ONLY_ERROR };
    return h(fakeEvent, ...args);
  },
  on(event: string, listener: Listener): void {
    if (!subscribers.has(event)) subscribers.set(event, new Set());
    subscribers.get(event)!.add(listener);
  },
  removeListener(event: string, listener: Listener): void {
    subscribers.get(event)?.delete(listener);
  },
  send(): void {
    /* unused */
  },
};

/** main -> renderer push (`webContents.send`). */
export function emitToRenderer(event: string, payload: unknown): void {
  for (const l of subscribers.get(event) ?? []) {
    try {
      l({}, payload);
    } catch (err) {
      console.error(`[host] listener for ${event} failed`, err);
    }
  }
}

export const contextBridge = {
  exposeInMainWorld(key: string, value: unknown): void {
    (window as unknown as Record<string, unknown>)[key] = value;
  },
};

/** Stands in for the main BrowserWindow so `sendToRenderer` reaches the renderer. */
export const hostWindow = {
  isDestroyed: () => false,
  isMinimized: () => false,
  restore: () => undefined,
  focus: () => undefined,
  webContents: { isDestroyed: () => false, send: emitToRenderer },
};

export class BrowserWindow {
  static getAllWindows() {
    return [hostWindow];
  }
}

let version = '0.0.0';
export function setAppVersion(v: string): void {
  version = v;
}

export const app = {
  getVersion: () => version,
  getPath: (_name: string) => '/nomadic',
  getLocale: () => navigator.language || 'en-IN',
  isPackaged: true,
  getName: () => 'Nomadic',
};

export const shell = {
  async openExternal(url: string): Promise<void> {
    await externalOpener(url);
  },
  async openPath(): Promise<string> {
    return DESKTOP_ONLY_ERROR;
  },
};

export const dialog = {
  async showOpenDialog() {
    return { canceled: true, filePaths: [] as string[] };
  },
  async showSaveDialog() {
    return { canceled: true, filePath: undefined as string | undefined };
  },
  async showMessageBox() {
    return { response: 0 };
  },
};

export const clipboard = {
  writeText(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  },
};

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s: string) => s,
  decryptString: (s: string) => s,
};

export const nativeTheme = { shouldUseDarkColors: false, on: () => undefined };
export const session = { defaultSession: {} };

export default { ipcMain, ipcRenderer, contextBridge, app, shell, dialog, clipboard, safeStorage, nativeTheme, BrowserWindow, session };
