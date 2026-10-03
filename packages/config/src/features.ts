/**
 * Feature flags. Unfinished areas stay hidden until they are good
 * (REVAMP_PLAN 3.6): Outreach, Resource Vault, Opportunity Board.
 * Override at build time with VITE_FEATURES / NOMADIC_FEATURES, e.g. "outreach=on,learn=off".
 */
export const FEATURE_DEFAULTS = {
  learn: true,
  feed: true,
  autoApply: true,
  interviewPrep: true,
  outreach: false,
  resourceVault: false,
  opportunityBoard: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_DEFAULTS;
export type FeatureFlags = Record<FeatureFlag, boolean>;

export function parseFeatureOverrides(spec: string | undefined | null): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {};
  for (const part of (spec ?? '').split(',')) {
    const [rawKey, rawVal] = part.split('=').map((s) => s?.trim());
    if (!rawKey || !(rawKey in FEATURE_DEFAULTS)) continue;
    const v = (rawVal ?? 'on').toLowerCase();
    out[rawKey as FeatureFlag] = ['on', 'true', '1', 'yes'].includes(v);
  }
  return out;
}

export function resolveFeatures(overrides: Partial<FeatureFlags> | string | null = null): FeatureFlags {
  const o = typeof overrides === 'string' ? parseFeatureOverrides(overrides) : (overrides ?? {});
  return { ...FEATURE_DEFAULTS, ...o };
}

export function isFeatureEnabled(flag: FeatureFlag, overrides: Partial<FeatureFlags> | string | null = null): boolean {
  return resolveFeatures(overrides)[flag];
}
