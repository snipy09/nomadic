import { describe, expect, it, vi } from 'vitest';

vi.mock('../stealth-evasion.js', () => ({ injectStealthScripts: vi.fn(async () => {}), handleCloudflareTurnstile: vi.fn(async () => ({ detected: false })) }));
vi.mock('../fast-route-interceptor.js', () => ({ enableFastRouteInterception: vi.fn(async () => {}) }));

import { runFormEngineApply } from '../apply-flow';

/** A page whose navigation hangs until the tab is closed, like a slow portal. */
function hangingPage() {
  let reject: (e: Error) => void = () => {};
  const page = {
    on: vi.fn(),
    close: vi.fn(async () => { reject(new Error('Target page, context or browser has been closed')); }),
    goto: vi.fn(() => new Promise((_res, rej) => { reject = rej; })),
  };
  return page;
}

const Engine = { emitStatus: vi.fn() } as any;
const opts = (signal: AbortSignal) => ({ autoSubmit: false, signal, onReadyForReview: vi.fn() });

describe('runFormEngineApply cancel', () => {
  it('does not open a tab when the signal is already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const context = { newPage: vi.fn() } as any;
    const res = await runFormEngineApply(Engine, context, 'https://jobs.example/1', {} as any, undefined, opts(ctl.signal));
    expect(res).toMatchObject({ cancelled: true, submitted: false });
    expect(context.newPage).not.toHaveBeenCalled();
  });

  it('closes the tab mid-fill and reports cancelled, never holding it for review', async () => {
    const ctl = new AbortController();
    const page = hangingPage();
    const context = { newPage: vi.fn(async () => page) } as any;
    const o = opts(ctl.signal);
    const run = runFormEngineApply(Engine, context, 'https://jobs.example/1', {} as any, undefined, o);
    await vi.waitFor(() => expect(page.goto).toHaveBeenCalled());
    ctl.abort();
    const res = await run;
    expect(page.close).toHaveBeenCalled();
    expect(res).toMatchObject({ cancelled: true, submitted: false, prefilled: false });
    expect(o.onReadyForReview).not.toHaveBeenCalled();
  });
});
