import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Polyfill globalThis.WebSocket for Node.js / Electron environments
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    (globalThis as any).WebSocket = WebSocket;
  } catch {}
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  subscription_tier: 'trial' | 'pro' | 'max' | 'enterprise' | 'lifetime';
  role?: 'admin' | 'user';
  status?: 'active' | 'suspended';
  license_key?: string;
  expires_at?: string;
  created_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  current_ip: string;
  device_fingerprint: string;
  device_name?: string;
  session_token: string;
  last_heartbeat: string;
}

export interface Job {
  id?: string;
  job_hash: string;
  company: string;
  title: string;
  location: string;
  description: string;
  apply_url: string;
  source: string;
  salary_range?: string;
  created_at?: string;
}

export interface UserPreference {
  user_id: string;
  target_titles: string[];
  locations: string[];
  is_remote: boolean;
  min_salary: number;
  excluded_keywords: string[];
}

export interface CloudUserData {
  profile: Record<string, unknown> | null;
  applications: Array<Record<string, unknown>>;
  savedJobs: Array<Record<string, unknown>>;
  resumes: Array<Record<string, unknown>>;
}

export function getSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  const wsImplementation = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: wsImplementation,
    },
  });
}

/**
 * Register or Lock Device Session on Login.
 * Strictly enforces 1 active device/laptop per account.
 *
 * `loginTicket` is the one-time ticket returned by `authenticate_user` (migration 008).
 * It proves the caller just signed in as `userId`. It is only sent when present so
 * builds keep working against a database that has not applied 008 yet.
 */
export async function registerDeviceSession(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  deviceName: string,
  clientIp: string,
  forceTakeover: boolean = false,
  loginTicket?: string | null
): Promise<{ ok: boolean; conflict: boolean; activeDevice?: string; reason?: string }> {
  try {
    const params: Record<string, unknown> = {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_device_name: deviceName,
      p_client_ip: clientIp,
      p_force_takeover: forceTakeover,
    };
    if (loginTicket) params.p_login_ticket = loginTicket;
    const { data, error } = await supabase.rpc('register_device_session', params);

    if (error) {
      console.error('Register Device Session Error:', error.message);
      return { ok: false, conflict: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: Boolean(row?.ok),
      conflict: Boolean(row?.conflict),
      activeDevice: row?.active_device ? String(row.active_device) : undefined,
      reason: row?.reason ? String(row.reason) : undefined
    };
  } catch (err: any) {
    console.error('Register Device Session Exception:', err);
    return { ok: false, conflict: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Single-Laptop Heartbeat Verification
 * Returns false if session was invalidated due to another device taking over.
 */
export async function sendSessionHeartbeat(
  supabase: any,
  userId: string,
  sessionToken: string,
  clientIp: string,
  deviceFingerprint: string
): Promise<{ valid: boolean; reason?: string; ended?: boolean }> {
  try {
    const { data, error } = await supabase.rpc('verify_and_update_session', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_client_ip: clientIp,
      p_device_fingerprint: deviceFingerprint
    });

    if (error) {
      console.error('Session Heartbeat Error:', error.message);
      return { valid: false, reason: error.message };
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const resData = rows[0] as { is_valid?: boolean; reason?: string } | undefined;
    const valid = Boolean(resData?.is_valid);
    return {
      valid,
      reason: resData?.reason ? String(resData.reason) : undefined,
      // The server answered and rejected the session (signed in elsewhere, expired, suspended).
      ended: !valid,
    };
  } catch (err: any) {
    console.error('Session Heartbeat Exception:', err);
    return { valid: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Pull all cloud data for the user on fresh login or laptop switch.
 */
export async function syncPullUserData(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string
): Promise<{ ok: boolean; error?: string; data?: CloudUserData }> {
  try {
    const { data, error } = await supabase.rpc('sync_pull_user_data', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.ok) {
      return { ok: false, error: row?.error || 'Failed to pull cloud user data' };
    }

    return {
      ok: true,
      data: {
        profile: row.profile || null,
        applications: Array.isArray(row.applications) ? row.applications : [],
        savedJobs: Array.isArray(row.saved_jobs) ? row.saved_jobs : [],
        resumes: Array.isArray(row.resumes) ? row.resumes : []
      }
    };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Push candidate master profile to Supabase cloud.
 */
export async function syncPushUserProfile(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  profile: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_push_user_profile', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_profile: profile
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Push an application record to Supabase cloud.
 */
export async function syncPushApplication(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  app: {
    company: string;
    title: string;
    apply_url: string;
    status?: string;
    mode?: string;
    /** Omit to keep the stored notes. */
    notes?: string;
    /** Full append-only history; omit to keep the stored history. */
    status_history?: Array<{ status: string; changed_at: string }>;
    applied_at?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const params: Record<string, unknown> = {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_company: app.company,
      p_title: app.title,
      p_apply_url: app.apply_url,
      p_status: app.status || 'applied',
      p_mode: app.mode || 'autonomous'
    };
    // Optional fields (migration 010) are only sent when set.
    if (app.notes !== undefined) params.p_notes = app.notes;
    if (app.status_history !== undefined) params.p_status_history = app.status_history;
    if (app.applied_at !== undefined) params.p_applied_at = app.applied_at;
    const { data, error } = await supabase.rpc('sync_push_application', params);

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Delete an application from Supabase cloud (by apply URL, its sync key).
 */
export async function syncDeleteApplication(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  applyUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_delete_application', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_apply_url: applyUrl
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Push a saved job to Supabase cloud.
 */
export async function syncPushSavedJob(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  job: {
    title: string;
    company: string;
    apply_url: string;
    location?: string;
    salary?: string;
    source?: string;
    score?: number;
    description?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_push_saved_job', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_title: job.title,
      p_company: job.company,
      p_apply_url: job.apply_url,
      p_location: job.location || null,
      p_salary: job.salary || null,
      p_source: job.source || null,
      p_score: job.score || 100,
      p_description: job.description || null
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Remove a saved job from Supabase cloud.
 */
export async function syncRemoveSavedJob(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  applyUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_remove_saved_job', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_apply_url: applyUrl
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Push a resume record to Supabase cloud.
 */
export async function syncPushResume(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  resume: {
    name: string;
    target_role?: string;
    file_path?: string;
    resume_text?: string;
    is_default?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_push_resume', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_name: resume.name,
      p_target_role: resume.target_role || null,
      p_file_path: resume.file_path || null,
      p_resume_text: resume.resume_text || null,
      p_is_default: Boolean(resume.is_default)
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Delete a resume record from Supabase cloud.
 */
export async function syncDeleteResume(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  resumeName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_delete_resume', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_name: resumeName
    });

    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function handleRazorpaySuccessRpc(
  supabase: any,
  params: {
    userId?: string;
    email: string;
    plan: string;
    amount: string;
    paymentId: string;
    orderId?: string;
  }
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc('handle_razorpay_payment_success', {
      p_user_id: params.userId || null,
      p_email: params.email,
      p_plan: params.plan,
      p_amount: params.amount,
      p_payment_id: params.paymentId,
      p_order_id: params.orderId || null,
    });
    if (error) return { ok: false, reason: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), reason: row?.reason };
  } catch (err: any) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

// ── Learn (migration 007 RPCs; 012 adds the track pull) ─────────────────────
// Every call is session-checked server-side (learning_session_ok). Free-tier
// limits (1 active track, 10 practice attempts per UTC day) are enforced there.

export interface CloudLearningEvent {
  id: string;
  type: string;
  skill_id: string | null;
  item_id: string | null;
  payload: Record<string, unknown>;
  duration_s: number;
  created_at: string;
  received_at?: string;
}

export interface CloudLearningTrack {
  track_id: string;
  status: 'active' | 'archived';
  horizon_months: number;
  daily_hours: number;
  started_at: string;
  archived_at: string | null;
}

/** Appends events (idempotent by id). Over-limit practice attempts come back as `rejected`. */
export async function learningRecordEvents(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  events: Array<Omit<CloudLearningEvent, 'received_at'>>
): Promise<{ ok: boolean; accepted: number; rejected: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('learning_record_events', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_events: events,
    });
    if (error) return { ok: false, accepted: 0, rejected: 0, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.error) return { ok: false, accepted: 0, rejected: 0, error: row?.error || 'No response' };
    return { ok: true, accepted: Number(row.accepted) || 0, rejected: Number(row.rejected) || 0 };
  } catch (err: any) {
    return { ok: false, accepted: 0, rejected: 0, error: String(err?.message ?? err) };
  }
}

/** Events the server received after `since` (ISO time), oldest first, at most 5000 per call. */
export async function learningPullEvents(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  since: string = '1970-01-01T00:00:00Z'
): Promise<{ ok: boolean; events: CloudLearningEvent[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('learning_pull_events', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_since: since,
    });
    if (error) return { ok: false, events: [], error: error.message };
    return { ok: true, events: Array.isArray(data) ? data : [] };
  } catch (err: any) {
    return { ok: false, events: [], error: String(err?.message ?? err) };
  }
}

/** Starts or resumes a track. Free tier: fails with `free_tier_track_limit` while another track is active. */
export async function learningStartTrack(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  track: { track_id: string; horizon_months: number; daily_hours: number }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('learning_start_track', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_track_id: track.track_id,
      p_horizon_months: track.horizon_months,
      p_daily_hours: track.daily_hours,
    });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(row?.ok), error: row?.error ?? undefined };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function learningArchiveTrack(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  trackId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('learning_archive_track', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
      p_track_id: trackId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: data === true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/** The user's tracks (migration 012). Fails softly on a database without it. */
export async function learningGetTracks(
  supabase: any,
  userId: string,
  sessionToken: string,
  deviceFingerprint: string
): Promise<{ ok: boolean; tracks: CloudLearningTrack[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('learning_get_tracks', {
      p_user_id: userId,
      p_session_token: sessionToken,
      p_device_fingerprint: deviceFingerprint,
    });
    if (error) return { ok: false, tracks: [], error: error.message };
    return { ok: true, tracks: Array.isArray(data) ? data : [] };
  } catch (err: any) {
    return { ok: false, tracks: [], error: String(err?.message ?? err) };
  }
}
