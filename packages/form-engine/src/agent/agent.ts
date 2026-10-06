/**
 * The in-page form agent: one instance per frame, injected at document start by the
 * Android WebView (androidx.webkit addDocumentStartJavaScript, all frames) and, in tests,
 * by Playwright. It answers requests from the host engine over `window.nomadicBridge`
 * (see protocol.ts) and only ever acts on its own document.
 */
import type { VerifyIssue } from '../contracts.js';
import { splitHasText } from '../adapters.js';
import { sameValue } from '../values.js';
import { fieldErrorInPage, findButtonInPage, isConfirmationInPage, pageErrorsInPage, wallsInPage } from './inpage.js';
import { userClick } from './input.js';
import { AGENT_VERSION, type AgentCommand, type AgentCommands, type AgentMessage, type AgentRequest, type BridgeObject, type VerifyItem } from './protocol.js';
import { scanFrame } from './scan.js';
import { fileAttached, readField, resolveField, writeField } from './writers.js';

function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  const r = he.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(he);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

/** Elements for a CSS selector with optional Playwright-style `:has-text("x")`. */
function queryAll(selector: string): Element[] {
  const { css, text } = splitHasText(selector);
  let els: Element[];
  try { els = Array.from(document.querySelectorAll(css)); } catch { return []; }
  if (text == null) return els;
  const want = text.toLowerCase();
  return els.filter((e) => ((e as HTMLElement).innerText || e.textContent || '').replace(/\s+/g, ' ').toLowerCase().includes(want));
}

function firstVisible(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = queryAll(sel).find(isVisible);
    if (el) return el;
  }
  return null;
}

function verify(items: VerifyItem[]): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  for (const { field: f, status, expected, fileName } of items) {
    if (status === 'filled' && f.kind === 'file') {
      if (!fileAttached(f, fileName || '')) issues.push({ fieldId: f.id, kind: 'value_mismatch', message: 'file is no longer attached' });
    } else if (status === 'filled') {
      const actual = readField(f);
      if (!sameValue(f, actual, expected)) {
        issues.push({ fieldId: f.id, kind: 'value_mismatch', message: `expected "${expected.slice(0, 60)}", found "${actual.slice(0, 60)}"` });
        continue;
      }
      const el = resolveField(f);
      const err = el ? fieldErrorInPage(el) : '';
      if (err) issues.push({ fieldId: f.id, kind: 'validation_error', message: err });
    } else if (f.required && status !== 'skipped') {
      const actual = readField(f);
      if (!actual || actual === 'false') issues.push({ fieldId: f.id, kind: 'required_empty', message: 'required field is empty' });
    }
  }
  return issues;
}

type Handlers = { [C in AgentCommand]: (args: AgentCommands[C]['args']) => AgentCommands[C]['result'] | Promise<AgentCommands[C]['result']> };

const handlers: Handlers = {
  ping: () => ({ url: location.href, readyState: document.readyState, top: window.top === window, version: AGENT_VERSION }),
  scan: ({ includeHidden }) => scanFrame({ includeHidden: !!includeHidden }),
  read: ({ field }) => readField(field),
  write: ({ field, answer, file }) => writeField(field, answer, file),
  verify: ({ items }) => verify(items),
  pageErrors: () => pageErrorsInPage(),
  walls: () => wallsInPage(),
  clickButton: ({ src, preferSubmit }) => {
    const el = findButtonInPage({ src, preferSubmit });
    if (!el) return false;
    userClick(el);
    return true;
  },
  isConfirmation: () => isConfirmationInPage(),
  anyVisible: ({ selectors }) => !!firstVisible(selectors),
  clickFirstVisible: ({ selectors }) => {
    const el = firstVisible(selectors);
    if (!el) return false;
    userClick(el);
    return true;
  },
};

/** Extra commands for test builds only (the Android instrumentation harness reads fixture state with them). */
export type ExtraHandlers = Record<string, (args: never) => unknown>;
let extraHandlers: ExtraHandlers = {};

export async function handleRequest(req: AgentRequest): Promise<unknown> {
  const h = (Object.prototype.hasOwnProperty.call(handlers, req.cmd) ? handlers[req.cmd] : extraHandlers[req.cmd]) as ((args: unknown) => unknown) | undefined;
  if (!h) throw new Error(`unknown command ${String(req.cmd)}`);
  return h(req.args || {});
}

function randomId(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
}

export interface InstalledAgent {
  frameId: string;
  handle(req: AgentRequest): Promise<unknown>;
}

function connect(bridge: BridgeObject, frameId: string): void {
  const post = (m: AgentMessage) => { try { bridge.postMessage(JSON.stringify(m)); } catch { /* frame going away */ } };
  bridge.onmessage = (event) => {
    let req: AgentRequest;
    try { req = JSON.parse(String(event.data)); } catch { return; }
    if (!req || req.t !== 'req' || typeof req.id !== 'number') return;
    handleRequest(req).then(
      (result) => post({ t: 'res', frameId, id: req.id, ok: true, result }),
      (err) => post({ t: 'res', frameId, id: req.id, ok: false, error: (err && (err as Error).message) || String(err) }),
    );
  };
  post({ t: 'hello', frameId, url: location.href, top: window.top === window, readyState: document.readyState, version: AGENT_VERSION });
  const state = () => post({ t: 'state', frameId, url: location.href, readyState: document.readyState });
  document.addEventListener('readystatechange', state);
  window.addEventListener('pagehide', () => post({ t: 'bye', frameId }));
}

/** Install once per document and connect to the bridge if the WebView provides one. */
export function install(extra: ExtraHandlers = {}): InstalledAgent {
  const w = window as unknown as { __nomadicAgent?: InstalledAgent; nomadicBridge?: BridgeObject };
  if (w.__nomadicAgent) return w.__nomadicAgent;
  extraHandlers = extra;
  const frameId = randomId();
  const agent: InstalledAgent = { frameId, handle: handleRequest };
  Object.defineProperty(window, '__nomadicAgent', { value: agent, configurable: false, enumerable: false, writable: false });

  // The WebView normally defines nomadicBridge before document-start scripts run; if it shows up a
  // little later, connect then (checked every 50 ms for 10 s).
  if (w.nomadicBridge) connect(w.nomadicBridge, frameId);
  else {
    const started = Date.now();
    const timer = setInterval(() => {
      if (w.nomadicBridge) { clearInterval(timer); connect(w.nomadicBridge, frameId); }
      else if (Date.now() - started > 10_000) clearInterval(timer);
    }, 50);
  }
  return agent;
}
