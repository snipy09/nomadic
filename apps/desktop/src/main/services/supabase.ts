import { getSupabaseClient } from '@job-automator/supabase';
import { log } from './app-context.js';

// ── Supabase / licensing helpers ──────────────────────────────────────────
// SUPABASE_URL / SUPABASE_ANON_KEY are injected at build time by build-main.mjs
// (esbuild `define`), or read from the environment when running unbundled.

export type SupabaseClient = ReturnType<typeof getSupabaseClient>;

export function getAnonSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    log('[Supabase] SUPABASE_URL / SUPABASE_ANON_KEY not set — cloud features disabled.');
    return null;
  }
  return getSupabaseClient(url, anonKey);
}

export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return getSupabaseClient(url, serviceKey);
}

/** Admin actions prefer the operator-only service-role client. */
export function getAdminSupabase(): SupabaseClient | null {
  return getServiceSupabase() || getAnonSupabase();
}

export const ADMIN_NO_SERVICE_ERR =
  'Admin actions require SUPABASE_SERVICE_ROLE_KEY to be set on this machine (operator only).';
