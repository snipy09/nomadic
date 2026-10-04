import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PLANS, aiOutreachLimitsSqlRows } from '@nomadic/config';

// The latest ai_outreach_limits() (027, or a later migration that redefines it) must mirror
// packages/config, and the outreach RPC grants must stay as designed.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
const latest = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => read(f).includes('-- BEGIN ai_outreach_limits')).pop()!;
const migration = read(latest);
const migration027 = read('027_outreach.sql');

function sqlRows(): string[] {
  const m = migration.match(/-- BEGIN ai_outreach_limits[^\n]*\n([\s\S]*?)\n\s*-- END ai_outreach_limits/);
  if (!m) throw new Error(`ai_outreach_limits markers not found in ${latest}`);
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

const grantsOf = (fn: string) =>
  [...migration027.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO ([^;]+);`, 'g'))].map((g) => g[1].trim());

describe('SQL AI outreach limits mirror packages/config', () => {
  it('contains exactly the rows rendered from config (paste these if this fails)', () => {
    expect(sqlRows()).toEqual(aiOutreachLimitsSqlRows());
  });

  it('every plan has a finite, non-negative draft allowance', () => {
    for (const plan of PLANS) {
      expect(Number.isFinite(plan.limits.aiOutreachDraftsPerDay)).toBe(true);
      expect(plan.limits.aiOutreachDraftsPerDay).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps server-only functions away from anon/authenticated', () => {
    for (const fn of ['outreach_suppress', 'ai_outreach_limits', 'consume_ai_quota', 'refund_ai_quota']) {
      expect(grantsOf(fn)).toEqual(['service_role']);
      expect(migration027).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
    }
    for (const fn of ['outreach_email_hash', 'outreach_contacts_skip_suppressed']) {
      expect(grantsOf(fn)).toEqual([]);
    }
  });

  it('grants the session-checked client RPCs explicitly', () => {
    for (const fn of ['outreach_list_contacts', 'outreach_report_contact', 'account_export_data']) {
      expect(grantsOf(fn)).toEqual(['anon, authenticated']);
      expect(migration027).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC;`));
      expect(migration027).toMatch(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?billing_session_ok|FUNCTION public\\.${fn}\\([\\s\\S]*?user_sessions`));
    }
  });
});
