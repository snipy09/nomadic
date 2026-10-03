import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PLANS, aiLimitsSqlRows } from '@nomadic/config';

// The latest ai_limits() (020, or a later migration that redefines it) must mirror
// packages/config, the single source of limits.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
const latest = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => read(f).includes('-- BEGIN ai_limits')).pop()!;
const migration = read(latest);
const migration020 = read('020_ai_usage.sql');

function sqlRows(): string[] {
  const m = migration.match(/-- BEGIN ai_limits[^\n]*\n([\s\S]*?)\n\s*-- END ai_limits/);
  if (!m) throw new Error(`ai_limits markers not found in ${latest}`);
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('SQL AI limits mirror packages/config', () => {
  it('contains exactly the rows rendered from config (paste these if this fails)', () => {
    expect(sqlRows()).toEqual(aiLimitsSqlRows());
  });

  it('every plan matches field by field', () => {
    const rows = sqlRows().map((line) => {
      const m = line.match(/^\('(\w+)',\s*(TRUE|FALSE),\s*(\d+),\s*(\d+)\),?$/);
      if (!m) throw new Error(`unparseable ai_limits row: ${line}`);
      return { plan: m[1], aiFeedback: m[2] === 'TRUE', aiFeedbackPerDay: Number(m[3]), aiFormCallsPerDay: Number(m[4]) };
    });
    expect(rows.map((r) => r.plan)).toEqual(PLANS.map((p) => p.id));
    for (const plan of PLANS) {
      expect(rows.find((r) => r.plan === plan.id)).toMatchObject({
        aiFeedback: plan.limits.aiFeedback,
        aiFeedbackPerDay: plan.limits.aiFeedbackPerDay,
        aiFormCallsPerDay: plan.limits.aiFormCallsPerDay,
      });
    }
  });

  it('plans without AI feedback have no feedback allowance', () => {
    for (const plan of PLANS) if (!plan.limits.aiFeedback) expect(plan.limits.aiFeedbackPerDay).toBe(0);
  });

  it('grants the AI quota functions to service_role only, never to anon/authenticated', () => {
    const grants = [...migration020.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO ([^;]+);/g)];
    expect(grants.map((g) => g[1]).sort()).toEqual(['ai_limits', 'consume_ai_quota', 'refund_ai_quota']);
    for (const g of grants) expect(g[2].trim()).toBe('service_role');
    for (const fn of ['ai_limits', 'consume_ai_quota', 'refund_ai_quota']) {
      expect(migration020).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
    }
    for (const fn of ['consume_ai_quota', 'refund_ai_quota']) {
      expect(migration020).toMatch(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?SECURITY DEFINER SET search_path = public, extensions`));
    }
  });
});
