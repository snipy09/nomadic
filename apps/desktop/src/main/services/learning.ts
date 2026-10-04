import { learningPullEvents, learningPullState, learningRecordEvents, learningSaveState } from '@job-automator/supabase';
import { LearningEventSchema, ProblemNoteSchema, RoadmapSchema, ScheduleSchema, UserProjectSchema } from '@job-automator/learning';
import type { LearningEventInput, LearningEventRecord, LearningState, LearningSyncResult } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { getActiveSyncSession, session } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { readDraft, readNotes, readProjects, readRoadmap, readSchedule } from './learn-v2.js';
import {
  LOCAL_USER,
  SYNCED_DOC_KINDS,
  claimLocalRows,
  countUnsynced,
  countUnsyncedDocs,
  getPulledUntil,
  insertEvents,
  listEvents,
  markDocSynced,
  markEventsSynced,
  mergePulledDoc,
  setPulledUntil,
  unsyncedDocs,
  unsyncedEvents,
  type SyncedDocKind,
} from './learning-store.js';

/**
 * Learn persistence: local SQLite is the cache and outbox, Supabase (migration
 * 007 RPCs, session-checked) is the durable store. Events are append-only and
 * merged by id, so pushing and pulling in any order is safe. Learn v2 documents
 * (roadmap, schedule, projects, notes; migration 027) sync newest-wins.
 */

const now = () => new Date().toISOString();

/** The signed-in user's id, or 'local' before sign-in (claimed on the next sign-in). */
export function currentUserId(): string {
  return session.userId ? String(session.userId) : LOCAL_USER;
}

export function getLearningState(): LearningState {
  const db = getDb();
  const userId = currentUserId();
  if (userId !== LOCAL_USER) {
    claimLocalRows(db, userId);
    persistDb();
  }
  return {
    events: listEvents(db, userId),
    pendingSync: countUnsynced(db, userId) + countUnsyncedDocs(db, userId),
    roadmap: readRoadmap(db, userId),
    schedule: readSchedule(db, userId),
    projects: readProjects(db, userId),
    notes: readNotes(db, userId),
    draft: readDraft(db, userId),
  };
}

/** Schema check for a document pulled from the account (bad documents are skipped). */
function validDoc(kind: SyncedDocKind, value: unknown): boolean {
  switch (kind) {
    case 'roadmap':
      return RoadmapSchema.safeParse(value).success;
    case 'schedule':
      return ScheduleSchema.safeParse(value).success;
    case 'projects':
      return Array.isArray(value) && value.every((p) => UserProjectSchema.safeParse(p).success);
    case 'notes':
      return Array.isArray(value) && value.every((p) => ProblemNoteSchema.safeParse(p).success);
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

    // 1. Learn v2 documents: pull (newest wins), then push what changed here.
    const pulledDocs = await learningPullState(supabase, userId, sessionToken, deviceFingerprint);
    if (!pulledDocs.ok) throw new Error(pulledDocs.error || 'State pull failed');
    for (const d of pulledDocs.docs) {
      const kind = d.kind as SyncedDocKind;
      if (!(SYNCED_DOC_KINDS as readonly string[]).includes(kind) || !validDoc(kind, d.value)) continue;
      if (mergePulledDoc(db, userId, kind, d.value, d.updated_at, now())) result.pulled += 1;
    }
    for (const doc of unsyncedDocs(db, userId)) {
      const res = await learningSaveState(supabase, userId, sessionToken, deviceFingerprint, {
        kind: doc.kind as SyncedDocKind,
        value: doc.value,
        updatedAt: doc.updated_at,
      });
      if (res.ok) {
        markDocSynced(db, userId, doc.kind, doc.updated_at, now());
        result.pushed += 1;
      } else if (!res.stale) {
        throw new Error(res.error || 'State push failed');
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
