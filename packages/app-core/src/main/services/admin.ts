import type {
  AdminAuditEntry,
  AdminAuditPage,
  AdminAuditQuery,
  AdminAuditTargetType,
  AdminChangeResult,
  AdminContentHistoryQuery,
  AdminContentList,
  AdminContentQuery,
  AdminContentVersion,
  AdminLessonItem,
  AdminLessonUpdate,
  AdminPracticeItem,
  AdminResourceItem,
  AdminResourceStatusUpdate,
  AdminResult,
  AdminSetPlanInput,
  AdminSetStatusInput,
  AdminSkillItem,
  AdminStatusChangeResult,
  AdminUpiOrder,
  AdminUpiQuery,
  AdminUpiReviewInput,
  AdminUpiReviewResult,
  AdminUpiStatus,
  AdminUserQuery,
  AdminUserRow,
  AdminUsersPage,
  AdminVersionResult,
  ContentStatus,
  ResourceStatus,
  ScrapeHealth,
  ScrapeRunRow,
  ScrapeSourceHealth,
} from '../../shared/admin.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';

// ── Admin tools (F12) ───────────────────────────────────────────────────────
// No service-role key: every call is a SECURITY DEFINER RPC (migration 014)
// made with the anon key plus this device's session. The server verifies the
// session AND users_profile.role = 'admin' on every call, and writes the audit
// log row for every change. Nothing here trusts the renderer's idea of the
// user's role.

/** User-facing text for every error code the admin RPCs (or this module) return. */
export const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has ended. Sign in again to use admin tools.',
  forbidden: 'This account does not have admin access.',
  no_session: 'Sign in to use admin tools.',
  not_configured: 'Cloud access is not configured in this build, so admin tools are unavailable.',
  server_outdated: 'The server does not have the admin functions yet (migration 014). Ask the operator to apply it.',
  network: 'Could not reach the server. Check your connection and try again.',
  bad_response: 'The server sent an unexpected response. Try again.',
  reason_required: 'Add a reason (3 to 500 characters). It is saved in the audit log.',
  cannot_change_self: 'You cannot change your own account. Ask another admin to do it.',
  invalid_plan: 'That plan cannot be assigned.',
  invalid_expiry: 'Pick an expiry date in the future, or choose no expiry.',
  invalid_status: 'That status is not allowed.',
  not_found: 'This record no longer exists. Refresh and try again.',
  no_change: 'Nothing changed, so nothing was saved.',
  version_conflict: 'This was changed by someone else since you opened it. Reload to get the latest version.',
  invalid_transition: 'That status change is not allowed. Lessons go draft, then review, then published.',
  urls_not_allowed: 'Lesson text cannot contain links. Links come only from curated resources.',
  invalid_content: 'Check the title (up to 200 characters), text (up to 20,000) and key points (up to 20, 300 characters each).',
  link_check_required: 'Only resources that passed their last link check can be made active.',
  invalid_kind: 'Unknown content type.',
  invalid_decision: 'Choose approve or reject.',
  not_submitted: 'This order is not waiting for review any more. Refresh the list.',
  payment_failed: 'The plan could not be activated for this payment. Check the user account and try again.',
};

export function adminErrorMessage(code: string): string {
  return ADMIN_ERROR_MESSAGES[code] ?? `The server refused the request (${code}).`;
}

function fail<T>(code: string, currentVersion?: number): AdminResult<T> {
  return currentVersion === undefined
    ? { ok: false, code, error: adminErrorMessage(code) }
    : { ok: false, code, error: adminErrorMessage(code), currentVersion };
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object') : []);
const obj = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);

/**
 * Calls one admin RPC with the active device session. Returns the RPC's JSON
 * body when it reports ok, otherwise a typed failure with a readable message.
 */
export async function callAdminRpc(fn: string, params: Record<string, unknown>): Promise<AdminResult<Row>> {
  const session = getActiveSyncSession();
  if (!session) return fail('no_session');
  const supabase = getAnonSupabase();
  if (!supabase) return fail('not_configured');

  try {
    const { data, error } = await supabase.rpc(fn, {
      p_user_id: session.userId,
      p_session_token: session.sessionToken,
      p_device_fingerprint: session.deviceFingerprint,
      ...params,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      const missing = code === 'PGRST202' || code === '42883' || /could not find the function/i.test(error.message ?? '');
      log(`[Admin] ${fn} failed: ${error.message}`);
      return fail(missing ? 'server_outdated' : 'network');
    }
    const body = obj(Array.isArray(data) ? data[0] : data);
    if (!body) return fail('bad_response');
    if (body['ok'] !== true) {
      const code = str(body['error']) || 'bad_response';
      if (code !== 'no_change') log(`[Admin] ${fn} refused: ${code}`);
      return fail(code, body['current_version'] === undefined ? undefined : num(body['current_version']));
    }
    return { ok: true, data: body };
  } catch (err: unknown) {
    log(`[Admin] ${fn} error: ${err instanceof Error ? err.message : String(err)}`);
    return fail('network');
  }
}

function mapOk<T>(res: AdminResult<Row>, map: (body: Row) => T): AdminResult<T> {
  return res.ok ? { ok: true, data: map(res.data) } : res;
}

// ── Row mappers (exported for tests) ────────────────────────────────────────

export function toUserRow(r: Row): AdminUserRow {
  return {
    id: str(r['id']),
    email: str(r['email']),
    fullName: str(r['full_name']),
    tier: str(r['subscription_tier']) || 'trial',
    role: r['role'] === 'admin' ? 'admin' : 'user',
    status: r['status'] === 'suspended' ? 'suspended' : 'active',
    expiresAt: strOrNull(r['expires_at']),
    createdAt: strOrNull(r['created_at']),
    lastLogin: strOrNull(r['last_login']),
    appsCount: num(r['apps_count']),
    activeSessions: num(r['active_sessions']),
  };
}

const AUDIT_TARGETS: readonly AdminAuditTargetType[] = ['user', 'lesson', 'resource', 'admin'];

export function toAuditEntry(r: Row): AdminAuditEntry {
  const t = str(r['target_type']) as AdminAuditTargetType;
  return {
    id: num(r['id']),
    actorId: strOrNull(r['actor_id']),
    actorEmail: strOrNull(r['actor_email']),
    action: str(r['action']),
    targetType: AUDIT_TARGETS.includes(t) ? t : 'admin',
    targetId: strOrNull(r['target_id']),
    targetLabel: strOrNull(r['target_label']),
    reason: strOrNull(r['reason']),
    before: obj(r['before']),
    after: obj(r['after']),
    createdAt: str(r['created_at']),
  };
}

export function toScrapeRun(r: Row): ScrapeRunRow {
  return {
    id: str(r['id']),
    runId: str(r['run_id']),
    source: str(r['source']),
    tier: num(r['tier']),
    status: r['status'] === 'error' ? 'error' : 'ok',
    startedAt: str(r['started_at']),
    finishedAt: str(r['finished_at']),
    durationMs: num(r['duration_ms']),
    fetched: num(r['fetched']),
    valid: num(r['valid']),
    invalid: num(r['invalid']),
    duplicates: num(r['duplicates']),
    linkFailed: num(r['link_failed']),
    upserted: num(r['upserted']),
    expired: num(r['expired']),
    error: strOrNull(r['error']),
    alert: strOrNull(r['alert']),
    published: r['published'] !== false,
  };
}

export function toSourceHealth(r: Row): ScrapeSourceHealth {
  const last = r['last_status'];
  return {
    source: str(r['source']),
    runs: num(r['runs']),
    failures: num(r['failures']),
    lastRunAt: strOrNull(r['last_run_at']),
    lastStatus: last === 'ok' || last === 'error' ? last : null,
    lastOkAt: strOrNull(r['last_ok_at']),
    lastError: strOrNull(r['last_error']),
    fetched: num(r['fetched']),
    upserted: num(r['upserted']),
    linkFailed: num(r['link_failed']),
    avgDurationMs: num(r['avg_duration_ms']),
  };
}

export function toScrapeHealth(body: Row): ScrapeHealth {
  const jobs = obj(body['active_jobs_by_source']) ?? {};
  return {
    since: str(body['since']),
    runs: rows(body['runs']).map(toScrapeRun),
    sources: rows(body['sources']).map(toSourceHealth),
    activeJobsBySource: Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, num(v)])),
  };
}

const toSkill = (r: Row): AdminSkillItem => ({
  id: str(r['id']),
  name: str(r['name']),
  category: str(r['category']),
  level: num(r['level']),
  estimatedHours: num(r['estimated_hours']),
  lessonCount: num(r['lesson_count']),
  resourceCount: num(r['resource_count']),
  practiceCount: num(r['practice_count']),
  updatedAt: strOrNull(r['updated_at']),
});

const toLesson = (r: Row): AdminLessonItem => ({
  id: str(r['id']),
  skillId: str(r['skill_id']),
  title: str(r['title']),
  status: str(r['status']) as ContentStatus,
  version: num(r['version']) || 1,
  aiDrafted: r['ai_drafted'] === true,
  isCore: r['is_core'] !== false,
  estimatedMinutes: num(r['estimated_minutes']),
  summaryMd: str(r['summary_md']),
  keyPoints: strList(r['key_points']),
  resourceIds: strList(r['resource_ids']),
  updatedAt: strOrNull(r['updated_at']),
});

const toResource = (r: Row): AdminResourceItem => ({
  id: str(r['id']),
  title: str(r['title']),
  url: str(r['url']),
  provider: str(r['provider']),
  type: str(r['type']),
  status: str(r['status']) as ResourceStatus,
  version: num(r['version']) || 1,
  skillIds: strList(r['skill_ids']),
  lastChecked: strOrNull(r['last_checked']),
  httpStatus: numOrNull(r['http_status']),
  failCount: num(r['fail_count']),
  source: str(r['source']),
  updatedAt: strOrNull(r['updated_at']),
});

const toPractice = (r: Row): AdminPracticeItem => ({
  id: str(r['id']),
  skillId: str(r['skill_id']),
  lessonId: strOrNull(r['lesson_id']),
  kind: str(r['kind']),
  difficulty: str(r['difficulty']),
  status: str(r['status']) as ContentStatus,
  version: num(r['version']) || 1,
  aiDrafted: r['ai_drafted'] === true,
  prompt: str(r['prompt']),
});

export function toContentList(kind: AdminContentQuery['kind'], body: Row): AdminContentList {
  const items = rows(body['items']);
  switch (kind) {
    case 'skills':
      return { kind, items: items.map(toSkill) };
    case 'lessons':
      return { kind, items: items.map(toLesson) };
    case 'resources':
      return { kind, items: items.map(toResource) };
    case 'practice':
      return { kind, items: items.map(toPractice) };
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────

export async function listUsers(q: AdminUserQuery): Promise<AdminResult<AdminUsersPage>> {
  const res = await callAdminRpc('admin_list_users', {
    p_query: q.query?.trim() || null,
    p_tier: q.tier || null,
    p_status: q.status || null,
    p_limit: q.limit ?? 50,
    p_offset: q.offset ?? 0,
  });
  return mapOk(res, (b) => ({ users: rows(b['users']).map(toUserRow), total: num(b['total']) }));
}

export async function setUserPlan(input: AdminSetPlanInput): Promise<AdminResult<AdminChangeResult>> {
  const res = await callAdminRpc('admin_set_user_plan', {
    p_target_id: input.targetId,
    p_tier: input.tier,
    p_expires_at: input.tier === 'lifetime' ? null : input.expiresAt,
    p_reason: input.reason.trim(),
  });
  if (res.ok) log(`[Admin] Plan for ${input.targetId} set to ${input.tier} (audit #${num(res.data['audit_id'])})`);
  return mapOk(res, (b) => ({ auditId: num(b['audit_id']) }));
}

export async function setUserStatus(input: AdminSetStatusInput): Promise<AdminResult<AdminStatusChangeResult>> {
  const res = await callAdminRpc('admin_set_user_status', {
    p_target_id: input.targetId,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  if (res.ok) log(`[Admin] Status for ${input.targetId} set to ${input.status} (audit #${num(res.data['audit_id'])})`);
  return mapOk(res, (b) => ({ auditId: num(b['audit_id']), sessionsEnded: num(b['sessions_ended']) }));
}

export async function listAudit(q: AdminAuditQuery): Promise<AdminResult<AdminAuditPage>> {
  const res = await callAdminRpc('admin_list_audit', {
    p_limit: q.limit ?? 50,
    p_before_id: q.beforeId ?? null,
    p_target_type: q.targetType ?? null,
    p_target_id: q.targetId ?? null,
  });
  return mapOk(res, (b) => ({ entries: rows(b['entries']).map(toAuditEntry), hasMore: b['has_more'] === true }));
}

export async function scrapeHealth(days: number): Promise<AdminResult<ScrapeHealth>> {
  return mapOk(await callAdminRpc('admin_scrape_health', { p_days: days }), toScrapeHealth);
}

export async function listContent(q: AdminContentQuery): Promise<AdminResult<AdminContentList>> {
  const res = await callAdminRpc('admin_list_content', {
    p_kind: q.kind,
    p_status: q.status || null,
    p_query: q.query?.trim() || null,
  });
  return mapOk(res, (b) => toContentList(q.kind, b));
}

export async function updateLesson(input: AdminLessonUpdate): Promise<AdminResult<AdminVersionResult>> {
  const res = await callAdminRpc('admin_update_lesson', {
    p_lesson_id: input.id,
    p_expected_version: input.expectedVersion,
    p_title: input.title.trim(),
    p_summary_md: input.summaryMd.trim(),
    p_key_points: input.keyPoints.map((k) => k.trim()).filter(Boolean),
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  return mapOk(res, (b) => ({ auditId: num(b['audit_id']), version: num(b['version']) }));
}

export async function setResourceStatus(input: AdminResourceStatusUpdate): Promise<AdminResult<AdminVersionResult>> {
  const res = await callAdminRpc('admin_set_resource_status', {
    p_resource_id: input.id,
    p_expected_version: input.expectedVersion,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  return mapOk(res, (b) => ({ auditId: num(b['audit_id']), version: num(b['version']) }));
}

const UPI_STATUSES: readonly AdminUpiStatus[] = ['awaiting_payment', 'submitted', 'approved', 'rejected'];

export function toUpiOrder(r: Row): AdminUpiOrder {
  const status = str(r['status']) as AdminUpiStatus;
  return {
    orderId: str(r['order_id']),
    userId: str(r['user_id']),
    email: str(r['email']),
    fullName: str(r['full_name']),
    plan: r['plan'] === 'max' ? 'max' : 'pro',
    amountInr: num(r['amount_inr']),
    reference: str(r['reference']),
    utr: strOrNull(r['utr']),
    status: UPI_STATUSES.includes(status) ? status : 'submitted',
    createdAt: strOrNull(r['created_at']),
    submittedAt: strOrNull(r['submitted_at']),
    reviewedAt: strOrNull(r['reviewed_at']),
    reviewNote: strOrNull(r['review_note']),
  };
}

const UPI_OUTDATED = 'The server does not have UPI payments yet (migration 035). Ask the operator to apply it.';

/** The generic server_outdated text names 014; UPI calls need 035. */
function upiOutdated<T>(res: AdminResult<T>): AdminResult<T> {
  return !res.ok && res.code === 'server_outdated' ? { ...res, error: UPI_OUTDATED } : res;
}

export async function listUpiOrders(q: AdminUpiQuery): Promise<AdminResult<AdminUpiOrder[]>> {
  const res = upiOutdated(await callAdminRpc('admin_list_upi_orders', { p_status: q.status ?? null }));
  return mapOk(res, (b) => rows(b['orders']).map(toUpiOrder));
}

export async function reviewUpiOrder(input: AdminUpiReviewInput): Promise<AdminResult<AdminUpiReviewResult>> {
  const res = upiOutdated(await callAdminRpc('admin_review_upi_order', {
    p_order_id: input.orderId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  }));
  if (res.ok) log(`[Admin] UPI order ${input.orderId} ${input.decision}d (audit #${num(res.data['audit_id'])})`);
  return mapOk(res, (b) => ({
    auditId: num(b['audit_id']),
    status: b['status'] === 'rejected' ? 'rejected' : 'approved',
    tier: strOrNull(b['tier']),
    expiresAt: strOrNull(b['expires_at']),
  }));
}

export async function contentHistory(q: AdminContentHistoryQuery): Promise<AdminResult<AdminContentVersion[]>> {
  const res = await callAdminRpc('admin_content_history', { p_content_type: q.type, p_content_id: q.id });
  return mapOk(res, (b) =>
    rows(b['versions']).map((v) => ({
      version: num(v['version']),
      snapshot: obj(v['snapshot']) ?? {},
      editedByEmail: strOrNull(v['edited_by_email']),
      createdAt: str(v['created_at']),
    }))
  );
}
