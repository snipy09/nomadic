import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PLANS, planLimitsSqlRows } from '@nomadic/config';

// The latest plan_limits() (011, or a later migration that redefines it) must mirror
// packages/config, the single source of limits.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
const latestLimits = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => read(f).includes('-- BEGIN plan_limits')).pop()!;
const migration = read(latestLimits);
const migration011 = read('011_entitlements.sql');

function sqlRows(): string[] {
  const m = migration.match(/-- BEGIN plan_limits[^\n]*\n([\s\S]*?)\n\s*-- END plan_limits/);
  if (!m) throw new Error(`plan_limits markers not found in ${latestLimits}`);
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

type Row = { plan: string; appliesPerDay: number; feedJobs: number; learnTracks: number; practicePerDay: number; autonomousApply: boolean; resumes: number };

function parseRow(line: string): Row {
  const m = line.match(/^\('(\w+)',\s*(\w+),\s*(\w+),\s*(\w+),\s*(\w+),\s*(TRUE|FALSE),\s*(\w+)\),?$/);
  if (!m) throw new Error(`unparseable plan_limits row: ${line}`);
  const num = (v: string) => (v === 'NULL' ? Infinity : Number(v));
  return {
    plan: m[1],
    appliesPerDay: num(m[2]),
    feedJobs: num(m[3]),
    learnTracks: num(m[4]),
    practicePerDay: num(m[5]),
    autonomousApply: m[6] === 'TRUE',
    resumes: num(m[7]),
  };
}

describe('SQL plan limits mirror packages/config', () => {
  it('contains exactly the rows rendered from config (paste these if this fails)', () => {
    expect(sqlRows()).toEqual(planLimitsSqlRows());
  });

  it('every plan and limit matches field by field', () => {
    const rows = sqlRows().map(parseRow);
    expect(rows.map((r) => r.plan)).toEqual(PLANS.map((p) => p.id));
    for (const plan of PLANS) {
      const r = rows.find((x) => x.plan === plan.id)!;
      expect(r).toMatchObject({
        appliesPerDay: plan.limits.appliesPerDay,
        feedJobs: plan.limits.feedJobs,
        learnTracks: plan.limits.learnTracks,
        practicePerDay: plan.limits.practicePerDay,
        autonomousApply: plan.limits.autonomousApply,
        resumes: plan.limits.resumes,
      });
    }
  });

  it('grants only the two session-checked RPCs to anon', () => {
    const anonGrants = [...migration011.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO ([^;]+);/g)]
      .filter((m) => m[2].includes('anon'))
      .map((m) => m[1]);
    expect(anonGrants.sort()).toEqual(['consume_apply_quota', 'get_entitlements']);
    for (const fn of ['get_entitlements', 'consume_apply_quota']) {
      expect(migration011).toMatch(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?SECURITY DEFINER SET search_path = public, extensions`));
    }
  });
});

describe('SQL payment prices mirror packages/config', () => {
  const latestPayment = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => read(f).includes('FUNCTION public.handle_razorpay_payment_success')).pop()!;
  const sql = read(latestPayment);
  const price = (id: 'pro' | 'max') => PLANS.find((p) => p.id === id)!.priceInr;

  it('handle_razorpay_payment_success uses the config prices for Pro and Max', () => {
    expect(sql).toMatch(new RegExp(`c_price_pro CONSTANT NUMERIC := ${price('pro')};`));
    expect(sql).toMatch(new RegExp(`c_price_max CONSTANT NUMERIC := ${price('max')};`));
  });

  it('the webhook treats the Max price (in paise) as the Max threshold', () => {
    const webhook = readFileSync(path.join(dir, '../functions/razorpay-webhook/index.ts'), 'utf8');
    expect(webhook).toContain(`payment.amount >= ${price('max') * 100}`);
  });
});

describe('025 billing_list_payments', () => {
  const sql = read('025_billing_history.sql');
  it('is session-checked, returns no gateway payload, and is granted to anon', () => {
    expect(sql).toMatch(/IF NOT public\.billing_session_ok\(p_user_id, p_session_token, p_device_fingerprint\) THEN/);
    expect(sql).not.toMatch(/raw_payload/);
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public, extensions/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.billing_list_payments\(UUID, TEXT, TEXT\) TO anon, authenticated, service_role;/);
  });
});

describe('035 UPI direct payments', () => {
  const sql = read('035_upi_payments.sql');
  const price = (id: 'pro' | 'max') => PLANS.find((p) => p.id === id)!.priceInr;
  const fn = (name: string) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = sql.indexOf('$$;', start);
    return sql.slice(start, end);
  };

  it('charges the config prices for Pro and Max', () => {
    expect(sql).toContain(`c_upi_price_pro CONSTANT NUMERIC := ${price('pro')};`);
    expect(sql).toContain(`c_upi_price_max CONSTANT NUMERIC := ${price('max')};`);
  });

  it('client RPCs check the device session, admin RPCs check the admin caller', () => {
    for (const name of ['billing_upi_create_order', 'billing_upi_submit_utr', 'billing_upi_list_orders']) {
      expect(fn(name)).toMatch(/IF NOT public\.billing_session_ok\(p_user_id, p_session_token, p_device_fingerprint\) THEN/);
    }
    for (const name of ['admin_list_upi_orders', 'admin_review_upi_order']) {
      expect(fn(name)).toContain('public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint)');
    }
    for (const name of ['billing_upi_create_order', 'billing_upi_submit_utr', 'billing_upi_list_orders', 'admin_list_upi_orders', 'admin_review_upi_order']) {
      expect(fn(name)).toMatch(/SECURITY DEFINER SET search_path = public, extensions/);
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([A-Z, ]+\\) TO anon, authenticated, service_role;`));
    }
  });

  it('activates the plan through the 024 payment logic and writes an audit row', () => {
    const review = fn('admin_review_upi_order');
    expect(review).toContain('handle_razorpay_payment_success');
    expect(review).toMatch(/admin_audit/);
  });

  it('has a paste file without blank lines', () => {
    const paste = readFileSync(path.join(dir, '../baseline/apply_035.sql'), 'utf8');
    expect(paste).not.toMatch(/\r?\n[ \t]*\r?\n/);
    expect(paste).toContain('admin_review_upi_order');
  });
});

describe('037 first-month coupons', () => {
  const sql = read('037_billing_coupons.sql');
  const price = (id: 'pro' | 'max') => PLANS.find((p) => p.id === id)!.priceInr;

  it('keeps the config prices for orders without a coupon', () => {
    expect(sql).toContain(`c_upi_price_pro CONSTANT NUMERIC := ${price('pro')};`);
    expect(sql).toContain(`c_upi_price_max CONSTANT NUMERIC := ${price('max')};`);
  });

  it('stores only code hashes, never a code', () => {
    expect(sql).toMatch(/code_hash\s+TEXT PRIMARY KEY CHECK \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    const inserts = sql.split('\n').filter((l) => l.includes('INSERT INTO public.billing_coupons'));
    expect(inserts.every((l) => l.trimStart().startsWith('--'))).toBe(true);
    expect(sql).toContain('REVOKE ALL ON public.billing_coupons FROM anon, authenticated;');
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.billing_coupon_problem(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;");
  });

  it('re-checks the coupon on submit and on approval, and keeps the session and admin checks', () => {
    const at = (name: string) => sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`), sql.indexOf('$$;', sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)));
    for (const name of ['billing_upi_create_order', 'billing_upi_submit_utr', 'admin_review_upi_order']) {
      expect(at(name)).toContain('billing_coupon_problem(');
    }
    for (const name of ['billing_upi_create_order', 'billing_upi_submit_utr', 'billing_upi_list_orders']) {
      expect(at(name)).toMatch(/IF NOT public\.billing_session_ok\(p_user_id, p_session_token, p_device_fingerprint\) THEN/);
    }
    expect(at('admin_review_upi_order')).toContain('public.admin_check_caller(p_user_id, p_session_token, p_device_fingerprint)');
    expect(at('admin_review_upi_order')).toContain('handle_razorpay_payment_success');
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.billing_upi_create_order\(UUID, TEXT, TEXT, TEXT\);/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.billing_upi_create_order\(UUID, TEXT, TEXT, TEXT, TEXT\) TO anon, authenticated, service_role;/);
  });

  it('has a paste file without blank lines', () => {
    const paste = readFileSync(path.join(dir, '../baseline/apply_037.sql'), 'utf8');
    expect(paste).not.toMatch(/\r?\n[ \t]*\r?\n/);
    expect(paste).toContain('billing_coupon_problem');
  });
});
