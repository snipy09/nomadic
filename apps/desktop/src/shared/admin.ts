// Admin and content tools (F12): types shared by the main process and renderer.
// Every admin call is a session-checked SECURITY DEFINER RPC (migration 014);
// the server re-checks the session and users_profile.role = 'admin' on each one.

/** Plans an admin may assign (matches the users_profile.subscription_tier check). */
export const ADMIN_ASSIGNABLE_TIERS = ['trial', 'pro', 'max', 'lifetime'] as const;
export type AdminAssignableTier = (typeof ADMIN_ASSIGNABLE_TIERS)[number];

export const ADMIN_USER_STATUSES = ['active', 'suspended'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const CONTENT_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const RESOURCE_STATUSES = ['unverified', 'active', 'broken', 'retired'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const ADMIN_CONTENT_KINDS = ['skills', 'lessons', 'resources', 'practice'] as const;
export type AdminContentKind = (typeof ADMIN_CONTENT_KINDS)[number];

/** Reason recorded in the audit log with every change (server enforces the same bounds). */
export const ADMIN_REASON_MIN = 3;
export const ADMIN_REASON_MAX = 500;

/** Result of every admin call. `code` is the server's error code (or a client-side one). */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string; currentVersion?: number };

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  tier: string;
  role: 'admin' | 'user';
  status: AdminUserStatus;
  expiresAt: string | null;
  createdAt: string | null;
  lastLogin: string | null;
  appsCount: number;
  activeSessions: number;
}

export interface AdminUserQuery {
  query?: string;
  tier?: string;
  status?: AdminUserStatus;
  limit?: number;
  offset?: number;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
}

export interface AdminSetPlanInput {
  targetId: string;
  tier: AdminAssignableTier;
  /** ISO timestamp, or null for no expiry. Ignored for lifetime. */
  expiresAt: string | null;
  reason: string;
}

export interface AdminSetStatusInput {
  targetId: string;
  status: AdminUserStatus;
  reason: string;
}

export interface AdminChangeResult {
  auditId: number;
}

export interface AdminStatusChangeResult extends AdminChangeResult {
  sessionsEnded: number;
}

export type AdminAuditTargetType = 'user' | 'lesson' | 'resource' | 'admin';

export interface AdminAuditEntry {
  id: number;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: AdminAuditTargetType;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditQuery {
  limit?: number;
  beforeId?: number;
  targetType?: AdminAuditTargetType;
  targetId?: string;
}

export interface AdminAuditPage {
  entries: AdminAuditEntry[];
  hasMore: boolean;
}

export interface ScrapeRunRow {
  id: string;
  runId: string;
  source: string;
  tier: number;
  status: 'ok' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fetched: number;
  valid: number;
  invalid: number;
  duplicates: number;
  linkFailed: number;
  upserted: number;
  expired: number;
  error: string | null;
  alert: string | null;
  published: boolean;
}

export interface ScrapeSourceHealth {
  source: string;
  runs: number;
  failures: number;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastOkAt: string | null;
  lastError: string | null;
  fetched: number;
  upserted: number;
  linkFailed: number;
  avgDurationMs: number;
}

export interface ScrapeHealth {
  since: string;
  runs: ScrapeRunRow[];
  sources: ScrapeSourceHealth[];
  activeJobsBySource: Record<string, number>;
}

export interface AdminSkillItem {
  id: string;
  name: string;
  category: string;
  level: number;
  estimatedHours: number;
  lessonCount: number;
  resourceCount: number;
  practiceCount: number;
  updatedAt: string | null;
}

export interface AdminLessonItem {
  id: string;
  skillId: string;
  title: string;
  status: ContentStatus;
  version: number;
  aiDrafted: boolean;
  isCore: boolean;
  estimatedMinutes: number;
  summaryMd: string;
  keyPoints: string[];
  resourceIds: string[];
  updatedAt: string | null;
}

export interface AdminResourceItem {
  id: string;
  title: string;
  url: string;
  provider: string;
  type: string;
  status: ResourceStatus;
  version: number;
  skillIds: string[];
  lastChecked: string | null;
  httpStatus: number | null;
  failCount: number;
  source: string;
  updatedAt: string | null;
}

export interface AdminPracticeItem {
  id: string;
  skillId: string;
  lessonId: string | null;
  kind: string;
  difficulty: string;
  status: ContentStatus;
  version: number;
  aiDrafted: boolean;
  prompt: string;
}

export type AdminContentList =
  | { kind: 'skills'; items: AdminSkillItem[] }
  | { kind: 'lessons'; items: AdminLessonItem[] }
  | { kind: 'resources'; items: AdminResourceItem[] }
  | { kind: 'practice'; items: AdminPracticeItem[] };

export interface AdminContentQuery {
  kind: AdminContentKind;
  status?: string;
  query?: string;
}

export interface AdminLessonUpdate {
  id: string;
  expectedVersion: number;
  title: string;
  summaryMd: string;
  keyPoints: string[];
  status: ContentStatus;
  reason: string;
}

export interface AdminResourceStatusUpdate {
  id: string;
  expectedVersion: number;
  status: ResourceStatus;
  reason: string;
}

export interface AdminVersionResult extends AdminChangeResult {
  version: number;
}

export interface AdminContentHistoryQuery {
  type: 'lesson' | 'resource';
  id: string;
}

export interface AdminContentVersion {
  version: number;
  snapshot: Record<string, unknown>;
  editedByEmail: string | null;
  createdAt: string;
}
