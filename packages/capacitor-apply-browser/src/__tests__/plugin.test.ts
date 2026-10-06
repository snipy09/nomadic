import { describe, expect, it, vi } from 'vitest';
import type { ApplyBrowserPlugin } from '../definitions.js';
import { openApplyBrowser, pluginTransport } from '../index.js';

type Listener = (e: { data: string }) => void;

/** In-memory ApplyBrowser: records calls, lets the test play agent messages. */
function fakePlugin(opts: { supported?: boolean; failOpen?: boolean } = {}) {
  const listeners = new Set<Listener>();
  const calls: string[] = [];
  const posted: Array<{ frameId: string; data: string }> = [];
  const plugin = {
    isSupported: vi.fn(async () => ({ supported: opts.supported ?? true, reason: opts.supported === false ? 'Update WebView' : undefined })),
    open: vi.fn(async (o: { url: string; agentScript: string }) => {
      calls.push(`open:${listeners.size}`);
      if (opts.failOpen) throw new Error('boom');
      expect(o.agentScript.length).toBeGreaterThan(1000);
    }),
    postMessage: vi.fn(async (o: { frameId: string; data: string }) => { posted.push(o); }),
    close: vi.fn(async () => { calls.push('close'); }),
    show: vi.fn(), hide: vi.fn(), removeAllListeners: vi.fn(),
    addListener: vi.fn(async (_event: string, l: Listener) => {
      listeners.add(l);
      return { remove: async () => { listeners.delete(l); } };
    }),
  } as unknown as ApplyBrowserPlugin;
  const emit = (m: object) => listeners.forEach((l) => l({ data: JSON.stringify(m) }));
  return { plugin, calls, posted, emit, listeners };
}

describe('ApplyBrowser wrapper', () => {
  it('listens for agent messages before the page starts loading, then routes requests by frame', async () => {
    const f = fakePlugin();
    const session = await openApplyBrowser(f.plugin, 'https://jobs.lever.co/acme/123/apply');
    expect(f.calls).toEqual(['open:1']); // a listener existed when open() ran
    f.emit({ t: 'hello', frameId: 'top1', url: 'https://jobs.lever.co/acme/123/apply', top: true, readyState: 'complete', version: 1 });
    const pending = session.channel.call('top1', 'walls', {});
    await Promise.resolve();
    expect(f.posted[0].frameId).toBe('top1');
    const req = JSON.parse(f.posted[0].data);
    f.emit({ t: 'res', frameId: 'top1', id: req.id, ok: true, result: [] });
    await expect(pending).resolves.toEqual([]);
    await session.close();
    expect(f.calls).toContain('close');
  });

  it('refuses non-web links and phones whose WebView is too old', async () => {
    await expect(openApplyBrowser(fakePlugin().plugin, 'javascript:alert(1)')).rejects.toThrow(/http/);
    await expect(openApplyBrowser(fakePlugin({ supported: false }).plugin, 'https://x.test/')).rejects.toThrow(/Update WebView/);
  });

  it('a failed open leaves no listener behind', async () => {
    const f = fakePlugin({ failOpen: true });
    await expect(openApplyBrowser(f.plugin, 'https://x.test/')).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));
    expect(f.listeners.size).toBe(0);
  });

  it('a request to a frame the WebView no longer has fails at once', async () => {
    const f = fakePlugin();
    (f.plugin.postMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('frame x is gone'));
    const t = pluginTransport(f.plugin);
    await t.ready;
    await expect(Promise.resolve(t.send('x', '{}'))).rejects.toThrow(/gone/);
  });
});
