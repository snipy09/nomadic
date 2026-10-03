import { getSupabaseClient } from '@job-automator/supabase';
import { log } from './app-context.js';

// ── Supabase / licensing helpers ──────────────────────────────────────────
// SUPABASE_URL / SUPABASE_ANON_KEY are injected at build time by build-main.mjs
// (esbuild `define`), or read from the environment when running unbundled.
// The desktop app never reads the service-role key: admin actions go through
// session-checked RPCs (migration 014) like every other client call.

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
