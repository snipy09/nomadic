/**
 * Host side of the agent bridge: tracks the agent in every frame of the apply WebView and
 * routes requests to them. Runs in the app (browser JS), not in the page.
 *
 * The transport is whatever carries strings between the app and the page frames:
 * the Capacitor ApplyBrowser plugin on Android, Playwright in tests.
 */
import type { AgentCommand, AgentCommands, AgentMessage, AgentRequest } from '../agent/protocol.js';

export interface BridgeTransport {
  /** Deliver one request (JSON string) to the frame whose agent has this id. */
  send(frameId: string, data: string): void | Promise<void>;
  /** Agent messages (JSON strings) from every frame. Returns an unsubscribe function. */
  onMessage(cb: (data: string) => void): () => void;
}

export interface AgentFrame {
  id: string;
  url: string;
  top: boolean;
  readyState: DocumentReadyState;
}

const READY_RANK: Record<DocumentReadyState, number> = { loading: 0, interactive: 1, complete: 2 };

/** Per-command time limits (ms). Writes can type, wait for option lists and upload files. */
const TIMEOUTS: Partial<Record<AgentCommand, number>> = { write: 30_000, verify: 15_000, scan: 15_000 };
const DEFAULT_TIMEOUT = 10_000;

export class FrameGoneError extends Error {
  constructor(frameId: string) {
    super(`frame ${frameId} is gone (navigated or closed)`);
    this.name = 'FrameGoneError';
  }
}

interface Pending {
  frameId: string;
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class AgentChannel {
  private readonly framesById = new Map<string, AgentFrame>();
  private readonly pending = new Map<number, Pending>();
  private readonly waiters = new Set<() => void>();
  private nextId = 1;
  private readonly unsubscribe: () => void;

  constructor(private readonly transport: BridgeTransport) {
    this.unsubscribe = transport.onMessage((data) => this.receive(data));
  }

  close(): void {
    this.unsubscribe();
    for (const id of [...this.framesById.keys()]) this.drop(id);
  }

  /** Live frames, the top frame first, then iframes in the order their agents started. */
  frames(): AgentFrame[] {
    const all = [...this.framesById.values()];
    return [...all.filter((f) => f.top), ...all.filter((f) => !f.top)];
  }

  top(): AgentFrame | undefined {
    return this.frames().find((f) => f.top);
  }

  url(): string {
    return this.top()?.url || '';
  }

  call<C extends AgentCommand>(frameId: string, cmd: C, args: AgentCommands[C]['args'], timeoutMs = TIMEOUTS[cmd] ?? DEFAULT_TIMEOUT): Promise<AgentCommands[C]['result']> {
    if (!this.framesById.has(frameId)) return Promise.reject(new FrameGoneError(frameId));
    const id = this.nextId++;
    const req: AgentRequest<C> = { t: 'req', id, cmd, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`agent ${cmd} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { frameId, resolve: resolve as (v: unknown) => void, reject, timer });
      Promise.resolve(this.transport.send(frameId, JSON.stringify(req))).catch((err: Error) => {
        const p = this.pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.reject(err);
      });
    });
  }

  /** Wait until the top frame's agent reports at least `state` (after a navigation, too). */
  async waitForTop(state: DocumentReadyState = 'interactive', timeoutMs = 15_000): Promise<boolean> {
    const ok = () => {
      const t = this.top();
      return !!t && READY_RANK[t.readyState] >= READY_RANK[state];
    };
    if (ok()) return true;
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        resolve(v);
      };
      const check = () => { if (ok()) done(true); };
      const timer = setTimeout(() => done(ok()), timeoutMs);
      this.waiters.add(check);
    });
  }

  private receive(data: string): void {
    let m: AgentMessage;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object' || typeof (m as { frameId?: unknown }).frameId !== 'string') return;
    switch (m.t) {
      case 'hello':
        // A new document in a frame: a top-level hello replaces the old top frame.
        if (m.top) for (const f of [...this.framesById.values()]) if (f.top && f.id !== m.frameId) this.drop(f.id);
        this.framesById.set(m.frameId, { id: m.frameId, url: m.url, top: m.top, readyState: m.readyState });
        break;
      case 'state': {
        const f = this.framesById.get(m.frameId);
        if (f) { f.url = m.url; f.readyState = m.readyState; }
        break;
      }
      case 'bye':
        this.drop(m.frameId);
        break;
      case 'res': {
        const p = this.pending.get(m.id);
        // Only the frame the request went to may answer it.
        if (!p || p.frameId !== m.frameId) return;
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(m.error));
        break;
      }
      default:
        return;
    }
    for (const w of [...this.waiters]) w();
  }

  private drop(frameId: string): void {
    this.framesById.delete(frameId);
    for (const [id, p] of [...this.pending]) {
      if (p.frameId !== frameId) continue;
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(new FrameGoneError(frameId));
    }
  }
}
