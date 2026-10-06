/**
 * Runs inside a plain Android WebView in the instrumentation test, playing the part of the
 * Capacitor app: the same AgentChannel + fillApplication + submitReviewed code drives the real
 * ApplyBrowserController (through the AndroidHarness JS interface instead of the Capacitor
 * bridge) over every form-bench fixture, then scores the result like `npm run bench:forms`.
 */
import { AgentChannel, type AgentFrame, type BridgeTransport } from '../../form-engine/src/remote/channel.js';
import { fillApplication, submitReviewed } from '../../form-engine/src/remote/apply.js';
import { outcomeKey } from '../../form-engine/src/core.js';
import type { LlmClient } from '../../form-engine/src/llm.js';
import type { PortalId } from '../../form-engine/src/adapters.js';
import { scoreField, type ActualValue, type FieldScore } from '../../form-bench/src/score.js';
import type { AnswerKey } from '../../form-bench/src/fixtures/kit.js';

interface HarnessBridge {
  /** Open the apply WebView (ApplyBrowserController.open) on the UI thread. */
  open(url: string, agentScript: string): void;
  /** Deliver a request to a frame; false when that frame is gone. */
  post(frameId: string, data: string): boolean;
  close(): void;
  log(message: string): void;
  done(json: string): void;
}
declare const AndroidHarness: HarnessBridge;

const FIXTURES = ['ashby-arbitration', 'ashby-basic', 'ashby-custom-questions', 'ashby-location-combobox', 'ashby-yesno-eeo', 'generic-careers-richtext', 'greenhouse-classic', 'greenhouse-eeo', 'greenhouse-iframe-embed', 'greenhouse-react-eeo', 'greenhouse-react-select', 'internshala-assessment', 'internshala-details', 'internshala-modal', 'lever-additional', 'lever-basic', 'lever-cards', 'lever-eeo', 'ui5-shadow-form', 'workday-login-wall', 'workday-multistep', 'workday-questions'];
const ADAPTER_FOR_ATS: Record<string, PortalId> = { ashby: 'ashby', greenhouse: 'greenhouse', lever: 'lever', internshala: 'internshala', workday: 'workday', other: 'generic' };

const listeners = new Set<(data: string) => void>();
(window as unknown as { __nomadicHarness: unknown }).__nomadicHarness = { receive: (data: string) => listeners.forEach((l) => l(data)) };
const transport: BridgeTransport = {
  send(frameId, data) {
    if (!AndroidHarness.post(frameId, data)) throw new Error(`frame ${frameId} is gone`);
  },
  onMessage(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

/** Same stand-in for the batched LLM call as the desktop bench (open-ended questions only). */
class MockLlm implements LlmClient {
  calls = 0;
  async completeJson(_system: string, user: string): Promise<unknown> {
    this.calls++;
    const payload = JSON.parse(user) as { CANDIDATE: { summary?: string }; QUESTIONS: Array<{ id: string; question: string }> };
    const answers: Record<string, string> = {};
    for (const q of payload.QUESTIONS) answers[q.id] = `${payload.CANDIDATE.summary || 'Experienced engineer.'} (answer to: ${q.question})`;
    return { answers };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const getJson = async <T>(path: string): Promise<T> => (await fetch(path)).json() as Promise<T>;

async function loadFile(ref: string) {
  const res = await fetch(ref);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: ref.split('/').pop() || 'resume.pdf', mimeType: 'application/pdf', base64: btoa(bin) };
}

type Extra = 'benchRead' | 'benchReady' | 'benchSubmitted';
function extra<T>(ch: AgentChannel, frameId: string, cmd: Extra, args: object = {}): Promise<T> {
  return (ch.call as unknown as (f: string, c: string, a: object) => Promise<T>)(frameId, cmd, args);
}

async function openFixture(id: string, key: AnswerKey, agentScript: string): Promise<AgentChannel> {
  const channel = new AgentChannel(transport);
  AndroidHarness.open(`${location.origin}/${id}/index.html`, agentScript);
  if (!(await channel.waitForTop('complete', 30_000))) {
    channel.close();
    throw new Error(`${id}: no agent reported a loaded page (frames: ${JSON.stringify(channel.frames())})`);
  }
  AndroidHarness.log(`${id}: page loaded, frames ${channel.frames().map((f) => (f.top ? 'top ' : '') + f.url).join(' | ')}`);
  const wantFrames = new Set(Object.values(key.fields).map((e) => e.frame).filter((f): f is string => !!f));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const frames = channel.frames();
    const allThere = [...wantFrames].every((w) => frames.some((f) => f.url.includes(w)));
    const ready = allThere && (await Promise.all(frames.map((f) => extra<boolean>(channel, f.id, 'benchReady').catch(() => false)))).every(Boolean);
    if (ready) break;
    await sleep(100);
  }
  return channel;
}

function frameFor(channel: AgentChannel, frame?: string): AgentFrame | undefined {
  return frame ? channel.frames().find((f) => f.url.includes(frame)) : channel.top();
}

async function submittedAnywhere(channel: AgentChannel): Promise<boolean> {
  const v = await Promise.all(channel.frames().map((f) => extra<boolean>(channel, f.id, 'benchSubmitted').catch(() => false)));
  return v.some(Boolean);
}

interface FixtureResult {
  id: string;
  status: string;
  fields: number;
  correct: number;
  wrong: number;
  skipped: number;
  submitClicked: boolean;
  wallsExpected: string[];
  wallsReported: string[];
  timeMs: number;
  error?: string;
  details: FieldScore[];
}

async function runFixture(id: string, agentScript: string): Promise<FixtureResult> {
  const key = await getJson<AnswerKey>(`/${id}/expected.json`);
  const profile = { ...(await getJson<Record<string, unknown>>(`/_profiles/${key.profile}`)), resumeFilePath: '/_profiles/sample-resume.pdf' };
  const channel = await openFixture(id, key, agentScript);
  const t0 = Date.now();
  let status = 'error';
  let error: string | undefined;
  let walls: string[] = [];
  try {
    const res = await fillApplication(channel, {
      profile: profile as never,
      portal: ADAPTER_FOR_ATS[key.ats] || 'generic',
      llm: new MockLlm(),
      resolveResume: (p) => (p as { resumeFilePath?: string }).resumeFilePath || null,
      loadFile,
    });
    status = res.status;
    error = res.error;
    walls = res.report?.walls || [];
  } catch (err) {
    error = (err as Error).message;
  }
  const timeMs = Date.now() - t0;
  await sleep(250);
  const details: FieldScore[] = [];
  for (const [label, entry] of Object.entries(key.fields)) {
    const f = frameFor(channel, entry.frame);
    const actual: ActualValue = f ? await extra<ActualValue>(channel, f.id, 'benchRead', { selector: entry.selector, read: entry.read, shadow: entry.shadow }).catch(() => ({ missing: true, value: '' })) : { missing: true, value: '' };
    details.push(scoreField(label, entry, actual));
  }
  const submitClicked = await submittedAnywhere(channel);
  channel.close();
  const count = (v: FieldScore['verdict']) => details.filter((d) => d.verdict === v).length;
  return { id, status, fields: details.length, correct: count('correct'), wrong: count('wrong'), skipped: count('skipped') + count('missing'), submitClicked, wallsExpected: key.walls, wallsReported: walls, timeMs, error, details };
}

/** Fill, refuse an unreviewed submit, then submit after "reviewed" with the candidate's edits. */
async function reviewAndSubmit(agentScript: string) {
  const id = 'greenhouse-iframe-embed';
  const key = await getJson<AnswerKey>(`/${id}/expected.json`);
  const profile = { ...(await getJson<Record<string, unknown>>(`/_profiles/${key.profile}`)), resumeFilePath: '/_profiles/sample-resume.pdf' };
  const channel = await openFixture(id, key, agentScript);
  const res = await fillApplication(channel, { profile: profile as never, portal: 'greenhouse', llm: null, resolveResume: (p) => (p as { resumeFilePath?: string }).resumeFilePath || null, loadFile });
  if (!res.handle) return { ok: false, step: 'fill', detail: res.status + ' ' + (res.error || '') };
  const unreviewed = await submitReviewed(res.handle, {}, { reviewed: false });
  const submittedEarly = await submittedAnywhere(channel);
  const overrides: Record<string, string> = {};
  for (const o of res.report!.fields) if (o.field.required && o.status !== 'filled' && o.field.kind !== 'file') overrides[outcomeKey(o)] = o.field.options?.[0]?.label || 'Reviewed answer';
  const done = await submitReviewed(res.handle, overrides, { reviewed: true });
  const submitted = await submittedAnywhere(channel);
  channel.close();
  return { ok: !unreviewed.submitted && !submittedEarly && done.submitted && submitted, unreviewedRefused: !unreviewed.submitted, submittedEarly, engineSubmitted: done.submitted, pageSubmitted: submitted, error: done.error };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms))]);
}

async function main() {
  AndroidHarness.log(`harness started: ${navigator.userAgent}`);
  const agentScript = await (await fetch('/_harness/test-agent.js')).text();
  AndroidHarness.log(`test agent loaded (${agentScript.length} chars)`);
  const results: FixtureResult[] = [];
  for (const id of FIXTURES) {
    const t0 = Date.now();
    const r = await withTimeout(runFixture(id, agentScript), 120_000, id).catch((err): FixtureResult => ({
      id, status: 'error', fields: 0, correct: 0, wrong: 0, skipped: 0, submitClicked: false, wallsExpected: [], wallsReported: [], timeMs: Date.now() - t0, error: (err as Error).message, details: [],
    }));
    AndroidHarness.log(`${id.padEnd(26)} fields ${r.fields} correct ${r.correct} wrong ${r.wrong} skipped ${r.skipped} ${r.timeMs}ms ${r.status}${r.submitClicked ? ' SUBMIT-CLICKED' : ''}${r.error ? ' ERROR ' + r.error : ''}`);
    results.push(r);
  }
  const review = await withTimeout(reviewAndSubmit(agentScript), 120_000, 'review flow').catch((err) => ({ ok: false, error: (err as Error).message }));
  AndroidHarness.close();
  const sum = (k: 'fields' | 'correct' | 'wrong' | 'skipped') => results.reduce((n, r) => n + r[k], 0);
  const summary = {
    forms: results.length,
    fields: sum('fields'),
    correct: sum('correct'),
    wrong: sum('wrong'),
    skipped: sum('skipped'),
    submitClicked: results.filter((r) => r.submitClicked).length,
    wallsDetected: results.filter((r) => r.wallsExpected.length && r.wallsExpected.every((w) => r.wallsReported.includes(w))).length,
    wallsExpected: results.filter((r) => r.wallsExpected.length).length,
    errors: results.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`),
    userAgent: navigator.userAgent,
  };
  AndroidHarness.done(JSON.stringify({ summary, review, results }));
}

main().catch((err) => AndroidHarness.done(JSON.stringify({ fatal: String((err as Error)?.stack || err) })));
