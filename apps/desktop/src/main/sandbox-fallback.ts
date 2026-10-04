import fs from 'fs';
import path from 'path';

// On some Windows machines no sandboxed Chromium process can start: each one exits
// with STATUS_DLL_NOT_FOUND before it loads anything, so the window stays blank.
// When that happens we remember it for this app version, restart once without the
// sandbox, and try the sandbox again after the next update.

export const STATUS_DLL_NOT_FOUND = -1073741515;
const MARKER_FILE = 'sandbox-fallback.json';

export interface SandboxFallbackMarker {
  appVersion: string;
  recordedAt: string;
}

export function isSandboxStartupFailure(exitCode: number | undefined): boolean {
  return exitCode === STATUS_DLL_NOT_FOUND;
}

export function readSandboxFallback(userDataDir: string): SandboxFallbackMarker | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userDataDir, MARKER_FILE), 'utf8'));
    return raw && typeof raw.appVersion === 'string' ? raw : null;
  } catch {
    return null;
  }
}

export function writeSandboxFallback(userDataDir: string, appVersion: string, now = new Date()): void {
  try {
    const marker: SandboxFallbackMarker = { appVersion, recordedAt: now.toISOString() };
    fs.writeFileSync(path.join(userDataDir, MARKER_FILE), JSON.stringify(marker));
  } catch {
    // The relaunch still carries NOMADIC_DISABLE_SANDBOX; only the next cold start would retry.
  }
}

export function shouldRunWithoutSandbox(
  env: NodeJS.ProcessEnv,
  marker: SandboxFallbackMarker | null,
  appVersion: string,
): boolean {
  if (env.NOMADIC_DISABLE_SANDBOX === 'true') return true;
  return marker?.appVersion === appVersion;
}

export type RelaunchPlan =
  | { kind: 'electron'; options: { execPath?: string; args?: string[] } }
  | { kind: 'portable'; file: string; tempDir: string; env: NodeJS.ProcessEnv };

// The portable launcher extracts the app to %TEMP%\<fixed name>, empties that folder
// before extracting and deletes it after the app exits. Relaunching in place, or
// starting a second launcher with the same %TEMP%, makes the two launchers delete each
// other's files. So start the portable .exe again with TEMP/TMP pointing at a folder of
// its own (the launcher takes its extraction root from them).
export function planRelaunch(env: NodeJS.ProcessEnv, tempRoot: string): RelaunchPlan {
  const portableExe = env.PORTABLE_EXECUTABLE_FILE;
  if (!portableExe) return { kind: 'electron', options: {} };
  const tempDir = path.win32.join(tempRoot, 'NomadicRestart');
  return { kind: 'portable', file: portableExe, tempDir, env: { ...env, TEMP: tempDir, TMP: tempDir } };
}
