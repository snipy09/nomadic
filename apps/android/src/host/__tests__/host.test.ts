import { createHash as nodeHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from '../node/crypto';
import { basename, dirname, extname, join, normalize } from '../node/path';
import { phoneName } from '../device';
import { DESKTOP_ONLY_ERROR, contextBridge, emitToRenderer, ipcMain, ipcRenderer } from '../electron';

describe('crypto stand-in', () => {
  it('matches Node sha256 for short, block-sized and long inputs', () => {
    for (const input of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é ü 漢字 🚀', 'x'.repeat(10_000)]) {
      expect(createHash('sha256').update(input).digest('hex')).toBe(nodeHash('sha256').update(input).digest('hex'));
    }
  });

  it('hashes chained updates like one update', () => {
    expect(createHash('sha256').update('ab').update('c').digest('hex')).toBe(nodeHash('sha256').update('abc').digest('hex'));
  });

  it('refuses other algorithms and makes UUIDs', () => {
    expect(() => createHash('md5')).toThrow();
    expect(randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('path stand-in', () => {
  it('joins and splits POSIX paths', () => {
    expect(join('/nomadic', 'a', '../b', 'c.db')).toBe('/nomadic/b/c.db');
    expect(normalize('a//b/./c')).toBe('a/b/c');
    expect(dirname('/x/y/z.txt')).toBe('/x/y');
    expect(basename('/x/y/z.txt', '.txt')).toBe('z');
    expect(extname('resume.final.pdf')).toBe('.pdf');
  });
});

describe('phone name', () => {
  it('reads the model and Android version from the WebView user agent', () => {
    expect(phoneName('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36')).toBe('Pixel 7 (Android 14)');
    expect(phoneName('Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36')).toBe('SM-S921B (Android 15)');
    // Chrome's reduced user agent hides the model as "K".
    expect(phoneName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36')).toBe('Android 10 phone');
    expect(phoneName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Android phone');
  });
});

describe('in-WebView IPC', () => {
  it('routes invoke to the registered handler with its arguments', async () => {
    ipcMain.handle('test-echo', (_e, a, b) => ({ a, b }));
    await expect(ipcRenderer.invoke('test-echo', 1, 'two')).resolves.toEqual({ a: 1, b: 'two' });
  });

  it('answers channels the phone does not have with a desktop-only result', async () => {
    await expect(ipcRenderer.invoke('start-batch-copilot', [])).resolves.toMatchObject({ success: false, code: 'desktop_only', error: DESKTOP_ONLY_ERROR });
  });

  it('delivers main -> renderer events to subscribers until they unsubscribe', () => {
    const cb = vi.fn();
    ipcRenderer.on('log', cb);
    emitToRenderer('log', 'hello');
    ipcRenderer.removeListener('log', cb);
    emitToRenderer('log', 'again');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({}, 'hello');
  });

  it('exposes the preload API on window', () => {
    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);
    contextBridge.exposeInMainWorld('api', { ok: true });
    expect(win.api).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });
});
