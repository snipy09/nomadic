import type { Tone } from '@nomadic/ui';
import {
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  type AdminAssignableTier,
  type AdminAuditEntry,
  type AdminResourceItem,
  type ContentStatus,
  type ResourceStatus,
  type ScrapeSourceHealth,
} from '../../../shared/admin';

// Pure helpers for the admin screens. The server is the authority on every rule
// here (migration 014); these only shape the UI so invalid choices aren't offered.

export const TIER_LABELS: Record<string, string> = {
  trial: 'Free trial',
  pro: 'Pro',
  max: 'Max',
  lifetime: 'Lifetime (Max, no expiry)',
  enterprise: 'Enterprise (legacy)',
};

export const tierLabel = (tier: string): string => TIER_LABELS[tier] ?? tier;

export const PLAN_OPTIONS: { value: AdminAssignableTier; label: string }[] = [
  { value: 'trial', label: TIER_LABELS.trial },
  { value: 'pro', label: TIER_LABELS.pro },
  { value: 'max', label: TIER_LABELS.max },
  { value: 'lifetime', label: TIER_LABELS.lifetime },
];

/** Error text for a reason, or null when it is acceptable. */
export function validateReason(reason: string): string | null {
  const n = reason.trim().length;
  if (n < ADMIN_REASON_MIN) return `Add a reason of at least ${ADMIN_REASON_MIN} characters. It is saved in the audit log.`;
  if (n > ADMIN_REASON_MAX) return `Keep the reason under ${ADMIN_REASON_MAX} characters.`;
  return null;
}

/** `YYYY-MM-DD` for a date input, from an ISO timestamp (local date). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** End of the chosen local day as ISO, or null for an empty input. */
export function fromDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, 23, 59, 59);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Error for a plan change form, or null. */
export function validatePlanChange(tier: AdminAssignableTier, expiryInput: string, now = new Date()): string | null {
  if (tier === 'lifetime' || !expiryInput) return null;
  const iso = fromDateInput(expiryInput);
  if (!iso) return 'Enter a valid date.';
  if (new Date(iso).getTime() <= now.getTime()) return 'Pick a date in the future, or leave it empty for no expiry.';
  return null;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Unknown';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0 s';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** Plan expiry state for a user row. */
export function expiryLabel(expiresAt: string | null, now = Date.now()): { text: string; tone: Tone } {
  if (!expiresAt) return { text: 'No expiry', tone: 'neutral' };
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return { text: 'Unknown', tone: 'neutral' };
  if (t <= now) return { text: `Expired ${formatDate(expiresAt)}`, tone: 'danger' };
  if (t - now < 7 * 86_400_000) return { text: `Expires ${formatDate(expiresAt)}`, tone: 'warning' };
  return { text: `Expires ${formatDate(expiresAt)}`, tone: 'neutral' };
}

// ── Audit log ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  'user.plan_changed': 'Changed plan',
  'user.suspended': 'Suspended account',
  'user.reactivated': 'Reactivated account',
  'lesson.edited': 'Edited lesson',
  'lesson.status_changed': 'Changed lesson status',
  'resource.status_changed': 'Changed resource status',
  'admin.denied': 'Refused admin access',
};

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

export function actionTone(action: string): Tone {
  if (action === 'admin.denied' || action === 'user.suspended') return 'danger';
  if (action === 'user.reactivated') return 'success';
  if (action.startsWith('lesson.') || action.startsWith('resource.')) return 'accent';
  return 'neutral';
}

const val = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'none';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDate(v);
  return String(v);
};

/** One line describing what changed, from the entry's before/after snapshots. */
export function describeChange(entry: Pick<AdminAuditEntry, 'action' | 'before' | 'after'>): string {
  const b = entry.before ?? {};
  const a = entry.after ?? {};
  switch (entry.action) {
    case 'user.plan_changed': {
      const parts = [`${tierLabel(val(b['tier']))} to ${tierLabel(val(a['tier']))}`];
      if (val(b['expires_at']) !== val(a['expires_at'])) {
        parts.push(`expiry ${val(b['expires_at'])} to ${val(a['expires_at'])}`);
      }
      return parts.join(', ');
    }
    case 'user.suspended': {
      const n = Number(a['sessions_ended'] ?? 0);
      return n > 0 ? `Signed out of ${n} device${n === 1 ? '' : 's'}` : 'No active devices';
    }
    case 'user.reactivated':
      return 'Account can sign in again';
    case 'lesson.edited':
    case 'lesson.status_changed': {
      const changed = Array.isArray(a['changed']) ? (a['changed'] as unknown[]).map(String) : [];
      const fields = changed.map((c) => (c === 'summary_md' ? 'text' : c.replace('_', ' '))).join(', ');
      const status = b['status'] !== a['status'] ? `, ${val(b['status'])} to ${val(a['status'])}` : '';
      return `v${val(b['version'])} to v${val(a['version'])}${fields ? ` (${fields})` : ''}${status}`;
    }
    case 'resource.status_changed':
      return `${val(b['status'])} to ${val(a['status'])} (v${val(b['version'])} to v${val(a['version'])})`;
    case 'admin.denied':
      return 'A signed-in account without the admin role tried to use admin tools';
    default:
      return '';
  }
}

// ── Scraper health ───────────────────────────────────────────────────────────

export interface SourceHealthView extends ScrapeSourceHealth {
  activeJobs: number;
  failureRate: number;
  tone: Tone;
  label: string;
}

/** Joins per-source run stats with active job counts; failing sources first. */
export function buildSourceHealth(
  sources: ScrapeSourceHealth[],
  activeJobsBySource: Record<string, number>,
): SourceHealthView[] {
  const seen = new Set<string>();
  const views: SourceHealthView[] = sources.map((s) => {
    seen.add(s.source);
    const failureRate = s.runs > 0 ? s.failures / s.runs : 0;
    const failing = s.lastStatus === 'error';
    const tone: Tone = failing ? 'danger' : failureRate > 0 ? 'warning' : 'success';
    const label = failing ? 'Failing' : failureRate > 0 ? 'Recovered' : 'Healthy';
    return { ...s, activeJobs: activeJobsBySource[s.source] ?? 0, failureRate, tone, label };
  });
  // Sources with live jobs but no runs in the window: stale, not healthy.
  for (const [source, n] of Object.entries(activeJobsBySource)) {
    if (seen.has(source)) continue;
    views.push({
      source, runs: 0, failures: 0, lastRunAt: null, lastStatus: null, lastOkAt: null, lastError: null,
      fetched: 0, upserted: 0, linkFailed: 0, avgDurationMs: 0, activeJobs: n, failureRate: 0,
      tone: 'warning', label: 'No recent runs',
    });
  }
  const rank = (v: SourceHealthView) => (v.tone === 'danger' ? 0 : v.tone === 'warning' ? 1 : 2);
  return views.sort((x, y) => rank(x) - rank(y) || x.source.localeCompare(y.source));
}

export const formatPercent = (r: number): string => `${Math.round(r * 100)}%`;

// ── Content ──────────────────────────────────────────────────────────────────

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  published: 'Published',
  archived: 'Archived',
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  unverified: 'Unverified',
  active: 'Active',
  broken: 'Broken link',
  retired: 'Retired',
};

export function contentStatusTone(status: string): Tone {
  switch (status) {
    case 'published':
    case 'active':
      return 'success';
    case 'review':
    case 'unverified':
      return 'warning';
    case 'broken':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Same workflow as admin_content_transition_ok in migration 014. */
const LESSON_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'published'],
  published: ['review', 'archived'],
  archived: ['draft'],
};

/** Statuses a lesson may be saved with from `from` (including staying put). */
export function allowedLessonStatuses(from: ContentStatus): ContentStatus[] {
  return [from, ...(LESSON_TRANSITIONS[from] ?? [])];
}

/** True when the resource passed its last link check (required to make it active). */
export function linkCheckPassed(r: Pick<AdminResourceItem, 'lastChecked' | 'httpStatus'>): boolean {
  return !!r.lastChecked && r.httpStatus !== null && r.httpStatus >= 200 && r.httpStatus < 400;
}

export function resourceStatusOptions(r: AdminResourceItem): { value: ResourceStatus; label: string; disabled?: boolean }[] {
  const ok = linkCheckPassed(r);
  return (Object.keys(RESOURCE_STATUS_LABELS) as ResourceStatus[]).map((s) => ({
    value: s,
    label: s === 'active' && !ok ? `${RESOURCE_STATUS_LABELS[s]} (needs a passing link check)` : RESOURCE_STATUS_LABELS[s],
    disabled: s === 'active' && !ok,
  }));
}

export interface LessonDraft {
  title: string;
  summaryMd: string;
  keyPoints: string;
  status: ContentStatus;
}

export type LessonDraftErrors = Partial<Record<keyof LessonDraft, string>>;

const URL_RE = /https?:\/\//i;

/** Key points are edited one per line. */
export const parseKeyPoints = (text: string): string[] =>
  text.split('\n').map((l) => l.trim()).filter(Boolean);

export function validateLessonDraft(d: LessonDraft): LessonDraftErrors {
  const e: LessonDraftErrors = {};
  const title = d.title.trim();
  if (!title) e.title = 'Add a title.';
  else if (title.length > 200) e.title = 'Keep the title under 200 characters.';
  else if (URL_RE.test(title)) e.title = 'Titles cannot contain links.';
  const text = d.summaryMd.trim();
  if (!text) e.summaryMd = 'Add the lesson text.';
  else if (text.length > 20_000) e.summaryMd = 'Keep the text under 20,000 characters.';
  else if (URL_RE.test(text)) e.summaryMd = 'Lesson text cannot contain links. Attach a curated resource instead.';
  const points = parseKeyPoints(d.keyPoints);
  if (points.length > 20) e.keyPoints = 'Use at most 20 key points.';
  else if (points.some((p) => p.length > 300)) e.keyPoints = 'Keep each key point under 300 characters.';
  else if (points.some((p) => URL_RE.test(p))) e.keyPoints = 'Key points cannot contain links.';
  return e;
}

export function lessonDraftChanged(
  d: LessonDraft,
  original: { title: string; summaryMd: string; keyPoints: string[]; status: ContentStatus },
): boolean {
  const a = parseKeyPoints(d.keyPoints);
  return (
    d.title.trim() !== original.title ||
    d.summaryMd.trim() !== original.summaryMd ||
    d.status !== original.status ||
    a.length !== original.keyPoints.length ||
    a.some((p, i) => p !== original.keyPoints[i])
  );
}
