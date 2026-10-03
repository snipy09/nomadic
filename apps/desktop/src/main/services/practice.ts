import { attemptToEvent, attemptsFromEvents, type LearningEventInput, type PracticeAttempt } from '@job-automator/learning';
import type {
  PracticeCatalogResult,
  PracticeRecordResult,
  PracticeStateResult,
} from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { loadPracticeCatalog } from './practice-catalog.js';
import { listAttempts, saveAttempt } from './practice-store.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

/**
 * Practice area (F8). Attempts are recorded through the migration 007 RPC
 * `learning_record_events`, which enforces the free-tier daily limit on the
 * server (over-limit attempts are rejected, not stored). Only accepted
 * attempts are cached locally. Nothing is recorded while signed out.
 */

const PRACTICE_TYPES = new Set(['quiz_passed', 'quiz_failed', 'problem_solved', 'review_done']);

export interface PulledEvent extends LearningEventInput {
  received_at?: string | null;
}

/** Start of the current UTC day, the window the server counts the daily limit in. */
export function utcDayStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Practice attempts (any source) the server received today, as the limit check counts them. */
export function countPracticeToday(counted: Map<string, string>, now: Date): number {
  const start = Date.parse(utcDayStart(now));
  let n = 0;
  for (const at of counted.values()) if (Date.parse(at) >= start) n++;
  return n;
}

type RecordRow = { accepted?: number | null; rejected?: number | null; error?: string | null };

/** Maps the `learning_record_events` reply for a single event to an outcome. */
export function interpretRecordReply(data: unknown): 'accepted' | 'daily_limit' | 'unauthorized' | 'unknown' {
  const row = (Array.isArray(data) ? data[0] : data) as RecordRow | null | undefined;
  if (!row) return 'unknown';
  if (row.error === 'unauthorized') return 'unauthorized';
  if (row.error) return 'unknown';
  if (Number(row.accepted) > 0) return 'accepted';
  if (Number(row.rejected) > 0) return 'daily_limit';
  return 'unknown';
}

// Per-run view of the server log: practice events already counted (id -> received_at).
const server = { userId: null as string | null, since: null as string | null, pulled: false, counted: new Map<string, string>() };

function resetFor(userId: string): void {
  if (server.userId === userId) return;
  server.userId = userId;
  server.since = null;
  server.pulled = false;
  server.counted = new Map();
}

function trackEvents(rows: PulledEvent[]): void {
  for (const e of rows) {
    const at = e.received_at || e.created_at;
    if (at && (!server.since || at > server.since)) server.since = at;
    if (e.item_id && PRACTICE_TYPES.has(e.type) && at) server.counted.set(e.id, at);
  }
}

export async function getPracticeCatalog(): Promise<PracticeCatalogResult> {
  try {
    return { success: true, catalog: await loadPracticeCatalog() };
  } catch (err) {
    log(`[Practice] Catalog not loaded: ${errorMessage(err)}`);
    return { success: false, error: errorMessage(err) };
  }
}

export async function getPracticeState(): Promise<PracticeStateResult> {
  const active = getActiveSyncSession();
  if (!active) return { success: true, state: { attempts: [], usedToday: null, signedIn: false } };
  try {
    resetFor(active.userId);
    const db = getDb();
    let syncError: string | undefined;
    const supabase = getAnonSupabase();
    if (!supabase) {
      syncError = 'Cloud sync is not configured on this install.';
    } else {
      const { data, error } = await supabase.rpc('learning_pull_events', {
        p_user_id: active.userId,
        p_session_token: active.sessionToken,
        p_device_fingerprint: active.deviceFingerprint,
        p_since: server.since ?? '1970-01-01T00:00:00Z',
      });
      if (error) {
        syncError = error.message || 'Could not reach the server.';
      } else {
        const rows = (Array.isArray(data) ? data : []) as PulledEvent[];
        trackEvents(rows);
        server.pulled = true;
        let added = 0;
        for (const a of attemptsFromEvents(rows)) if (saveAttempt(db, active.userId, a)) added++;
        if (added) persistDb();
      }
    }
    if (syncError) log(`[Practice] Server log not pulled: ${syncError}`);
    return {
      success: true,
      state: {
        attempts: listAttempts(db, active.userId),
        usedToday: syncError ? null : countPracticeToday(server.counted, new Date()),
        signedIn: true,
        ...(syncError ? { syncError } : {}),
      },
    };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export async function recordPracticeAttempt(attempt: PracticeAttempt): Promise<PracticeRecordResult> {
  const active = getActiveSyncSession();
  if (!active) return { success: false, code: 'not_signed_in', error: 'Sign in to save practice attempts.' };
  const supabase = getAnonSupabase();
  if (!supabase) return { success: false, code: 'network', error: 'Cloud sync is not configured on this install.' };
  resetFor(active.userId);
  try {
    const { data, error } = await supabase.rpc('learning_record_events', {
      p_user_id: active.userId,
      p_session_token: active.sessionToken,
      p_device_fingerprint: active.deviceFingerprint,
      p_events: [attemptToEvent(attempt, active.userId)],
    });
    if (error) return { success: false, code: 'network', error: error.message || 'Could not reach the server.' };
    switch (interpretRecordReply(data)) {
      case 'accepted': {
        if (saveAttempt(getDb(), active.userId, attempt)) persistDb();
        server.counted.set(attempt.id, new Date().toISOString());
        return { success: true, attempt, usedToday: server.pulled ? countPracticeToday(server.counted, new Date()) : null };
      }
      case 'daily_limit':
        return { success: false, code: 'daily_limit', error: 'You have used today’s free practice attempts. They reset at 05:30 IST.' };
      case 'unauthorized':
        return { success: false, code: 'unauthorized', error: 'Your session has ended. Sign in again to save attempts.' };
      default:
        return { success: false, code: 'network', error: 'The server did not confirm the attempt. Try again.' };
    }
  } catch (err) {
    return { success: false, code: 'network', error: errorMessage(err) };
  }
}
