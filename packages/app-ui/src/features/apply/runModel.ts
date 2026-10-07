/**
 * Apply run model: pure state + selectors behind the apply run view.
 *
 * Flow: start(targets) -> live progress per application (from `auto-apply-progress`)
 * -> a snapshot per application (the engine's own fill report) -> the candidate edits
 * and marks each application reviewed -> only reviewed applications are submitted.
 * Nothing here can submit: `reviewedIds` is the only input to submission and it only
 * contains applications the candidate explicitly approved.
 */
import type {
  AnswerSource,
  AutoApplyProgressEvent,
  BatchOverrides,
  BatchSnapshot,
  BatchSnapshotField,
  BatchSubmitResult,
} from '@nomadic/app-core/shared/ipc';

export interface ApplyTarget {
  url: string;
  company?: string;
  title?: string;
}

/** A field event seen while the form was being filled (before the snapshot arrives). */
export interface LiveField {
  key: string;
  label: string;
  state: 'filled' | 'needs_user' | 'error';
  value?: string;
  source?: AnswerSource;
  message?: string;
}

export interface SubmitOutcome {
  submitted: boolean;
  confirmed: boolean;
  error?: string;
}

export interface RunApp {
  url: string;
  target: ApplyTarget;
  phase: 'queued' | 'filling' | 'filled' | 'submitting' | 'done';
  /** Latest status line from the engine. */
  activity?: string;
  /** The engine is waiting for the candidate in the browser (sign-in, CAPTCHA). */
  waitingOnUser?: string;
  live: LiveField[];
  snapshot?: BatchSnapshot;
  /** Error when no snapshot could be produced. */
  error?: string;
  /** Values the candidate typed, keyed by field key. */
  edits: Record<string, string>;
  /** The candidate marked this application as reviewed. Required before it can be submitted. */
  approved: boolean;
  skipped: boolean;
  result?: SubmitOutcome;
}

export type RunStage = 'filling' | 'review' | 'submitting' | 'done' | 'cancelled';

export interface RunState {
  stage: RunStage;
  apps: RunApp[];
}

export type AppStatus =
  | 'queued'
  | 'filling'
  | 'ready'
  | 'needs_you'
  | 'failed'
  | 'skipped'
  | 'submitting'
  | 'submitted'
  | 'not_submitted';

export type RunAction =
  | { type: 'start'; targets: ApplyTarget[] }
  | { type: 'progress'; event: AutoApplyProgressEvent }
  | { type: 'fillDone'; snapshots?: BatchSnapshot[]; error?: string; cancelled?: boolean }
  | { type: 'retryStart'; url: string }
  | { type: 'retryDone'; url: string; snapshot?: BatchSnapshot; error?: string }
  | { type: 'edit'; url: string; key: string; value: string }
  | { type: 'approve'; url: string; approved: boolean }
  | { type: 'skip'; url: string; skipped: boolean }
  | { type: 'submitStart'; ids: string[] }
  | { type: 'submitDone'; result: BatchSubmitResult; ids: string[] }
  | { type: 'cancel' };

export const initialRun: RunState = { stage: 'done', apps: [] };

const NEEDS_YOU: BatchSnapshotField['status'][] = ['needs_user', 'failed'];

function newApp(target: ApplyTarget): RunApp {
  return { url: target.url, target, phase: 'queued', live: [], edits: {}, approved: false, skipped: false };
}

export function startRun(targets: ApplyTarget[]): RunState {
  const unique = [...new Map(targets.map((t) => [t.url, t])).values()];
  return { stage: 'filling', apps: unique.map(newApp) };
}

function updateApp(state: RunState, url: string, fn: (a: RunApp) => RunApp): RunState {
  let hit = false;
  const apps = state.apps.map((a) => {
    if (a.url !== url) return a;
    hit = true;
    return fn(a);
  });
  return hit ? { ...state, apps } : state;
}

function withSnapshot(a: RunApp, snapshot: BatchSnapshot): RunApp {
  return { ...a, phase: 'filled', snapshot, error: undefined, waitingOnUser: undefined, edits: {}, approved: false };
}

function upsertLive(live: LiveField[], next: LiveField): LiveField[] {
  const i = live.findIndex((f) => f.key === next.key);
  if (i === -1) return [...live, next];
  const copy = live.slice();
  copy[i] = { ...copy[i], ...next };
  return copy;
}

/** Fold one progress event into the application it belongs to. */
function applyProgress(a: RunApp, ev: AutoApplyProgressEvent): RunApp {
  if (ev.snapshot) return a.phase === 'filling' || a.phase === 'queued' ? withSnapshot(a, ev.snapshot) : a;
  const se = ev.statusEvent;
  if (a.phase === 'submitting') return { ...a, activity: se?.message ?? a.activity };
  if (a.phase !== 'queued' && a.phase !== 'filling') return a;
  const next: RunApp = { ...a, phase: 'filling', activity: se?.message ?? a.activity };
  next.waitingOnUser = se?.phase === 'user_input_required' && !se.formEvent ? se.actionRequired || se.message : undefined;
  const fe = se?.formEvent;
  if (fe?.type === 'field_filled') {
    next.live = upsertLive(a.live, { key: fe.fieldId, label: fe.label, state: 'filled', value: fe.value, source: fe.source });
  } else if (fe?.type === 'needs_user' && fe.label) {
    next.live = upsertLive(a.live, { key: fe.fieldId ?? fe.label, label: fe.label, state: 'needs_user', message: fe.reason });
  } else if (fe?.type === 'error' && fe.label) {
    next.live = upsertLive(a.live, { key: fe.fieldId ?? fe.label, label: fe.label, state: 'error', message: fe.message });
  }
  return next;
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'start':
      return startRun(action.targets);
    case 'progress': {
      const url = action.event.url;
      if (!url || (state.stage !== 'filling' && state.stage !== 'review' && state.stage !== 'submitting')) return state;
      return updateApp(state, url, (a) => applyProgress(a, action.event));
    }
    case 'fillDone': {
      if (state.stage !== 'filling') return state;
      const byUrl = new Map((action.snapshots ?? []).map((s) => [s.applyUrl, s]));
      const apps = state.apps.map((a) => {
        const snap = byUrl.get(a.url);
        if (snap) return withSnapshot(a, snap);
        if (a.snapshot) return a;
        const error = action.cancelled ? 'Stopped before this form was finished. Nothing was submitted.' : action.error || 'This form could not be prepared.';
        return { ...a, phase: 'filled' as const, error, waitingOnUser: undefined };
      });
      return { stage: 'review', apps };
    }
    case 'retryStart':
      return updateApp(state, action.url, (a) => ({ ...newApp(a.target), phase: 'filling' }));
    case 'retryDone':
      return updateApp(state, action.url, (a) =>
        action.snapshot ? withSnapshot(a, action.snapshot) : { ...a, phase: 'filled', error: action.error || 'This form could not be prepared.' }
      );
    case 'edit':
      if (state.stage !== 'review') return state;
      return updateApp(state, action.url, (a) => {
        const next = { ...a, edits: { ...a.edits, [action.key]: action.value } };
        return { ...next, approved: next.approved && appStatus(next) === 'ready' };
      });
    case 'approve':
      if (state.stage !== 'review') return state;
      return updateApp(state, action.url, (a) => ({ ...a, approved: action.approved && appStatus(a) === 'ready' }));
    case 'skip':
      if (state.stage !== 'review') return state;
      return updateApp(state, action.url, (a) => ({ ...a, skipped: action.skipped, approved: action.skipped ? false : a.approved }));
    case 'submitStart': {
      if (!canSubmit(state)) return state;
      const ids = new Set(action.ids);
      return {
        stage: 'submitting',
        apps: state.apps.map((a) => (a.snapshot && ids.has(a.snapshot.id) ? { ...a, phase: 'submitting' as const, activity: 'Waiting to submit' } : a)),
      };
    }
    case 'submitDone': {
      if (state.stage !== 'submitting') return state;
      const byId = new Map((action.result.results ?? []).map((r) => [r.id, r]));
      const fallback = action.result.success ? 'No result was reported for this application.' : action.result.error || 'Submission failed.';
      const apps = state.apps.map((a) => {
        if (a.phase !== 'submitting' || !a.snapshot) return a;
        const r = byId.get(a.snapshot.id);
        const result: SubmitOutcome = r ? { submitted: r.submitted, confirmed: r.confirmed, error: r.error } : { submitted: false, confirmed: false, error: fallback };
        return { ...a, phase: 'done' as const, result };
      });
      return { stage: 'done', apps };
    }
    case 'cancel':
      return { ...state, stage: 'cancelled' };
    default:
      return state;
  }
}

// ── Selectors ──────────────────────────────────────────────────────────────

export function fieldValue(app: RunApp, f: BatchSnapshotField): string {
  return app.edits[f.fieldKey] ?? f.value;
}

/** Fields the engine could not answer or write: shown first and editable. */
export function needsYouFields(app: RunApp): BatchSnapshotField[] {
  return (app.snapshot?.fields ?? []).filter((f) => NEEDS_YOU.includes(f.status));
}

/** Required fields that still have no usable value from the candidate. */
export function unresolvedFields(app: RunApp): BatchSnapshotField[] {
  return needsYouFields(app).filter((f) => {
    if (!f.required) return false;
    const edited = app.edits[f.fieldKey];
    if (edited === undefined) return true;
    if (f.fieldType === 'checkbox' && !f.multiple) return edited !== 'true';
    return edited.trim() === '';
  });
}

export function appStatus(app: RunApp): AppStatus {
  if (app.result) return app.result.submitted ? 'submitted' : 'not_submitted';
  if (app.phase === 'submitting') return 'submitting';
  if (app.phase === 'queued') return 'queued';
  if (app.phase === 'filling') return 'filling';
  if (app.skipped) return 'skipped';
  const s = app.snapshot;
  if (!s || s.status === 'failed') return 'failed';
  if (!s.submittable || s.walls.length > 0) return 'needs_you';
  if (unresolvedFields(app).length > 0) return 'needs_you';
  return 'ready';
}

/** Snapshot ids the candidate reviewed and approved: the only applications that may be submitted. */
export function reviewedIds(state: RunState): string[] {
  return state.apps
    .filter((a) => a.approved && !a.skipped && a.snapshot && appStatus(a) === 'ready')
    .map((a) => a.snapshot!.id);
}

export function canSubmit(state: RunState): boolean {
  if (state.stage !== 'review') return false;
  if (state.apps.some((a) => a.phase === 'filling' || a.phase === 'queued')) return false;
  return reviewedIds(state).length > 0;
}

/** Values the candidate changed or supplied, per reviewed application. File fields are never overridden. */
export function buildOverrides(state: RunState, ids: string[]): BatchOverrides {
  const wanted = new Set(ids);
  const out: BatchOverrides = {};
  for (const a of state.apps) {
    if (!a.snapshot || !wanted.has(a.snapshot.id)) continue;
    const fields: Record<string, string> = {};
    for (const f of a.snapshot.fields) {
      const v = a.edits[f.fieldKey];
      if (v === undefined || f.fieldType === 'file') continue;
      if (v !== f.value || NEEDS_YOU.includes(f.status)) fields[f.fieldKey] = v;
    }
    if (Object.keys(fields).length) out[a.snapshot.id] = fields;
  }
  return out;
}

/** Forms whose pre-fill has finished (successfully or not); a real count, not an estimate. */
export function finishedCount(state: RunState): number {
  return state.apps.filter((a) => a.phase !== 'queued' && a.phase !== 'filling').length;
}

/** The application to show when the candidate has not picked one: the form being filled, then the first that needs them. */
export function focusApp(state: RunState): RunApp | undefined {
  const { apps } = state;
  if (state.stage === 'filling') return apps.find((a) => a.phase === 'filling') ?? apps.find((a) => a.phase === 'queued') ?? apps[apps.length - 1];
  if (state.stage === 'review') {
    return apps.find((a) => !a.approved && !a.skipped && appStatus(a) === 'needs_you')
      ?? apps.find((a) => !a.approved && !a.skipped && appStatus(a) === 'ready')
      ?? apps[0];
  }
  return apps[0];
}

/** After reviewing `url`, the next application (in list order, wrapping) still waiting for review. */
export function nextToReview(state: RunState, url: string): RunApp | undefined {
  const i = state.apps.findIndex((a) => a.url === url);
  const order = [...state.apps.slice(i + 1), ...state.apps.slice(0, Math.max(0, i))];
  return order.find((a) => !a.approved && !a.skipped && ['ready', 'needs_you'].includes(appStatus(a)));
}

/** Step of the run for the stepper: 0 fill, 1 review, 2 submit, 3 done. */
export function runStep(stage: RunStage): number {
  return stage === 'filling' ? 0 : stage === 'review' ? 1 : stage === 'submitting' ? 2 : 3;
}

export function countByStatus(state: RunState): Record<AppStatus, number> {
  const counts = { queued: 0, filling: 0, ready: 0, needs_you: 0, failed: 0, skipped: 0, submitting: 0, submitted: 0, not_submitted: 0 } as Record<AppStatus, number>;
  for (const a of state.apps) counts[appStatus(a)]++;
  return counts;
}

export const STATUS_META: Record<AppStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  filling: { label: 'Filling', tone: 'accent' },
  ready: { label: 'Ready for review', tone: 'success' },
  needs_you: { label: 'Needs you', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  submitting: { label: 'Submitting', tone: 'accent' },
  submitted: { label: 'Submitted', tone: 'success' },
  not_submitted: { label: 'Not submitted', tone: 'danger' },
};

export const SOURCE_LABEL: Record<AnswerSource, string> = {
  profile: 'From your profile',
  derived: 'Derived from your profile',
  custom: 'Your answer',
  cache: 'Saved answer',
  policy: 'Standard answer',
  llm: 'AI drafted',
};

const WALL_TEXT = { login: 'sign in', captcha: 'solve the CAPTCHA', email_verification: 'verify your email' } as const;

/** What the candidate has to do before this application can go out, in one sentence. */
export function attentionMessage(app: RunApp): string | null {
  const s = app.snapshot;
  if (!s) return app.error ?? null;
  if (s.status === 'failed') return s.errorMessage || app.error || 'This form could not be filled.';
  if (s.walls.length) return `The portal asks you to ${s.walls.map((w) => WALL_TEXT[w]).join(' and ')} in the browser window. Do that, then retry.`;
  if (!s.submittable) return s.errorMessage || 'This form is no longer open. Retry to fill it again.';
  const n = unresolvedFields(app).length;
  if (n) return `${n} required ${n === 1 ? 'field needs' : 'fields need'} your answer.`;
  return null;
}

export function confidenceLabel(c: number | undefined): string | null {
  if (c === undefined || !Number.isFinite(c)) return null;
  return `Confidence ${Math.round(Math.max(0, Math.min(1, c)) * 100)}%`;
}
