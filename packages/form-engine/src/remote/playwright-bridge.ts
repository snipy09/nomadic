/**
 * Test/bench transport: gives every frame of a Playwright browser context the same
 * `window.nomadicBridge` object the Android WebView provides (WebMessageListener) and
 * injects the agent bundle at document start, so the remote engine runs exactly as on a
 * phone. Requests reach the page only through `nomadicBridge.onmessage`; no Playwright
 * input (mouse, keyboard, fill, setInputFiles) is ever used.
 *
 * Node-only (Playwright). Not exported from remote/index.ts.
 */
import type { BrowserContext, Frame } from 'playwright';
import { AGENT_SCRIPT } from '../agent/bundle.generated.js';
import type { BridgeTransport } from './channel.js';

/** What the WebView's WebMessageListener injects: postMessage + onmessage, before any page script. */
const BRIDGE_SHIM = `(() => {
  if (window.nomadicBridge) return;
  const post = window.__nomadicBridgePost;
  const bridge = { onmessage: null, postMessage(data) { post(String(data)); } };
  Object.defineProperty(window, 'nomadicBridge', { value: bridge, enumerable: false, configurable: false, writable: false });
})();`;

export async function attachPlaywrightBridge(context: BrowserContext, script: string = AGENT_SCRIPT): Promise<BridgeTransport> {
  const frames = new Map<string, Frame>();
  const listeners = new Set<(data: string) => void>();
  await context.exposeBinding('__nomadicBridgePost', ({ frame }, data: string) => {
    try {
      const m = JSON.parse(data) as { t?: string; frameId?: string };
      if (m.t === 'hello' && m.frameId) frames.set(m.frameId, frame);
      if (m.t === 'bye' && m.frameId) frames.delete(m.frameId);
    } catch { /* agent messages are JSON */ }
    for (const l of listeners) l(data);
  });
  await context.addInitScript({ content: `${BRIDGE_SHIM}\n${script}` });
  return {
    async send(frameId, data) {
      const frame = frames.get(frameId);
      if (!frame || frame.isDetached()) throw new Error(`frame ${frameId} is gone`);
      // Same delivery as JavaScriptReplyProxy.postMessage: a MessageEvent-like object on onmessage.
      await frame.evaluate((d) => {
        const b = (window as unknown as { nomadicBridge?: { onmessage: ((e: { data: string }) => void) | null } }).nomadicBridge;
        b?.onmessage?.({ data: d });
      }, data);
    },
    onMessage(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
