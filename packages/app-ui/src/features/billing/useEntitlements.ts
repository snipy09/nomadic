import { useCallback, useContext } from 'react';
import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { getApi } from '../../types';
import { queryClient as appQueryClient } from '../../queryClient';
import type { Entitlements } from '@nomadic/app-core/shared/ipc';
import type { EntitlementsStatus } from './billingLogic';

export const ENTITLEMENTS_KEY = ['entitlements'] as const;

export class EntitlementsError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'EntitlementsError';
  }
}

async function fetchEntitlements(fresh: boolean): Promise<Entitlements> {
  const api = getApi();
  if (!api.getEntitlements) throw new EntitlementsError('Plan details are not available in this build.', 'unavailable');
  const res = await api.getEntitlements(fresh ? { fresh: true } : undefined);
  if (!res.success) throw new EntitlementsError(res.error, res.code);
  return res.entitlements;
}

export interface EntitlementsState {
  status: EntitlementsStatus;
  entitlements: Entitlements | null;
  error: string | null;
  /** Ask the server again, skipping main's short cache. */
  refresh: () => Promise<void>;
}

/**
 * Server entitlements (plan, limits, today's usage). The server is the only
 * authority; `unknown` (offline, signed out, error) must be treated as Free
 * for paid features. Pass `pollMs` while waiting for a payment to land.
 */
export function useEntitlements(options: { pollMs?: number | false } = {}): EntitlementsState {
  // Works with or without a QueryClientProvider above (tests, isolated screens).
  const client = useContext(QueryClientContext) ?? appQueryClient;
  const query = useQuery(
    {
      queryKey: ENTITLEMENTS_KEY,
      queryFn: () => fetchEntitlements(false),
      staleTime: 5_000,
      retry: false,
      refetchInterval: options.pollMs || false,
    },
    client,
  );
  const refresh = useCallback(async () => {
    await client.fetchQuery({ queryKey: ENTITLEMENTS_KEY, queryFn: () => fetchEntitlements(true), staleTime: 0, retry: false }).catch(() => undefined);
  }, [client]);

  // A failed refetch drops to 'unknown' even if older data exists: paid features fail closed.
  const status: EntitlementsStatus = query.isPending ? 'loading' : query.isError ? 'unknown' : 'ready';
  return {
    status,
    entitlements: status === 'ready' ? (query.data ?? null) : null,
    error: query.error ? query.error.message : null,
    refresh,
  };
}

/** Marks entitlements stale after something that changes usage (e.g. a submission). */
export function useInvalidateEntitlements(): () => void {
  const client = useContext(QueryClientContext) ?? appQueryClient;
  return useCallback(() => { void client.invalidateQueries({ queryKey: ENTITLEMENTS_KEY }); }, [client]);
}
