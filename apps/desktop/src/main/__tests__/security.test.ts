import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() }, app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('@job-automator/automation', () => ({ findChromeExecutable: vi.fn(), ensureChromeForTesting: vi.fn() }));

import { buildContentSecurityPolicy, createIpcSenderGuard, isAppUrl } from '../security';
import { updateChannelArgs } from '../ipc/schemas';

describe('Electron hardening', () => {
  it('production CSP only allows bundled scripts and known API hosts', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).not.toContain('api.groq.com');
    expect(csp).not.toContain('generativelanguage.googleapis.com');
    expect(csp).toContain('frame-src https://www.youtube.com');
    expect(csp).toContain("object-src 'none'");
  });

  it('dev CSP allows the Vite server and HMR socket', () => {
    const csp = buildContentSecurityPolicy('http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
    expect(csp).toMatch(/script-src [^;]*http:\/\/localhost:5173/);
  });

  it('recognises app URLs and rejects foreign IPC senders', () => {
    expect(isAppUrl('file:///C:/app/index.html')).toBe(true);
    expect(isAppUrl('http://localhost:5173/#/feed', 'http://localhost:5173')).toBe(true);
    expect(isAppUrl('https://evil.example')).toBe(false);
    const guard = createIpcSenderGuard({});
    expect(guard({ senderFrame: { url: 'file:///app/index.html' } } as any)).toBe(true);
    expect(guard({ senderFrame: { url: 'https://evil.example' } } as any)).toBe(false);
    expect(guard({ senderFrame: null } as any)).toBe(false);
  });

  it('update IPC accepts only the two channels and never a file path or URL', () => {
    expect(updateChannelArgs[0].safeParse('stable').success).toBe(true);
    expect(updateChannelArgs[0].safeParse('beta').success).toBe(true);
    expect(updateChannelArgs[0].safeParse('C:/Windows/System32/cmd.exe').success).toBe(false);
    expect(updateChannelArgs[0].safeParse('https://evil.example/latest.yml').success).toBe(false);
  });
});
