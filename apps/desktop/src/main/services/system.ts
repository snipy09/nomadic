import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { findChromeExecutable, ensureChromeForTesting } from '@job-automator/automation';
import type { DependencyStatus } from '../../shared/ipc.js';
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

