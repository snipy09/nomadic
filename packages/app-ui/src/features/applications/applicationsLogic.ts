import type { Tone } from '@nomadic/ui';
import { MANUAL_APPLICATION_KEY_PREFIX, USER_APPLICATION_STATUSES, type UserApplicationStatus } from '@nomadic/app-core/shared/ipc';
import type { Application, ApplicationStatusEvent } from '../../types';

/**
 * Pure logic for the applications tracker: status -> stage mapping, search,
 * filters, sorting, grouping and counts. No React, no API.
 */

export type StageId = 'attention' | 'applied' | 'interviewing' | 'offer' | 'closed';

export interface Stage {
  id: StageId;
  label: string;
  /** Status a card gets when dropped on this column; null = cannot be dropped on. */
  dropStatus: UserApplicationStatus | null;
  empty: string;
}

/** Kanban columns, in pipeline order. */
export const STAGES: readonly Stage[] = [
  { id: 'attention', label: 'Needs action', dropStatus: null, empty: 'Automated applies that did not finish show up here.' },
  { id: 'applied', label: 'Applied', dropStatus: 'applied', empty: 'Nothing waiting on a reply.' },
  { id: 'interviewing', label: 'Interviewing', dropStatus: 'interviewing', empty: 'Move an application here when you hear back.' },
  { id: 'offer', label: 'Offer', dropStatus: 'offered', empty: 'No offers yet.' },
  { id: 'closed', label: 'Closed', dropStatus: 'rejected', empty: 'Rejected and withdrawn applications.' },
];

interface StatusMeta { label: string; stage: StageId; tone: Tone }

/** Every status the app writes (user moves and the apply engine). */
const STATUS_META: Record<string, StatusMeta> = {
  applied: { label: 'Applied', stage: 'applied', tone: 'accent' },
  submitted: { label: 'Submitted', stage: 'applied', tone: 'accent' },
  interviewing: { label: 'Interviewing', stage: 'interviewing', tone: 'accent' },
  offered: { label: 'Offer', stage: 'offer', tone: 'success' },
  accepted: { label: 'Accepted', stage: 'offer', tone: 'success' },
  rejected: { label: 'Rejected', stage: 'closed', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', stage: 'closed', tone: 'neutral' },
  archived: { label: 'Archived', stage: 'closed', tone: 'neutral' },
  prefilled: { label: 'Pre-filled, not submitted', stage: 'attention', tone: 'warning' },
  captcha_blocked: { label: 'Blocked by captcha', stage: 'attention', tone: 'warning' },
  requires_login: { label: 'Login required', stage: 'attention', tone: 'warning' },
  failed: { label: 'Failed', stage: 'attention', tone: 'danger' },
};

const normStatus = (s: string | null | undefined) => (s || 'applied').trim().toLowerCase();

export function statusMeta(status: string | null | undefined): StatusMeta {
  const s = normStatus(status);
  if (STATUS_META[s]) return STATUS_META[s];
  // Unknown values are shown as-is and need a decision from the user.
  const label = s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return { label, stage: 'attention', tone: 'warning' };
}

export const stageOf = (status: string | null | undefined): StageId => statusMeta(status).stage;
export const statusLabel = (status: string | null | undefined): string => statusMeta(status).label;

export const isUserStatus = (s: string): s is UserApplicationStatus =>
  (USER_APPLICATION_STATUSES as readonly string[]).includes(s);

/** Options for the "Move to" control. */
export const MOVE_OPTIONS = USER_APPLICATION_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }));

export const MODE_LABELS: Record<string, string> = {
  manual: 'Logged by you',
  'semi-auto': 'Reviewed apply',
  autonomous: 'Automated apply',
  outreach: 'Referral request',
};
export const modeLabel = (mode: string | null | undefined) => (mode && MODE_LABELS[mode]) || 'Unknown';

// ── time ─────────────────────────────────────────────────────────────────────

/** Milliseconds for ISO or SQLite `YYYY-MM-DD HH:MM:SS` (stored in UTC) timestamps; NaN if unparseable. */
export function parseTimestamp(ts: string | null | undefined): number {
  if (!ts) return NaN;
  const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(ts);
  return Date.parse(sqlite ? `${ts.replace(' ', 'T')}Z` : ts);
}

export function formatDate(ts: string | null | undefined): string {
  const ms = parseTimestamp(ts);
  if (Number.isNaN(ms)) return 'Unknown date';
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: string | null | undefined): string {
  const ms = parseTimestamp(ts);
  if (Number.isNaN(ms)) return 'Unknown time';
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Most recent of applied date, last update and last history entry. */
export function lastActivity(app: Application): number {
  const times = [app.applied_at, app.updated_at ?? null, ...(app.history ?? []).map((h) => h.changed_at)]
    .map(parseTimestamp)
    .filter((n) => !Number.isNaN(n));
  return times.length ? Math.max(...times) : 0;
}

// ── follow-ups ───────────────────────────────────────────────────────────────

/** Local calendar date as YYYY-MM-DD (follow-ups are whole days in the user's time zone). */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `days` after `from` (a YYYY-MM-DD), as YYYY-MM-DD. */
export function addDays(from: string, days: number): string {
  const [y, m, d] = from.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + days));
}

export type FollowUpState = 'overdue' | 'today' | 'upcoming';

/** Closed applications never need a follow-up, whatever date is stored. */
export function followUpState(app: Pick<Application, 'follow_up_at' | 'status'>, today: string = localDay()): FollowUpState | null {
  const at = app.follow_up_at;
  if (!at || stageOf(app.status) === 'closed') return null;
  return at < today ? 'overdue' : at === today ? 'today' : 'upcoming';
}

/** Applications whose follow-up is today or earlier, oldest date first. */
export function dueFollowUps(apps: Application[], today: string = localDay()): Application[] {
  return apps
    .filter((a) => { const s = followUpState(a, today); return s === 'overdue' || s === 'today'; })
    .sort((a, b) => (a.follow_up_at ?? '').localeCompare(b.follow_up_at ?? '') || a.company.localeCompare(b.company));
}

export function followUpLabel(app: Pick<Application, 'follow_up_at' | 'status'>, today: string = localDay()): string | null {
  const s = followUpState(app, today);
  if (!s) return null;
  if (s === 'today') return 'Follow up today';
  const [y, m, d] = app.follow_up_at!.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return s === 'overdue' ? `Follow-up was due ${date}` : `Follow up on ${date}`;
}

// ── links ────────────────────────────────────────────────────────────────────

/** The posting URL if it is a real http(s) link (manual entries may have none). */
export function postingUrl(app: Pick<Application, 'apply_url'>): string | null {
  const u = (app.apply_url || '').trim();
  if (!u || u.startsWith(MANUAL_APPLICATION_KEY_PREFIX)) return null;
  return /^https?:\/\//i.test(u) ? u : null;
}

// ── search, filter, sort, group ─────────────────────────────────────────────

export type StageFilter = 'all' | StageId;
export type SortKey = 'recent' | 'activity' | 'company';

export interface ApplicationFilters {
  search: string;
  stage: StageFilter;
  mode: string; // 'all' or a mode value
}

export const DEFAULT_FILTERS: ApplicationFilters = { search: '', stage: 'all', mode: 'all' };

export const isFiltered = (f: ApplicationFilters) => f.search.trim() !== '' || f.stage !== 'all' || f.mode !== 'all';

export function matchesSearch(app: Application, search: string): boolean {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [app.title, app.company, app.notes, statusLabel(app.status)].filter(Boolean).join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function filterApplications(apps: Application[], f: ApplicationFilters): Application[] {
  return apps.filter((a) =>
    matchesSearch(a, f.search) &&
    (f.stage === 'all' || stageOf(a.status) === f.stage) &&
    (f.mode === 'all' || (a.mode || '') === f.mode));
}

export function sortApplications(apps: Application[], sort: SortKey): Application[] {
  const out = [...apps];
  const byId = (a: Application, b: Application) => (b.id ?? 0) - (a.id ?? 0);
  if (sort === 'company') {
    out.sort((a, b) => a.company.localeCompare(b.company, 'en', { sensitivity: 'base' }) || a.title.localeCompare(b.title) || byId(a, b));
  } else if (sort === 'activity') {
    out.sort((a, b) => lastActivity(b) - lastActivity(a) || byId(a, b));
  } else {
    const t = (a: Application) => { const n = parseTimestamp(a.applied_at); return Number.isNaN(n) ? 0 : n; };
    out.sort((a, b) => t(b) - t(a) || byId(a, b));
  }
  return out;
}

export function groupByStage(apps: Application[]): Record<StageId, Application[]> {
  const groups = Object.fromEntries(STAGES.map((s) => [s.id, [] as Application[]])) as Record<StageId, Application[]>;
  for (const a of apps) groups[stageOf(a.status)].push(a);
  return groups;
}

export function stageCounts(apps: Application[]): Record<StageId, number> & { total: number } {
  const counts = { total: apps.length } as Record<StageId, number> & { total: number };
  for (const s of STAGES) counts[s.id] = 0;
  for (const a of apps) counts[stageOf(a.status)]++;
  return counts;
}

/** Distinct modes present, for the "How applied" filter. */
export function modesPresent(apps: Application[]): string[] {
  return [...new Set(apps.map((a) => a.mode).filter((m): m is string => Boolean(m)))].sort();
}

// ── updates ─────────────────────────────────────────────────────────────────

/** The application after a status change (used for optimistic updates). */
export function withStatus(app: Application, status: string, at: string): Application {
  if (normStatus(app.status) === status) return app;
  const history: ApplicationStatusEvent[] = [...(app.history ?? []), { status, changed_at: at }];
  return { ...app, status, updated_at: at, history };
}

/** History newest first, for display. */
export const historyNewestFirst = (app: Application): ApplicationStatusEvent[] =>
  [...(app.history ?? [])].sort((a, b) => parseTimestamp(b.changed_at) - parseTimestamp(a.changed_at));

export interface NewApplicationDraft {
  company: string;
  title: string;
  url: string;
  status: UserApplicationStatus;
  notes: string;
}

export const NOTES_MAX = 10_000;

export function validateDraft(d: NewApplicationDraft): Partial<Record<'company' | 'title' | 'url' | 'notes', string>> {
  const errors: Partial<Record<'company' | 'title' | 'url' | 'notes', string>> = {};
  if (!d.company.trim()) errors.company = 'Enter the company name.';
  if (!d.title.trim()) errors.title = 'Enter the role you applied for.';
  const url = d.url.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') errors.url = 'Use a link that starts with https://';
    } catch {
      errors.url = 'Enter a full link, for example https://company.com/jobs/123';
    }
  }
  if (d.notes.length > NOTES_MAX) errors.notes = `Notes can be up to ${NOTES_MAX} characters.`;
  return errors;
}
