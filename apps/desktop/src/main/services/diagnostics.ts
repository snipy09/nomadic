import fs from 'fs';
import os from 'os';
import { app, clipboard } from 'electron';
import { getDb, getLocalDbHealth, getLocalDbPath, type LocalDbHealth } from '../db.js';
import { listBackups } from '../local-db/safety.js';
import { getRecentLogLines } from './app-context.js';
import { session } from './session.js';

// ── "Copy diagnostics" (F10 / SAAS_PLAN B5) ────────────────────────────────
// Facts about this install for a support request. Never includes profile
// content, answers, resumes, API keys, tokens or email addresses: only
// versions, counts, database health and redacted recent log lines.

declare const __APP_VERSION__: string | undefined;

export interface DiagnosticsInfo {
  generatedAt: string;
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  os: string;
  locale: string;
  database: {
    health: LocalDbHealth | null;
    sizeBytes: number | null;
    backups: number;
    latestBackupAt: string | null;
    rowCounts: Record<string, number>;
  };
  signedIn: boolean;
  serverConfigured: boolean;
  recentLog: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const BEARER = /(bearer|apikey|api_key|token|ticket|key)(["':=\s]+)[^\s"',}]+/gi;
const USER_PATH = /([A-Za-z]:\\Users\\|\/home\/|\/Users\/)[^\\/\s]+/g;

/** Removes anything that identifies the user or could be used as a credential. */
export function redactLine(line: string): string {
  return line
    .replace(EMAIL, '<email>')
    .replace(BEARER, (_m, k: string, sep: string) => `${k}${sep}<redacted>`)
    .replace(UUID, '<id>')
    .replace(LONG_TOKEN, '<token>')
    .replace(USER_PATH, (_m, prefix: string) => `${prefix}<user>`);
}

export function formatDiagnostics(info: DiagnosticsInfo): string {
  const h = info.database.health;
  const lines = [
    'Nomadic diagnostics',
    `Generated: ${info.generatedAt}`,
    `App: ${info.appVersion}`,
    `Electron ${info.electron} / Chrome ${info.chrome} / Node ${info.node}`,
    `OS: ${info.os}`,
    `Locale: ${info.locale}`,
    `Signed in: ${info.signedIn ? 'yes' : 'no'}`,
    `Server configured: ${info.serverConfigured ? 'yes' : 'no'}`,
    '',
    'Local database',
    h
      ? `  Schema v${h.schemaVersion} of v${h.latestSchemaVersion}; startup: ${h.startup}; migration: ${h.migration}; integrity: ${h.integrity}`
      : '  Not initialised',
    ...(h?.migrationError ? [`  Migration error: ${redactLine(h.migrationError)}`] : []),
    `  Size: ${info.database.sizeBytes === null ? 'unknown' : `${info.database.sizeBytes} bytes`}`,
    `  Backups: ${info.database.backups}${info.database.latestBackupAt ? ` (latest ${info.database.latestBackupAt})` : ''}`,
    `  Rows: ${Object.entries(info.database.rowCounts).map(([t, n]) => `${t}=${n}`).join(', ') || 'none'}`,
    '',
    `Recent log (${info.recentLog.length} lines, redacted)`,
    ...info.recentLog.map((l) => `  ${redactLine(l)}`),
  ];
  return lines.join('\n');
}

// Tables whose row counts help support; counts only, never contents.
const COUNTED_TABLES = ['local_applications', 'application_status_history', 'saved_jobs', 'resumes', 'learner_progress', 'custom_roadmaps', 'cached_form_answers', 'user_activity_log'];

function rowCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const db = getDb();
    for (const t of COUNTED_TABLES) {
      try { out[t] = Number(db.exec(`SELECT COUNT(*) FROM ${t}`)[0]?.values[0]?.[0] ?? 0); } catch { /* table missing */ }
    }
  } catch { /* db not initialised */ }
  return out;
}

export function collectDiagnostics(): DiagnosticsInfo {
  const dbPath = getLocalDbPath();
  let sizeBytes: number | null = null;
  try { if (dbPath) sizeBytes = fs.statSync(dbPath).size; } catch { /* missing */ }
  const backups = dbPath ? listBackups(dbPath) : [];
  return {
    generatedAt: new Date().toISOString(),
    appVersion: (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
    os: `${os.platform()} ${os.release()} (${os.arch()})`,
    locale: app.getLocale(),
    database: {
      health: getLocalDbHealth(),
      sizeBytes,
      backups: backups.length,
      latestBackupAt: backups[0]?.createdAt ?? null,
      rowCounts: rowCounts(),
    },
    signedIn: Boolean(session.userId && session.sessionToken),
    serverConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    recentLog: getRecentLogLines().slice(-80),
  };
}

/** Business logic behind `copy-diagnostics`: writes the report to the clipboard and returns it for display. */
export function copyDiagnostics(): { success: boolean; text?: string; error?: string } {
  try {
    const text = formatDiagnostics(collectDiagnostics());
    clipboard.writeText(text);
    return { success: true, text };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Local data health for the Settings screen. */
export function getDataHealth(): {
  success: boolean;
  health: LocalDbHealth | null;
  backups: number;
  latestBackupAt: string | null;
  sizeBytes: number | null;
} {
  const info = collectDiagnostics();
  return {
    success: true,
    health: info.database.health,
    backups: info.database.backups,
    latestBackupAt: info.database.latestBackupAt,
    sizeBytes: info.database.sizeBytes,
  };
}
