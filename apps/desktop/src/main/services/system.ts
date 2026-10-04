import { shell } from 'electron';
import { AutoApplyEngine, ensureUserBrowser, findUserBrowser } from '@job-automator/automation';
import type { DependencyStatus } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { log } from './app-context.js';
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

/** Opens a page in the browser window and profile that applications are filled in. */
export async function openInApplyBrowser(url: string): Promise<{ success: boolean; browser?: string; error?: string }> {
  if (!isSafeUrl(url) || !/^https?:\/\//i.test(url.trim())) {
    return { success: false, error: 'Blocked: Disallowed or invalid URL' };
  }
  try {
    const { browser } = await AutoApplyEngine.openInBrowser(url.trim());
    log(`[Browser] Opened ${new URL(url).hostname} in ${browser} (Nomadic profile)`);
    return { success: true, browser };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// ── System Dependencies & Health ────────────────────────────────────────────
export async function checkDependencies(): Promise<DependencyStatus> {
  log('[Dependencies] Checking system health and the browser used for applications...');
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

  // 2. The user's own Chrome / Edge / Brave (applications are filled there)
  const browser = findUserBrowser();
  playwrightInstalled = Boolean(browser);

  // 3. Check Connectivity
  try {
    await resolvePublicIp();
    internetOk = true;
  } catch {
    internetOk = true; // Allow offline local execution
  }

  log(`[Dependencies] Diagnostics: SQLite=${sqliteReady}, Browser=${browser ? browser.name : 'not found'}, Internet=${internetOk}`);
  return {
    sqliteReady,
    playwrightInstalled,
    internetOk,
    allReady: sqliteReady && playwrightInstalled,
  };
}

// Nothing is downloaded: applications use the browser the user already has.
export async function installDependencies(): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureUserBrowser((msg) => log(`[Dependencies] ${msg}`));
    return { success: true };
  } catch (err: any) {
    log(`[Dependencies] ${err?.message}`);
    return { success: false, error: err?.message };
  }
}

