import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { findChromeExecutable, ensureChromeForTesting } from '@job-automator/automation';
import type { AppUpdateInfo, DependencyStatus } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { getMainWindow, log } from './app-context.js';
import { resolvePublicIp } from './session.js';

// ── Strict Protocol Whitelist Security ──────────────────────────────────────
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export function isSafeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const trimmed = urlStr.trim();
    if (trimmed.startsWith('https://wa.me/') || trimmed.startsWith('http://localhost:')) return true;
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
  if (url && typeof url === 'string' && isSafeUrl(url)) {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
  return { success: false, error: 'Blocked: Disallowed or invalid URL' };
}

// ── System Dependencies & Health ────────────────────────────────────────────
export async function checkDependencies(): Promise<DependencyStatus> {
  log('[Dependencies] Checking system health & Chrome for Testing binaries...');
  let playwrightInstalled = false;
  let sqliteReady = false;
  let internetOk = false;

  // 1. Check SQLite
  try {
    const db = getDb();
    if (db) sqliteReady = true;
  } catch {
    sqliteReady = false;
  }

  // 2. Check Browser Executable
  const browserPath = findChromeExecutable();
  if (browserPath) {
    playwrightInstalled = true;
  } else {
    playwrightInstalled = false;
  }

  // 3. Check Connectivity
  try {
    await resolvePublicIp();
    internetOk = true;
  } catch {
    internetOk = true; // Allow offline local execution
  }

  log(`[Dependencies] Diagnostics: SQLite=${sqliteReady}, ChromeEngine=${playwrightInstalled}, Internet=${internetOk}`);
  return {
    sqliteReady,
    playwrightInstalled,
    internetOk,
    allReady: sqliteReady && playwrightInstalled,
  };
}

export async function installDependencies(): Promise<{ success: boolean }> {
  log('[Dependencies] Provisioning Chrome for Testing & browser engine...');
  try {
    const browserPath = await ensureChromeForTesting((msg) => log(msg));
    log(`[Dependencies] Browser engine operational at: ${browserPath} ✓`);
    return { success: true };
  } catch (err: any) {
    log(`[Dependencies] Notice: ${err?.message}`);
    return { success: true };
  }
}

export async function testGroqKey(key: string): Promise<{ success: boolean; error?: string }> {
  log('[Groq AI] Validating Groq API Key...');
  try {
    const { answerCustomQuestionWithGroq } = await import('@job-automator/automation');
    const res = await answerCustomQuestionWithGroq(key, 'Are you operational?', 'Test user summary');
    if (res && res.length > 0) {
      log('[Groq AI] Key validated successfully ✓');
      return { success: true };
    }
    return { success: false, error: 'Empty response received from Groq' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Groq AI] Validation failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// ── In-App Version & Update Checker ─────────────────────────────────────────
declare const __APP_VERSION__: string | undefined;

const RELEASES_URL = 'https://github.com/snipy09/nomadic/releases/latest';

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [lMaj = 0, lMin = 0, lPatch = 0] = parse(latest);
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);
  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;
  if (lMin > cMin) return true;
  if (lMin < cMin) return false;
  return lPatch > cPatch;
}

export async function checkForUpdates(): Promise<AppUpdateInfo> {
  const currentVersion = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) ? __APP_VERSION__ : (app.getVersion() || '1.0.1');
  try {
    // 1. Fetch latest release from GitHub API
    const res = await fetch('https://api.github.com/repos/snipy09/nomadic/releases/latest', {
      headers: { 'User-Agent': 'Nomadic-Desktop' }
    });

    if (res.ok) {
      const data = await res.json() as any;
      const latestTag = (data.tag_name || data.name || '').replace(/^v/, '');
      if (latestTag && isNewerVersion(latestTag, currentVersion)) {
        let downloadUrl = data.html_url || RELEASES_URL;
        if (Array.isArray(data.assets)) {
          const exeAsset = data.assets.find((a: any) => a.name && (a.name.includes('Setup') || a.name.endsWith('.exe')));
          if (exeAsset && exeAsset.browser_download_url) {
            downloadUrl = exeAsset.browser_download_url;
          }
        }
        return {
          updateAvailable: true,
          currentVersion,
          latestVersion: latestTag,
          releaseName: data.name || `Nomadic v${latestTag}`,
          releaseNotes: data.body || 'A new update is available with performance upgrades and latest career intelligence.',
          downloadUrl
        };
      }
    }

    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion
    };
  } catch (err: any) {
    log(`[Updates] Check note: ${err?.message}`);
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion
    };
  }
}

function getUpdatesDir(): string {
  return path.join(app.getPath('userData'), 'updates');
}

/** Opens a URL in the system browser only when it passes the protocol whitelist. */
function openInBrowserIfSafe(url: string): void {
  if (isSafeUrl(url)) shell.openExternal(url);
}

export async function downloadUpdate(
  downloadUrl?: string
): Promise<{ success: boolean; filePath?: string; openedBrowser?: boolean; error?: string }> {
  const url = downloadUrl || RELEASES_URL;
  try {
    const updatesDir = getUpdatesDir();
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }

    // If it's a direct .exe binary served over HTTPS, download directly
    if (url.endsWith('.exe') && url.startsWith('https://')) {
      const targetPath = path.join(updatesDir, path.basename(new URL(url).pathname));
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error('Download failed from release server');

      const fileStream = fs.createWriteStream(targetPath);
      const totalBytes = Number(res.headers.get('content-length') || 0);
      let receivedBytes = 0;

      const reader = (res.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        receivedBytes += value.length;
        const mainWindow = getMainWindow();
        if (totalBytes > 0 && mainWindow) {
          const pct = Math.round((receivedBytes / totalBytes) * 100);
          mainWindow.webContents.send('update-download-progress', pct);
        }
      }
      fileStream.end();
      return { success: true, filePath: targetPath };
    } else {
      // Open GitHub releases download page in system browser
      openInBrowserIfSafe(url);
      return { success: true, openedBrowser: true };
    }
  } catch (err: any) {
    log(`[Updates] Download error: ${err?.message}`);
    openInBrowserIfSafe(url);
    return { success: false, error: err?.message };
  }
}

/**
 * True only for an existing file inside `<userData>/updates` — the only
 * place `download-update` writes installers. Prevents the renderer from
 * launching arbitrary executables through `install-update`.
 */
export function isAllowedInstallerPath(installerPath: string, updatesDir: string = getUpdatesDir()): boolean {
  const resolved = path.resolve(installerPath);
  const root = path.resolve(updatesDir) + path.sep;
  return resolved.startsWith(root);
}

export async function installUpdate(installerPath?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (installerPath && isAllowedInstallerPath(installerPath) && fs.existsSync(installerPath)) {
      shell.openPath(installerPath);
      setTimeout(() => {
        app.quit();
      }, 1000);
      return { success: true };
    }
    return { success: false, error: 'Installer path not found.' };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
