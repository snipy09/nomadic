import { compareVersions, isValidVersion } from './versions.js';
import { getAppSettings, updateAppSettings } from './app-settings.js';
import { log } from './app-context.js';

// Forced-update floor (SAAS_PLAN B4). The release workflow publishes
// update-policy.json next to the installers; a version below `minimumVersion`
// may not be used until it updates (for security fixes). The last policy seen
// is kept so the floor also holds offline. A missing or broken policy never
// blocks anyone.

// Injected at build time (build-main.mjs); defaults to the latest GitHub release asset.
const POLICY_URL = process.env.UPDATE_POLICY_URL || 'https://github.com/snipy09/nomadic/releases/latest/download/update-policy.json';

export interface UpdatePolicy {
  minimumVersion: string;
  message: string | null;
}

export interface UpdatePolicyResult {
  required: boolean;
  currentVersion: string;
  minimumVersion: string | null;
  message: string | null;
}

export function parsePolicy(raw: unknown): UpdatePolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.minimumVersion !== 'string' || !isValidVersion(r.minimumVersion)) return null;
  const message = typeof r.message === 'string' && r.message.trim() ? r.message.trim().slice(0, 500) : null;
  return { minimumVersion: r.minimumVersion, message };
}

export function evaluatePolicy(currentVersion: string, policy: UpdatePolicy | null): UpdatePolicyResult {
  if (!policy || !isValidVersion(currentVersion)) {
    return { required: false, currentVersion, minimumVersion: policy?.minimumVersion ?? null, message: null };
  }
  const required = compareVersions(currentVersion, policy.minimumVersion) < 0;
  return { required, currentVersion, minimumVersion: policy.minimumVersion, message: required ? policy.message : null };
}

/** Fetches the policy (falls back to the last one seen) and decides whether this version must update. */
export async function checkUpdatePolicy(currentVersion: string, fetchImpl: typeof fetch = fetch): Promise<UpdatePolicyResult> {
  let policy: UpdatePolicy | null = null;
  try {
    const res = await fetchImpl(POLICY_URL, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) policy = parsePolicy(await res.json());
  } catch (err: unknown) {
    log(`[Updates] Policy check skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (policy) {
    updateAppSettings({ lastUpdatePolicy: { ...policy, fetchedAt: new Date().toISOString() } });
  } else {
    const last = getAppSettings().lastUpdatePolicy;
    policy = last ? { minimumVersion: last.minimumVersion, message: last.message } : null;
  }
  return evaluatePolicy(currentVersion, policy);
}
