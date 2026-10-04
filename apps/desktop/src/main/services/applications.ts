import { randomUUID } from 'crypto';
import { syncDeleteApplication, syncPushApplication, syncSetApplicationFollowUp } from '@job-automator/supabase';
import {
  MANUAL_APPLICATION_KEY_PREFIX,
  type ApplicationFollowUpInput,
  type ApplicationInput,
  type ApplicationNotesInput,
  type ApplicationRecord,
  type IdStatusInput,
} from '../../shared/ipc.js';
import { getDb, logUserActivityDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';
import {
  getApplication,
  listApplications,
  recordApplication,
  removeApplication,
  setApplicationFollowUp,
  setApplicationNotes,
  setApplicationStatus,
  toIso,
  type RecordApplicationInput,
} from './applications-store.js';

/**
 * Applications tracker: local SQLite is the source of truth, every change is
 * pushed to Supabase (best effort, when a sync session is active) so the
 * tracker survives a reinstall.
 */

const now = () => new Date().toISOString();

function pushToCloud(app: ApplicationRecord): void {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return;
  syncPushApplication(supabase, active.userId, active.sessionToken, active.deviceFingerprint, {
    company: app.company,
    title: app.title,
    apply_url: app.apply_url,
    status: app.status,
    mode: app.mode ?? undefined,
    notes: app.notes,
    status_history: app.history,
    applied_at: toIso(app.applied_at),
  })
    .then((res) => { if (!res.ok) log(`[Cloud Sync] Application #${app.id} not synced: ${res.error ?? 'unknown error'}`); })
    .catch((err) => log(`[Cloud Sync] Application #${app.id} not synced: ${errorMessage(err)}`));
}

function deleteFromCloud(applyUrl: string): void {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return;
  syncDeleteApplication(supabase, active.userId, active.sessionToken, active.deviceFingerprint, applyUrl)
    .then((res) => { if (!res.ok) log(`[Cloud Sync] Application delete not synced: ${res.error ?? 'unknown error'}`); })
    .catch((err) => log(`[Cloud Sync] Application delete not synced: ${errorMessage(err)}`));
}

export function getApplications(): ApplicationRecord[] {
  return listApplications(getDb());
}

/** Insert or update by apply URL, persist and sync. Used by the apply engine and outreach. */
export function logAndSyncApplication(app: RecordApplicationInput): number {
  const db = getDb();
  const id = recordApplication(db, app, now());
  persistDb();
  const rec = getApplication(db, id);
  if (rec) pushToCloud(rec);
  return id;
}

/** Manual entry from the tracker. */
export function saveApplication(app: ApplicationInput): { success: boolean; id?: number; error?: string } {
  try {
    const applyUrl = app.apply_url?.trim() || `${MANUAL_APPLICATION_KEY_PREFIX}${randomUUID()}`;
    const id = logAndSyncApplication({
      company: app.company.trim(),
      title: app.title.trim(),
      apply_url: applyUrl,
      status: app.status || 'applied',
      mode: app.mode || 'manual',
      notes: app.notes,
    });
    logUserActivityDb('application', `Applied to ${app.title} at ${app.company}`);
    return { success: true, id };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export function updateApplicationStatus(data: IdStatusInput): { success: boolean; error?: string; application?: ApplicationRecord } {
  try {
    const db = getDb();
    const rec = setApplicationStatus(db, data.id, data.status, now());
    if (!rec) return { success: false, error: 'Application not found.' };
    persistDb();
    pushToCloud(rec);
    log(`[Applications] Status for #${rec.id} -> ${rec.status}`);
    return { success: true, application: rec };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export function updateApplicationNotes(data: ApplicationNotesInput): { success: boolean; error?: string; application?: ApplicationRecord } {
  try {
    const db = getDb();
    const rec = setApplicationNotes(db, data.id, data.notes, now());
    if (!rec) return { success: false, error: 'Application not found.' };
    persistDb();
    pushToCloud(rec);
    return { success: true, application: rec };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

/**
 * Follow-up dates go through their own RPC (026). The application is pushed first so the
 * account row exists even if an earlier push failed.
 */
function pushFollowUpToCloud(app: ApplicationRecord): void {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return;
  syncPushApplication(supabase, active.userId, active.sessionToken, active.deviceFingerprint, {
    company: app.company,
    title: app.title,
    apply_url: app.apply_url,
    status: app.status,
    mode: app.mode ?? undefined,
    notes: app.notes,
    status_history: app.history,
    applied_at: toIso(app.applied_at),
  })
    .then(() => syncSetApplicationFollowUp(supabase, active.userId, active.sessionToken, active.deviceFingerprint, app.apply_url, app.follow_up_at ?? null))
    .then((res) => { if (!res.ok) log(`[Cloud Sync] Follow-up for #${app.id} not synced: ${res.error ?? 'unknown error'}`); })
    .catch((err) => log(`[Cloud Sync] Follow-up for #${app.id} not synced: ${errorMessage(err)}`));
}

export function updateApplicationFollowUp(data: ApplicationFollowUpInput): { success: boolean; error?: string; application?: ApplicationRecord } {
  try {
    const rec = setApplicationFollowUp(getDb(), data.id, data.followUpAt, now());
    if (!rec) return { success: false, error: 'Application not found.' };
    persistDb();
    pushFollowUpToCloud(rec);
    return { success: true, application: rec };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export function deleteApplication(id: number | string): { success: boolean; error?: string } {
  try {
    const removed = removeApplication(getDb(), id);
    if (!removed) return { success: false, error: 'Application not found.' };
    persistDb();
    deleteFromCloud(removed.apply_url);
    log(`[Applications] Removed record #${removed.id}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}
