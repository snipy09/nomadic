import type {
  AdminCreateUserInput,
  AdminMetrics,
  AdminUser,
  AssignPlanInput,
  BillingRecord,
  BillingRecordInput,
  CuratedResource,
  CuratedResourceInput,
  IdStatusInput,
} from '../../shared/ipc.js';
import {
  adminAssignPlanDb,
  addCuratedLearningResourceDb,
  deleteCuratedLearningResourceDb,
  getAllCachedUsersDb,
  getCuratedLearningResourcesDb,
} from '../db.js';
import { log } from './app-context.js';
import { ADMIN_NO_SERVICE_ERR, getAdminSupabase } from './supabase.js';
import { normalizeTier } from './auth.js';

// ── Admin Dashboard ─────────────────────────────────────────────────────────
// Every admin action goes through the SERVICE-ROLE Supabase client, which
// exists ONLY on the operator's machine (SUPABASE_SERVICE_ROLE_KEY). Customer
// builds never ship that key, so these handlers are inert there — and the
// renderer only exposes the Admin panel to role === 'admin' anyway.

export async function getUsers(): Promise<AdminUser[]> {
  const supabase = getAdminSupabase();
  let cloudUsers: any[] = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('id,email,full_name,subscription_tier,role,status,license_key,apps_count,created_at,expires_at,last_login')
        .order('created_at', { ascending: false });
      if (!error && data) {
        cloudUsers = data;
      }
    } catch (err: unknown) {
      log(`[Admin] Cloud users fetch note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const localUsers = getAllCachedUsersDb();
  const userMap = new Map<string, AdminUser>();

  // Populate local cache first
  for (const u of localUsers) {
    userMap.set(u.email.toLowerCase(), {
      id: String(u.id || u.email),
      email: String(u.email),
      fullName: String(u.fullName || u.email.split('@')[0]),
      role: u.role === 'admin' ? 'admin' : 'user',
      tier: normalizeTier(u.tier),
      licenseKey: String(u.licenseKey || ''),
      status: u.status === 'suspended' ? 'suspended' : 'active',
      appsCount: Number(u.appsCount || 0),
      createdAt: String(u.createdAt || new Date().toISOString()),
      expiresAt: u.expiresAt ? String(u.expiresAt) : undefined,
      lastLogin: u.lastLogin ? String(u.lastLogin) : undefined,
    });
  }

  // Cloud users take authoritative precedence
  for (const u of cloudUsers) {
    userMap.set(String(u['email']).toLowerCase(), {
      id: String(u['id'] || u['email']),
      email: String(u['email']),
      fullName: String(u['full_name'] ?? u['email'].split('@')[0]),
      role: u['role'] === 'admin' ? 'admin' : 'user',
      tier: normalizeTier(u['subscription_tier']),
      licenseKey: String(u['license_key'] ?? ''),
      status: u['status'] === 'suspended' ? 'suspended' : 'active',
      appsCount: Number(u['apps_count'] ?? 0),
      createdAt: String(u['created_at'] ?? new Date().toISOString()),
      expiresAt: u['expires_at'] ? String(u['expires_at']) : undefined,
      lastLogin: u['last_login'] ? String(u['last_login']) : undefined,
    });
  }

  return Array.from(userMap.values()).sort((a, b) => {
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });
}

export async function createUser(user: AdminCreateUserInput): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getAdminSupabase();
  try {
    const email = String(user['email'] ?? '').trim().toLowerCase();
    const fullName = String(user['fullName'] ?? '').trim();
    const rawTier = String(user['tier'] ?? 'lite').toLowerCase();
    const tier: string = normalizeTier(rawTier);
    const role = String(user['role'] ?? 'user').toLowerCase();

    if (!email || !email.includes('@')) return { success: false, error: 'A valid email is required.' };

    const tierPrefix = tier === 'lite' ? 'LIT' : tier === 'pro' ? 'PRO' : tier === 'max' ? 'MAX' : 'FRE';
    const r1 = Math.floor(1000 + Math.random() * 9000);
    const r2 = Math.floor(1000 + Math.random() * 9000);
    const licenseKey = String(user['licenseKey'] ?? `NOMADIC-${tierPrefix}-${r1}-${r2}`).trim();

    const expiresAt =
      tier === 'lifetime' || tier === 'free'
        ? null
        : new Date(Date.now() + 30 * 86400000).toISOString();

    let insertedId: string | undefined;
    if (supabase) {
      const { data: inserted, error: insErr } = await supabase
        .from('users_profile')
        .upsert({
          email,
          full_name: fullName,
          subscription_tier: tier,
          role,
          status: 'active',
          license_key: licenseKey,
          apps_count: 0,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' })
        .select('id')
        .maybeSingle();

      if (!insErr && inserted) {
        insertedId = String(inserted['id']);
      }
    }

    log(`[Admin] Provisioned user ${email} (${tier}, ${licenseKey})`);
    return { success: true, id: insertedId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Admin] Create user error: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function updateUserStatus(data: IdStatusInput): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();
  try {
    const status = data.status === 'suspended' ? 'suspended' : 'active';
    if (supabase) {
      await supabase.from('users_profile').update({ status }).eq('id', String(data.id));
    }
    log(`[Admin] User ${data.id} status -> ${status}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Admin] Update user status error: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function deleteUser(id: number | string): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();
  try {
    if (supabase) {
      await supabase.from('users_profile').delete().eq('id', String(id));
    }
    log(`[Admin] Deleted user ${id}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Admin] Delete user error: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function getBilling(): Promise<BillingRecord[]> {
  const supabase = getAdminSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('billing_records')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((b: Record<string, unknown>) => ({
      id: String(b['id']),
      userEmail: String(b['user_email']),
      amount: String(b['amount']),
      plan: String(b['plan']),
      status: (['paid', 'pending', 'refunded'].includes(String(b['status'])) ? b['status'] : 'paid') as
        | 'paid'
        | 'pending'
        | 'refunded',
      paymentMethod: String(b['payment_method'] ?? ''),
      createdAt: String(b['created_at'] ?? ''),
    }));
  } catch (err: unknown) {
    log(`[Admin] Fetch billing error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function createBillingRecord(record: BillingRecordInput): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: ADMIN_NO_SERVICE_ERR };
  try {
    const { error } = await supabase.from('billing_records').insert({
      user_email: String(record['userEmail'] ?? ''),
      amount: String(record['amount'] ?? '₹149'),
      plan: String(record['plan'] ?? 'Seeker Pro'),
      status: 'paid',
      payment_method: String(record['paymentMethod'] ?? 'Manual Admin Grant'),
    });
    if (error) throw error;
    log(`[Admin] Recorded transaction: ${record['amount']} for ${record['userEmail']}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Admin] Create billing error: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function getMetrics(): Promise<AdminMetrics> {
  const empty = {
    totalUsers: 0, activeUsers: 0, totalApps: 0, totalRevenue: '₹0',
    mrr: '₹0/mo', trialUsers: 0, proUsers: 0, maxUsers: 0, lifetimeUsers: 0,
  };
  const supabase = getAdminSupabase();
  if (!supabase) return empty;
  try {
    const { data: users, error: uErr } = await supabase
      .from('users_profile')
      .select('subscription_tier,status,apps_count');
    if (uErr) throw uErr;

    const list = (users ?? []) as Array<Record<string, unknown>>;
    const totalUsers = list.length;
    const activeUsers = list.filter((u) => String(u['status']) === 'active').length;
    const totalApps = list.reduce((acc, u) => acc + (Number(u['apps_count']) || 0), 0);
    const trialUsers = list.filter((u) => normalizeTier(String(u['subscription_tier'])) === 'free').length;
    const proUsers = list.filter((u) => normalizeTier(String(u['subscription_tier'])) === 'pro').length;
    const maxUsers = list.filter((u) => normalizeTier(String(u['subscription_tier'])) === 'max').length;
    const lifetimeUsers = list.filter((u) => String(u['subscription_tier']) === 'lifetime').length;

    const mrr = `₹${(proUsers * 249 + maxUsers * 599).toLocaleString('en-IN')}/mo`;
    const totalRevenue = `₹${(proUsers * 249 + maxUsers * 599).toLocaleString('en-IN')}`;

    return { totalUsers, activeUsers, totalApps, totalRevenue, mrr, trialUsers, proUsers, maxUsers, lifetimeUsers };
  } catch (err: unknown) {
    log(`[Admin] Metrics computation error: ${err instanceof Error ? err.message : String(err)}`);
    return empty;
  }
}

export async function assignPlan(data: AssignPlanInput): Promise<{ success: boolean }> {
  log(`[Admin Plan Assignment] Updating user ${data.email || data.userId} to ${data.planTier}...`);
  const ok = adminAssignPlanDb(data.email || data.userId, data.planTier, data.expiresAt);

  const supabase = getAdminSupabase();
  if (supabase) {
    try {
      if (data.email) {
        await supabase
          .from('users_profile')
          .update({
            subscription_tier: data.planTier,
            expires_at: data.expiresAt || null,
            updated_at: new Date().toISOString(),
          })
          .eq('email', data.email.toLowerCase());
      } else if (data.userId) {
        await supabase
          .from('users_profile')
          .update({
            subscription_tier: data.planTier,
            expires_at: data.expiresAt || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', String(data.userId));
      }
      log(`[Admin Plan Assignment] Synced user plan to Supabase ✓`);
    } catch (err: any) {
      log(`[Admin Plan Assignment] Supabase sync note: ${err?.message}`);
    }
  }

  return { success: ok };
}

// ── Admin Learning Resource Management ──────────────────────────────────────
export function getLearningResources(): CuratedResource[] {
  return getCuratedLearningResourcesDb();
}

export function addLearningResource(res: CuratedResourceInput): { success: boolean; id?: number } {
  const result = addCuratedLearningResourceDb(res);
  log(`[Admin Curator] Added resource: "${res.title}" for topic ${res.topic}`);
  return result;
}

export function deleteLearningResource(id: number | string): { success: boolean } {
  const ok = deleteCuratedLearningResourceDb(id);
  log(`[Admin Curator] Removed resource #${id}`);
  return { success: ok };
}
