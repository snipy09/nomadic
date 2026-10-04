import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import type { AccountExportResult, DeleteAccountInput, SuccessResult } from '../../shared/ipc.js';
import { getDb, wipeLocalData } from '../db.js';
import { getMainWindow, log } from './app-context.js';
import { session, stopHeartbeat } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { readLoginTicket } from './auth.js';

// ── Account data export and deletion (F10, migration 022) ────────────────

declare const __APP_VERSION__: string | undefined;

// Local tables in the export, and the columns never written to it (credentials and keys).
const EXPORTED_TABLES = [
  'master_profile', 'resumes', 'local_applications', 'application_status_history', 'saved_jobs',
  'learner_progress', 'custom_roadmaps', 'cached_form_answers', 'user_activity_log', 'outreach_contacts',
  'learning_events', 'learn_state',
] as const;
const SECRET_COLUMNS = new Set(['groq_api_key', 'gemini_api_key', 'smtp_password', 'password_hash']);

/** Rows of the exported local tables as plain objects, without secret columns. */
export function collectLocalExport(): Record<string, Array<Record<string, unknown>>> {
  const db = getDb();
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of EXPORTED_TABLES) {
    try {
      const res = db.exec(`SELECT * FROM ${table}`);
      const cols = res[0]?.columns ?? [];
      out[table] = (res[0]?.values ?? []).map((row) =>
        Object.fromEntries(cols.map((c, i) => [c, row[i]]).filter(([c]) => !SECRET_COLUMNS.has(String(c))))
      );
    } catch {
      out[table] = [];
    }
  }
  return out;
}

async function fetchServerExport(): Promise<{ data: unknown } | { error: string }> {
  const supabase = getAnonSupabase();
  if (!supabase) return { error: 'The server is not configured in this build.' };
  if (!session.userId || !session.sessionToken || !session.deviceFingerprint) return { error: 'Not signed in online.' };
  try {
    const { data, error } = await supabase.rpc('account_export_data', {
      p_user_id: session.userId,
      p_session_token: session.sessionToken,
      p_device_fingerprint: session.deviceFingerprint,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string; data?: unknown } | undefined;
    if (!row?.ok) return { error: row?.error || 'The server refused the export.' };
    return { data: row.data };
  } catch (err: unknown) {
    return { error: `Could not reach the server (${err instanceof Error ? err.message : String(err)}).` };
  }
}

export function exportFileName(now = new Date()): string {
  return `nomadic-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Business logic behind `export-account-data`: asks where to save, then writes one JSON file. */
export async function exportAccountData(): Promise<AccountExportResult> {
  const win = getMainWindow();
  const options = {
    title: 'Export your Nomadic data',
    defaultPath: path.join(app.getPath('downloads'), exportFileName()),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (choice.canceled || !choice.filePath) return { success: false, canceled: true };

  const server = await fetchServerExport();
  const doc = {
    format: 'nomadic-account-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || app.getVersion(),
    // Never invented: when the server copy is missing the file says so and why.
    server: 'data' in server ? server.data : null,
    serverError: 'error' in server ? server.error : undefined,
    local: collectLocalExport(),
    excluded: 'Passwords, API keys, SMTP passwords, session tokens and payment-gateway payloads are never exported.',
  };
  try {
    fs.writeFileSync(choice.filePath, JSON.stringify(doc, null, 2), 'utf8');
  } catch (err: unknown) {
    return { success: false, error: `Could not write the file: ${err instanceof Error ? err.message : String(err)}` };
  }
  log(`[Account] Data exported${'error' in server ? ' (local only)' : ''}.`);
  return { success: true, filePath: choice.filePath, serverIncluded: 'data' in server };
}

/**
 * Business logic behind `delete-account`. Re-authenticates with the password
 * (fresh single-use ticket), deletes the account on the server, then removes
 * every local copy and ends the session. Nothing local is touched unless the
 * server confirms the deletion.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<SuccessResult> {
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, error: 'Deleting an account needs the server, which is not configured.' };
  const s = { userId: session.userId, sessionToken: session.sessionToken, deviceFingerprint: session.deviceFingerprint };
  if (!s.userId || !s.sessionToken || !s.deviceFingerprint) {
    return { success: false, error: 'Sign in online to delete your account.' };
  }
  const email = input.confirmEmail.trim().toLowerCase();

  try {
    const auth = await supabase.rpc('authenticate_user', { p_email: email, p_password: input.password });
    if (auth.error) throw auth.error;
    const row = (Array.isArray(auth.data) ? auth.data[0] : auth.data) as Record<string, unknown> | undefined;
    if (!row?.['ok']) return { success: false, error: String(row?.['reason'] || 'Incorrect email or password.') };
    if (String(row['id']) !== s.userId) return { success: false, error: 'Type the email of the account you are signed in with.' };

    const del = await supabase.rpc('account_delete', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_login_ticket: readLoginTicket(row) ?? null,
      p_confirm_email: email,
    });
    if (del.error) throw del.error;
    const out = (Array.isArray(del.data) ? del.data[0] : del.data) as { ok?: boolean; reason?: string } | undefined;
    if (!out?.ok) return { success: false, error: out?.reason || 'The server did not delete the account.' };
  } catch (err: unknown) {
    log(`[Account] Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: 'Could not reach the server. Nothing was deleted. Try again.' };
  }

  stopHeartbeat();
  session.userId = null;
  session.sessionToken = null;
  session.deviceFingerprint = null;
  try {
    await wipeLocalData();
  } catch (err: unknown) {
    log(`[Account] Local wipe note: ${err instanceof Error ? err.message : String(err)}`);
    return { success: true, error: 'Your account was deleted, but some local files could not be removed. Uninstall Nomadic to remove them.' };
  }
  log('[Account] Account deleted on the server and all local data removed.');
  return { success: true };
}
