import {
  learningArchiveTrack,
  learningGetTracks,
  learningPullEvents,
  learningRecordEvents,
  learningStartTrack,
} from '@job-automator/supabase';
import { LearningEventSchema, RoleFamilyIdSchema } from '@job-automator/learning';
import type {
  LearningEventInput,
  LearningEventRecord,
  LearningGoal,
  LearningGoalInput,
  LearningState,
  LearningSyncResult,
} from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { getActiveSyncSession, session } from './session.js';
import { getAnonSupabase } from './supabase.js';
import {
  LOCAL_USER,
  claimLocalRows,
  countUnsynced,
  getGoal,
  getPulledUntil,
  goalToSync,
  insertEvents,
  listEvents,
  markEventsSynced,
  markGoalSynced,
  restoreGoal,
  saveGoal,
  setPulledUntil,
  unsyncedEvents,
} from './learning-store.js';

/**
 * Learn persistence: local SQLite is the cache and outbox, Supabase (migration
 * 007 RPCs, session-checked) is the durable store. Events are append-only and
 * merged by id, so pushing and pulling in any order is safe.
 */

const now = () => new Date().toISOString();

/** The signed-in user's id, or 'local' before sign-in (claimed on the next sign-in). */
function currentUserId(): string {
  return session.userId ? String(session.userId) : LOCAL_USER;
}

export function getLearningState(): LearningState {
  const db = getDb();
  const userId = currentUserId();
  if (userId !== LOCAL_USER) {
    claimLocalRows(db, userId);
    persistDb();
  }
  return { goal: getGoal(db, userId), events: listEvents(db, userId), pendingSync: countUnsynced(db, userId) };
}

export function saveLearningGoal(input: LearningGoalInput): { success: boolean; goal?: LearningGoal; error?: string } {
  try {
    const goal = saveGoal(getDb(), currentUserId(), input, now());
    persistDb();
    void syncLearning().catch(() => {});
    return { success: true, goal };
  } catch (err) {
    log(`[Learn] Goal not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your goal could not be saved on this device.' };
  }
}

export function recordLearningEvents(events: LearningEventInput[]): {
  success: boolean;
  events?: LearningEventRecord[];
  error?: string;
} {
  try {
    const { records } = insertEvents(getDb(), currentUserId(), events);
    persistDb();
    void syncLearning().catch(() => {});
    return { success: true, events: records };
  } catch (err) {
    log(`[Learn] Progress not saved: ${errorMessage(err)}`);
    return { success: false, error: 'Your progress could not be saved on this device.' };
  }
}

let inFlight: Promise<LearningSyncResult> | null = null;
let queued: Promise<LearningSyncResult> | null = null;

/**
 * Pushes the goal and unsynced events, then pulls new events. One run at a
 * time; a call during a run gets one follow-up run, so nothing recorded (or no
 * sign-in) after the current run started is missed.
 */
export function syncLearning(): Promise<LearningSyncResult> {
  if (!inFlight) {
    inFlight = runSync().finally(() => { inFlight = null; });
    return inFlight;
  }
  if (!queued) queued = inFlight.then(() => { queued = null; return syncLearning(); });
  return queued;
}

async function runSync(): Promise<LearningSyncResult> {
  const result: LearningSyncResult = { success: false, pushed: 0, pulled: 0, rejected: 0 };
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return { ...result, error: 'Sign in to back up your progress.' };
  const { userId, sessionToken, deviceFingerprint } = active;
  const db = getDb();
  try {
    claimLocalRows(db, userId);

    // 1. Goal (archive the previous track first so a free account can switch roles).
    const pending = goalToSync(db, userId);
    if (pending) {
      if (pending.archiveTrackId) {
        await learningArchiveTrack(supabase, userId, sessionToken, deviceFingerprint, pending.archiveTrackId);
      }
      const res = await learningStartTrack(supabase, userId, sessionToken, deviceFingerprint, pending.goal);
      if (res.ok) markGoalSynced(db, userId, pending.goal, now());
      else log(`[Learn] Goal not synced: ${res.error ?? 'unknown error'}`);
    } else if (!getGoal(db, userId)) {
      const res = await learningGetTracks(supabase, userId, sessionToken, deviceFingerprint);
      const t = res.tracks.find((x) => x.status === 'active');
      const track = t ? RoleFamilyIdSchema.safeParse(t.track_id) : null;
      if (t && track?.success && [1, 3, 6].includes(t.horizon_months) && [1, 2, 4].includes(t.daily_hours)) {
        restoreGoal(db, userId, {
          track_id: track.data,
          horizon_months: t.horizon_months as LearningGoal['horizon_months'],
          daily_hours: t.daily_hours as LearningGoal['daily_hours'],
          started_at: t.started_at,
          updated_at: t.started_at,
        }, now());
      }
    }

    // 2. Push events in server-sized batches. Over-limit attempts are rejected by the server
    //    and stay local only; they are not retried.
    for (let guard = 0; guard < 40; guard++) {
      const batch = unsyncedEvents(db, userId, 500);
      if (!batch.length) break;
      const res = await learningRecordEvents(
        supabase, userId, sessionToken, deviceFingerprint,
        batch.map(({ user_id: _u, ...e }) => e)
      );
      if (!res.ok) throw new Error(res.error || 'Push failed');
      markEventsSynced(db, batch.map((e) => e.id), now());
      result.pushed += res.accepted;
      result.rejected += res.rejected;
    }
    if (result.rejected) log(`[Learn] ${result.rejected} practice attempts were over the daily limit and stay on this device only.`);

    // 3. Pull events received since the last pull.
    let since = getPulledUntil(db, userId) ?? '1970-01-01T00:00:00Z';
    for (let page = 0; page < 10; page++) {
      const res = await learningPullEvents(supabase, userId, sessionToken, deviceFingerprint, since);
      if (!res.ok) throw new Error(res.error || 'Pull failed');
      const valid: LearningEventInput[] = [];
      let maxReceived = since;
      for (const raw of res.events) {
        if (raw.received_at && raw.received_at > maxReceived) maxReceived = raw.received_at;
        const parsed = LearningEventSchema.safeParse({ ...raw, user_id: userId, payload: raw.payload ?? {} });
        if (!parsed.success) continue;
        const { user_id: _u, ...e } = parsed.data;
        valid.push(e);
      }
      result.pulled += insertEvents(db, userId, valid, now()).inserted;
      if (maxReceived === since) break;
      since = maxReceived;
      setPulledUntil(db, userId, since);
      if (res.events.length < 5000) break;
    }

    persistDb();
    return { ...result, success: true };
  } catch (err) {
    persistDb();
    log(`[Learn] Sync failed: ${errorMessage(err)}`);
    return { ...result, error: 'Could not reach the server. Your progress is saved on this device and will sync later.' };
  }
}
