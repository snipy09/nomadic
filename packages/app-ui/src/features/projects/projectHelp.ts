/**
 * Help inside a guided project. One conversation per project stage, kept in
 * memory for this app session. When the daily AI limit is reached, the
 * question waits and is asked again automatically once the limit resets
 * (midnight IST, from the server's `resets_at`), while Nomadic stays open.
 */
import { getApi, type LearnProjectHelpRequest } from '../../types';

export interface HelpAnswer {
  question: string;
  answer: string;
  nextSteps: string[];
  code: string | null;
  at: number;
}

export type HelpState =
  | { status: 'idle' }
  | { status: 'asking'; request: LearnProjectHelpRequest }
  | { status: 'waiting'; request: LearnProjectHelpRequest; retryAt: number; message: string }
  | { status: 'error'; request: LearnProjectHelpRequest; message: string };

export interface HelpThread {
  state: HelpState;
  answers: HelpAnswer[];
  /** Answers left today (null when unknown). */
  remaining: number | null;
}

const EMPTY: HelpThread = { state: { status: 'idle' }, answers: [], remaining: null };
/** A little after the reset, so the server's day has surely turned. */
export const RESET_GRACE_MS = 20_000;
/** Never wait more than a day (a clock or time-zone surprise must not park a question forever). */
const MAX_WAIT_MS = 24 * 3600_000;
/** If the server gives no reset time, try again in an hour. */
const FALLBACK_WAIT_MS = 3600_000;

export const threadKey = (projectId: string, stageId: string) => `${projectId}::${stageId}`;

/** When to ask again after a quota refusal. */
export function retryAt(resetsAt: string | null | undefined, now: number): number {
  const t = resetsAt ? Date.parse(resetsAt) : NaN;
  if (!Number.isFinite(t)) return now + FALLBACK_WAIT_MS;
  return Math.min(now + MAX_WAIT_MS, Math.max(now + 5_000, t + RESET_GRACE_MS));
}

/** "3 h 12 min", "4 min", "less than a minute". */
export function formatWait(ms: number): string {
  if (ms < 60_000) return 'less than a minute';
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The local clock time of a moment, e.g. "12:00 am". */
export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

type Listener = () => void;
const threads = new Map<string, HelpThread>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function set(key: string, patch: Partial<HelpThread>) {
  threads.set(key, { ...(threads.get(key) ?? EMPTY), ...patch });
  emit();
}

export function getThread(key: string): HelpThread {
  return threads.get(key) ?? EMPTY;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Asks (or re-asks) a question; a quota refusal parks it until the limit resets. */
export async function ask(request: LearnProjectHelpRequest, now: () => number = Date.now): Promise<void> {
  const key = threadKey(request.projectId, request.stageId);
  clearTimeout(timers.get(key));
  timers.delete(key);
  set(key, { state: { status: 'asking', request } });
  let res;
  try {
    res = await getApi().learnProjectHelp(request);
  } catch {
    set(key, { state: { status: 'error', request, message: 'Could not reach Nomadic AI. Check your connection and try again.' } });
    return;
  }
  if (res.success) {
    const t = getThread(key);
    set(key, {
      state: { status: 'idle' },
      answers: [...t.answers, { question: request.question, answer: res.answer, nextSteps: res.nextSteps, code: res.code, at: now() }].slice(-10),
      remaining: res.quota?.remaining ?? null,
    });
    return;
  }
  if (res.code === 'quota_exceeded') {
    const at = retryAt(res.quota?.resetsAt, now());
    set(key, { state: { status: 'waiting', request, retryAt: at, message: res.error }, remaining: 0 });
    timers.set(key, setTimeout(() => void ask(request, now), at - now()));
    return;
  }
  set(key, { state: { status: 'error', request, message: res.error } });
}

/** Drops a waiting question. */
export function cancel(key: string): void {
  clearTimeout(timers.get(key));
  timers.delete(key);
  set(key, { state: { status: 'idle' } });
}

/** Test helper: forget every thread and timer. */
export function resetHelpForTests(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  threads.clear();
  emit();
}
