import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { AgentChannel, FrameGoneError, type BridgeTransport } from '../remote/channel.js';
import { fillApplication, submitReviewed } from '../remote/apply.js';
import { attachPlaywrightBridge } from '../remote/playwright-bridge.js';
import { AGENT_SCRIPT } from '../agent/bundle.generated.js';
import { outcomeKey } from '../core.js';
import { tryLaunch } from './helpers.js';
// @ts-expect-error plain .mjs build script without types
import { buildAgentSource } from '../../scripts/build-agent.mjs';
import { startFixtureServers, type FixtureServers } from '../../../form-bench/src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../../../form-bench/fixtures');
const PROFILES = path.resolve(here, '../../../form-bench/profiles');
/** No 'unsafe-eval': page code cannot eval. Inline handlers stay allowed (the fixtures' own onclick submit buttons use them). */
const CSP = "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'";
const VIOLATIONS = `window.__cspViolations = []; document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(e.violatedDirective + ' ' + e.blockedURI));`;

/** In-memory transport: frames are fake agents answering with canned results. */
function fakeTransport() {
  const listeners = new Set<(d: string) => void>();
  const sent: Array<{ frameId: string; data: string }> = [];
  const t: BridgeTransport = {
    send: (frameId, data) => { sent.push({ frameId, data }); },
    onMessage: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  const emit = (m: object) => listeners.forEach((l) => l(JSON.stringify(m)));
  return { t, sent, emit };
}

describe('AgentChannel', () => {
  it('lists the top frame first and routes replies only from the frame asked', async () => {
    const { t, sent, emit } = fakeTransport();
    const ch = new AgentChannel(t);
    emit({ t: 'hello', frameId: 'child', url: 'https://b/x', top: false, readyState: 'complete', version: 1 });
    emit({ t: 'hello', frameId: 'main', url: 'https://a/', top: true, readyState: 'complete', version: 1 });
    expect(ch.frames().map((f) => f.id)).toEqual(['main', 'child']);
    expect(ch.url()).toBe('https://a/');
    const p = ch.call('child', 'walls', {});
    const req = JSON.parse(sent[0].data);
    expect(sent[0].frameId).toBe('child');
    emit({ t: 'res', frameId: 'main', id: req.id, ok: true, result: ['login'] }); // wrong frame: ignored
    emit({ t: 'res', frameId: 'child', id: req.id, ok: true, result: ['captcha'] });
    await expect(p).resolves.toEqual(['captcha']);
    ch.close();
  });

  it('fails pending calls when the frame goes away and replaces the top frame on navigation', async () => {
    const { t, emit } = fakeTransport();
    const ch = new AgentChannel(t);
    emit({ t: 'hello', frameId: 'p1', url: 'https://a/1', top: true, readyState: 'loading', version: 1 });
    const pending = ch.call('p1', 'scan', {});
    const ready = ch.waitForTop('interactive', 2000);
    emit({ t: 'bye', frameId: 'p1' });
    await expect(pending).rejects.toBeInstanceOf(FrameGoneError);
    emit({ t: 'hello', frameId: 'p2', url: 'https://a/2', top: true, readyState: 'interactive', version: 1 });
    await expect(ready).resolves.toBe(true);
    emit({ t: 'hello', frameId: 'p3', url: 'https://a/3', top: true, readyState: 'complete', version: 1 });
    expect(ch.frames().map((f) => f.id)).toEqual(['p3']);
    await expect(ch.call('p2', 'ping', {})).rejects.toBeInstanceOf(FrameGoneError);
    ch.close();
  });

  it('times out a frame that never answers', async () => {
    const { t, emit } = fakeTransport();
    const ch = new AgentChannel(t);
    emit({ t: 'hello', frameId: 'm', url: 'https://a/', top: true, readyState: 'complete', version: 1 });
    await expect(ch.call('m', 'ping', {}, 50)).rejects.toThrow(/timed out/);
    ch.close();
  });
});

describe('agent bundle', () => {
  it('bundle.generated.ts is up to date with src/agent', async () => {
    expect(await buildAgentSource()).toBe(AGENT_SCRIPT);
  });

  it('the Android entry imports nothing from Node or Playwright', async () => {
    const r = await build({ entryPoints: [path.resolve(here, '../remote/index.ts')], bundle: true, write: false, format: 'esm', platform: 'browser', metafile: true, logLevel: 'silent' });
    const outside = Object.keys(r.metafile.inputs).filter((i) => !i.includes('form-engine/src/') && !/node_modules\/zod\//.test(i));
    expect(outside).toEqual([]);
  });
});

const browser: Browser | null = await tryLaunch();
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browser)('Android agent in a phone-sized page under strict CSP', () => {
  let servers: FixtureServers;
  beforeAll(async () => { servers = await startFixtureServers(FIXTURES, { csp: CSP }); });
  afterAll(async () => { await servers?.close(); });

  const profile = () => ({ ...JSON.parse(fs.readFileSync(path.join(PROFILES, 'sample.json'), 'utf8')), resumeFilePath: path.join(PROFILES, 'sample-resume.pdf') });
  const loadFile = async (ref: string) => (fs.existsSync(ref) ? { name: path.basename(ref), mimeType: 'application/pdf', base64: fs.readFileSync(ref).toString('base64') } : null);

  async function open(fixture: string, withAgent = true): Promise<{ ctx: BrowserContext; page: Page; channel: AgentChannel | null }> {
    const ctx = await browser!.newContext({ ...devices['Pixel 7'] });
    await ctx.addInitScript({ content: VIOLATIONS });
    const channel = withAgent ? new AgentChannel(await attachPlaywrightBridge(ctx)) : null;
    const page = await ctx.newPage();
    await page.goto(`${servers.originA}/${fixture}/index.html`);
    await page.waitForFunction(() => (window as unknown as { __fixtureReady?: boolean }).__fixtureReady === true);
    return { ctx, page, channel };
  }

  it('the pages are served with a CSP that blocks eval for page code', async () => {
    const { ctx, page } = await open('lever-basic', false);
    const res = await page.request.get(page.url());
    expect(res.headers()['content-security-policy']).toBe(CSP);
    await ctx.close();
    // The page's own script trying eval is refused (DevTools-evaluated code would bypass CSP, so use a real script).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><script src="check.js"></script>');
    fs.writeFileSync(path.join(dir, 'check.js'), "try { eval('1'); window.__ev = 'ran'; } catch (e) { window.__ev = 'blocked'; }");
    const s2 = await startFixtureServers(dir, { csp: CSP });
    const ctx2 = await browser!.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(`${s2.originA}/index.html`);
    expect(await p2.evaluate(() => (window as unknown as { __ev?: string }).__ev)).toBe('blocked');
    await ctx2.close();
    await s2.close();
  });

  it('fills a cross-origin iframe form, holds it for review and submits only after "reviewed"', async () => {
    const { ctx, page, channel } = await open('greenhouse-iframe-embed');
    const res = await fillApplication(channel!, { profile: profile(), portal: 'greenhouse', llm: null, resolveResume: (p) => p.resumeFilePath || null, loadFile });
    expect(res.report!.filled).toBeGreaterThan(5);
    expect(res.report!.fields.some((o) => o.field.frameIndex === 1 && o.status === 'filled')).toBe(true);
    expect(res.handle).toBeDefined();
    const submitted = () => Promise.all(page.frames().map((f) => f.evaluate(() => Boolean((window as unknown as { __submitted?: boolean }).__submitted)).catch(() => false))).then((v) => v.some(Boolean));
    expect(await submitted()).toBe(false);

    const refused = await submitReviewed(res.handle!, {}, { reviewed: false });
    expect(refused.submitted).toBe(false);
    expect(await submitted()).toBe(false);

    // The candidate fills what the engine left for them, edits one value, ticks "reviewed".
    const overrides: Record<string, string> = {};
    for (const o of res.report!.fields) if (o.field.required && o.status !== 'filled' && o.field.kind !== 'file') overrides[outcomeKey(o)] = o.field.options?.[0]?.label || 'Reviewed answer';
    const phone = res.report!.fields.find((o) => /phone/i.test(o.field.label));
    if (phone) overrides[outcomeKey(phone)] = '+91 98765 43210';
    const done = await submitReviewed(res.handle!, overrides, { reviewed: true });
    expect(done.error ?? '').not.toMatch(/Required fields still need you|Blocked/);
    expect(done.submitted).toBe(true);
    expect(await submitted()).toBe(true);
    if (phone) expect(phone.status).toBe('filled');
    // The agent never did anything the page's CSP had to block.
    const violations = await Promise.all(page.frames().map((f) => f.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations || []).catch(() => [])));
    expect(violations.flat()).toEqual([]);
    channel!.close();
    await ctx.close();
  });

  it('walks a multi-step Workday flow and reports the sign-in wall on the login fixture', async () => {
    const multi = await open('workday-multistep');
    const res = await fillApplication(multi.channel!, { profile: profile(), portal: 'workday', llm: null, resolveResume: (p) => p.resumeFilePath || null, loadFile });
    expect(res.report!.filled).toBeGreaterThan(10);
    expect(await multi.page.evaluate(() => Boolean((window as unknown as { __submitted?: boolean }).__submitted))).toBe(false);
    multi.channel!.close();
    await multi.ctx.close();

    const wall = await open('workday-login-wall');
    const w = await fillApplication(wall.channel!, { profile: profile(), portal: 'workday', llm: null });
    expect(w.status).toBe('login');
    wall.channel!.close();
    await wall.ctx.close();
  });

  it('without the injected agent there is nothing to drive (no hidden Playwright fallback)', async () => {
    const { ctx } = await open('lever-basic', false);
    const lonely = new AgentChannel({ send: () => {}, onMessage: () => () => {} });
    const res = await fillApplication(lonely, { profile: profile(), llm: null, loadTimeoutMs: 300 });
    expect(res.status).toBe('error');
    await ctx.close();
  });
});
