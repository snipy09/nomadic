import { app } from 'electron';
import { appReviewStatus, appReviewSubmit } from '@job-automator/supabase';
import type { AppReviewInput, AppReviewStatus, SuccessResult } from '../../shared/ipc.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// In-app review (migration 034). The server decides when it is due: the account is at least
// 7 days old and has no review yet. "Not now" is a UI preference kept on the device.

const ERRORS: Record<string, string> = {
  already_reviewed: 'You have already sent a review. Thank you.',
  unauthorized: 'Sign in again to send your review.',
  bad_request: 'Some answers are missing. Please check the form.',
};

export async function getAppReviewStatus(): Promise<AppReviewStatus> {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return { due: false };
  const res = await appReviewStatus(supabase, active.userId, active.sessionToken, active.deviceFingerprint);
  if (!res.ok) log(`[Review] Status check failed: ${res.error}`);
  return { due: res.ok && res.due };
}

export async function submitAppReview(input: AppReviewInput): Promise<SuccessResult> {
  const active = getActiveSyncSession();
  const supabase = active ? getAnonSupabase() : null;
  if (!active || !supabase) return { success: false, error: 'Sign in to send your review.' };
  let appVersion: string | null;
  try {
    appVersion = app.getVersion() || null;
  } catch {
    appVersion = null;
  }
  const res = await appReviewSubmit(supabase, active.userId, active.sessionToken, active.deviceFingerprint, {
    platform: input.platform,
    appVersion,
    sus: input.sus,
    recommend: input.recommend,
    best: input.best?.trim() || null,
    frustrating: input.frustrating?.trim() || null,
  });
  if (res.ok) return { success: true };
  log(`[Review] Submit failed: ${res.error}`);
  return { success: false, error: ERRORS[res.error ?? ''] ?? 'Your review could not be sent. Check your connection and try again.' };
}
