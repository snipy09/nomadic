import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PLANS, aiProjectHelpLimitsSqlRows } from '@nomadic/config';
import { AI_KINDS } from '../../functions/ai-proxy/core.ts';

// The latest ai_project_help_limits() (030, or a later migration that redefines it) must mirror
// packages/config, and the latest consume/refund must map every ai-proxy kind.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const latestWith = (marker: string) => files.filter((f) => read(f).includes(marker)).pop()!;
const limits = read(latestWith('-- BEGIN ai_project_help_limits'));
const quota = read(latestWith('CREATE OR REPLACE FUNCTION public.consume_ai_quota'));

function sqlRows(): string[] {
  const m = limits.match(/-- BEGIN ai_project_help_limits[^\n]*\n([\s\S]*?)\n\s*-- END ai_project_help_limits/);
  if (!m) throw new Error('ai_project_help_limits markers not found');
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('SQL AI project help limits mirror packages/config', () => {
  it('contains exactly the rows rendered from config (paste these if this fails)', () => {
    expect(sqlRows()).toEqual(aiProjectHelpLimitsSqlRows());
  });

  it('every plan has a finite, positive allowance', () => {
    for (const plan of PLANS) {
      expect(Number.isFinite(plan.limits.aiProjectHelpPerDay)).toBe(true);
      expect(plan.limits.aiProjectHelpPerDay).toBeGreaterThan(0);
    }
  });

  it('the latest quota functions map every ai-proxy kind, and the metric is allowed', () => {
    for (const kind of AI_KINDS) {
      if (kind === 'form_answers') continue; // the ELSE branch
      expect(quota.match(new RegExp(`WHEN '${kind}'`, 'g'))?.length, kind).toBe(2);
    }
    expect(quota).toMatch(/'ai_project_help'\)\);/);
  });

  it('keeps the quota functions server-only', () => {
    for (const fn of ['ai_project_help_limits', 'consume_ai_quota', 'refund_ai_quota']) {
      expect(quota).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(quota).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
  });
});
