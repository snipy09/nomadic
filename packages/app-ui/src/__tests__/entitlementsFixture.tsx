import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Entitlements } from '@nomadic/app-core/shared/ipc';
import { ENTITLEMENTS_KEY } from '../features/billing/useEntitlements';

/** Server entitlements as get-entitlements returns them (Pro by default). */
export function entitlements(over: Partial<Entitlements> = {}): Entitlements {
  return {
    plan: 'pro',
    storedTier: 'pro',
    accountStatus: 'active',
    expiresAt: '2026-11-02T10:00:00.000Z',
    limits: { appliesPerDay: 10, feedJobs: null, learnTracks: null, practicePerDay: null, autonomousApply: false, resumes: 5 },
    usage: { appliesToday: 2, learnTracksActive: 1 },
    appliesRemaining: 8,
    resetsAt: '2026-10-03T18:30:00.000Z',
    fetchedAt: '2026-10-03T10:00:00.000Z',
    ...over,
  };
}

export const freeEntitlements = (over: Partial<Entitlements> = {}) =>
  entitlements({
    plan: 'free', storedTier: 'trial', expiresAt: null,
    limits: { appliesPerDay: 3, feedJobs: 10, learnTracks: 1, practicePerDay: 10, autonomousApply: false, resumes: 1 },
    usage: { appliesToday: 0, learnTracksActive: 0 },
    appliesRemaining: 3,
    ...over,
  });

/** A fresh query client per test; `seed` pre-loads entitlements so no fetch is needed. */
export function QueryWrapper({ children, seed }: { children: React.ReactNode; seed?: Entitlements }) {
  const [client] = React.useState(() => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (seed) c.setQueryData(ENTITLEMENTS_KEY, seed);
    return c;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
