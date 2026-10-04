import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeCatalog } from '../../shared/ipc';

const h = vi.hoisted(() => ({
  entitlements: null as null | { success: boolean; entitlements?: { plan: string; accountStatus: string } },
  catalog: null as unknown as PracticeCatalog,
}));

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../db', () => ({ getDb: vi.fn(), persistDb: vi.fn() }));
vi.mock('../services/session', () => ({ getActiveSyncSession: () => null }));
vi.mock('../services/supabase', () => ({ getAnonSupabase: () => null }));
vi.mock('../services/app-context', () => ({ log: vi.fn(), errorMessage: (e: unknown) => String(e) }));
vi.mock('../services/entitlements', () => ({ getEntitlements: async () => h.entitlements }));
vi.mock('../services/practice-catalog', () => ({ loadPracticeCatalog: async () => h.catalog }));

import { getPracticeCatalog, lockCompanySets } from '../services/practice';

const catalog = (): PracticeCatalog => ({
  version: '1',
  companies: [{ name: 'Google', problemCount: 1 }],
  entries: [
    { id: 'lc:two-sum', kind: 'problem', title: 'Two Sum', prompt: '', difficulty: 'easy', topics: [], roles: [], companies: [{ name: 'Google', frequency: 90 }], link: 'https://leetcode.com/problems/two-sum/', skillId: 'dsa', referenceAnswer: null, quiz: null, source: 'x' },
    { id: 'roleq:x', kind: 'written', title: 'Q', prompt: 'Why?', difficulty: null, topics: [], roles: [], companies: [], link: null, skillId: null, referenceAnswer: null, quiz: null, source: 'y' },
  ] as PracticeCatalog['entries'],
});

beforeEach(() => { h.catalog = catalog(); });

describe('company question sets are gated in main by the server plan', () => {
  it.each([
    ['free plan', { success: true, entitlements: { plan: 'free', accountStatus: 'active' } }],
    ['suspended pro', { success: true, entitlements: { plan: 'pro', accountStatus: 'suspended' } }],
    ['offline / signed out', { success: false }],
  ])('%s: no company names or frequencies reach the renderer', async (_label, ent) => {
    h.entitlements = ent;
    const res = await getPracticeCatalog();
    if (!res.success) throw new Error(res.error);
    expect(res.catalog.companyLocked).toBe(true);
    expect(res.catalog.companies).toEqual([]);
    expect(res.catalog.entries.every((e) => e.companies.length === 0)).toBe(true);
    expect(res.catalog.entries.map((e) => e.id)).toEqual(['lc:two-sum', 'roleq:x']);
  });

  it('pro plan gets the full sets', async () => {
    h.entitlements = { success: true, entitlements: { plan: 'pro', accountStatus: 'active' } };
    const res = await getPracticeCatalog();
    if (!res.success) throw new Error(res.error);
    expect(res.catalog.companyLocked).toBeUndefined();
    expect(res.catalog.companies).toHaveLength(1);
    expect(res.catalog.entries[0].companies).toEqual([{ name: 'Google', frequency: 90 }]);
  });

  it('lockCompanySets does not mutate the cached catalog', () => {
    const c = catalog();
    lockCompanySets(c);
    expect(c.entries[0].companies).toHaveLength(1);
  });
});
