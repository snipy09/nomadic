/**
 * Runs the Android instrumentation harness on desktop Chromium, with Playwright standing in
 * for the native side (TestHostActivity + ApplyBrowserController): a host page runs harness.js,
 * AndroidHarness.open() loads the fixture in a second page whose frames get the bridge + agent at
 * document start, and messages are relayed both ways. Same assets, same CSP, same two origins.
 * Use it to debug the harness without an emulator:
 *
 *   npm run build:android-test -w @nomadic/capacitor-apply-browser
 *   npx tsx packages/capacitor-apply-browser/android-test-harness/simulate.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices, type BrowserContext, type Frame } from 'playwright';
import { startFixtureServers } from '../../form-bench/src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.resolve(here, '../android/build/generated/nomadic-test-assets/www');
const CSP = "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'";

const BRIDGE_SHIM = `(() => {
  if (window.nomadicBridge) return;
  const post = window.__nativePost;
  Object.defineProperty(window, 'nomadicBridge', { value: { onmessage: null, postMessage(d) { post(String(d)); } } });
})();`;

async function main() {
  if (!fs.existsSync(www)) throw new Error('run npm run build:android-test -w @nomadic/capacitor-apply-browser first');
  const servers = await startFixtureServers(www, { csp: CSP });
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({ executablePath });
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  let apply: { ctx: BrowserContext; frames: Map<string, Frame> } | null = null;
  let finished: (json: string) => void = () => {};
  const done = new Promise<string>((r) => { finished = r; });

  const toHost = (data: string) => host.evaluate((d) => (window as unknown as { __nomadicHarness: { receive(d: string): void } }).__nomadicHarness.receive(d), data).catch(() => {});

  await hostCtx.exposeBinding('__harnessOpen', async (_src, url: string, script: string) => {
    await apply?.ctx.close();
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const frames = new Map<string, Frame>();
    await ctx.exposeBinding('__nativePost', ({ frame }, data: string) => {
      // What ApplyBrowserController.onPostMessage does: track frames, take `top` from the WebView, forward.
      const m = JSON.parse(data);
      if (m.t === 'hello') { frames.set(m.frameId, frame); m.top = frame === frame.page().mainFrame(); data = JSON.stringify(m); }
      else if (frames.get(m.frameId) !== frame) return;
      if (m.t === 'bye') frames.delete(m.frameId);
      void toHost(data);
    });
    await ctx.addInitScript({ content: `${BRIDGE_SHIM}\n${script}` });
    apply = { ctx, frames };
    const page = await ctx.newPage();
    void page.goto(url).catch(() => {});
  });
  await hostCtx.exposeBinding('__harnessPost', async (_src, frameId: string, data: string) => {
    const f = apply?.frames.get(frameId);
    if (!f || f.isDetached()) return false;
    await f.evaluate((d) => (window as unknown as { nomadicBridge: { onmessage(e: { data: string }): void } }).nomadicBridge.onmessage({ data: d }), data).catch(() => {});
    return true;
  });
  await hostCtx.exposeBinding('__harnessClose', async () => { await apply?.ctx.close(); apply = null; });
  await hostCtx.exposeBinding('__harnessLog', (_src, msg: string) => console.log(msg));
  await hostCtx.exposeBinding('__harnessDone', (_src, json: string) => finished(json));
  await hostCtx.addInitScript({ content: `window.AndroidHarness = { open: (u, s) => { window.__harnessOpen(u, s); }, post: (f, d) => { window.__harnessPost(f, d); return true; }, close: () => window.__harnessClose(), log: (m) => window.__harnessLog(m), done: (j) => window.__harnessDone(j) };` });
  await host.goto(`${servers.originA}/_harness/index.html`);

  const out = JSON.parse(await done);
  await browser.close();
  await servers.close();
  if (out.fatal) throw new Error(out.fatal);
  console.log(JSON.stringify({ summary: out.summary, review: out.review }, null, 2));
  const s = out.summary;
  const ok = s.correct === s.fields && s.wrong === 0 && s.submitClicked === 0 && s.wallsDetected === s.wallsExpected && out.review.ok;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
