/**
 * Feature flags for the renderer, from the shared config (@nomadic/config).
 * Outreach, Resource Vault and Opportunity Board are hidden by default;
 * enable with VITE_FEATURES="outreach=on,resourceVault=on" at build time.
 */
import { resolveFeatures, type FeatureFlag } from '@nomadic/config';
import { IS_MOBILE, MOBILE_HIDDEN_TABS } from './platform';

export const FEATURES = resolveFeatures(((import.meta as any).env?.VITE_FEATURES as string | undefined) ?? null);

const TAB_FLAGS: Record<string, FeatureFlag> = {
  outreach: 'outreach',
  'learner-resources': 'resourceVault',
  opportunities: 'opportunityBoard',
  'nav-outreach': 'outreach',
  'nav-resources': 'resourceVault',
};

/** Tabs (and command-palette ids) that belong to a disabled feature are hidden. */
export function isTabEnabled(id: string | null | undefined): boolean {
  if (IS_MOBILE && id && MOBILE_HIDDEN_TABS.has(id)) return false;
  const flag = id ? TAB_FLAGS[id] : undefined;
  return flag ? FEATURES[flag] : true;
}
