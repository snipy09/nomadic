import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const handleMock = vi.fn();
vi.mock('electron', () => ({ ipcMain: { handle: (...args: unknown[]) => handleMock(...args) } }));

import { createListener, handle, setIpcSenderGuard, validateArgs, IpcValidationError, type ArgSchemas } from '../ipc/handle';
import * as schemas from '../ipc/schemas';
import { IPC_CHANNELS } from '../../shared/ipc';

const fakeEvent = (url = 'file:///app/out/renderer/index.html') => ({ senderFrame: { url } }) as any;

describe('typed IPC handle()', () => {
  beforeEach(() => {
    handleMock.mockReset();
    setIpcSenderGuard(() => true);
  });

  it('registers the channel with ipcMain and forwards validated args', async () => {
    const impl = vi.fn((url: string) => ({ success: url.startsWith('https://') }));
    handle('open-external-url', schemas.openExternalUrlArgs, impl);
    expect(handleMock).toHaveBeenCalledWith('open-external-url', expect.any(Function));
    const listener = handleMock.mock.calls[0][1];
    await expect(listener(fakeEvent(), 'https://example.com')).resolves.toEqual({ success: true });
    expect(impl).toHaveBeenCalledWith('https://example.com');
  });

  it('calls zero-arg handlers without passing renderer arguments', async () => {
    const impl = vi.fn(() => ({ success: true }));
    const listener = createListener('cancel-autonomous-apply', impl);
    await listener(fakeEvent(), 'ignored', 42);
    expect(impl).toHaveBeenCalledWith();
  });

  it('rejects invalid input before the handler runs', async () => {
    const impl = vi.fn(() => ({ success: true }));
    const listener = createListener('delete-resume', schemas.resumeIdArgs, impl);
    await expect(listener(fakeEvent(), 'not-a-number')).rejects.toBeInstanceOf(IpcValidationError);
    expect(impl).not.toHaveBeenCalled();
  });

  it('blocks calls from untrusted senders', async () => {
    setIpcSenderGuard((e) => String(e.senderFrame?.url).startsWith('file://'));
    const impl = vi.fn(() => ({ success: true }));
    const listener = createListener('stop-heartbeat', impl);
    await expect(listener(fakeEvent('https://evil.example'), undefined)).rejects.toThrow(/untrusted sender/);
    expect(impl).not.toHaveBeenCalled();
  });

  it('enforces schema/arg types at compile time', () => {
    // @ts-expect-error a number schema cannot validate a string channel argument
    const bad: ArgSchemas<'open-external-url'> = [z.number()];
    expect(bad).toHaveLength(1);
  });

  it('lists every invoke channel exactly once', () => {
    expect(new Set(IPC_CHANNELS).size).toBe(77);
    expect(IPC_CHANNELS.length).toBe(77);
  });
});

describe('IPC input validation schemas', () => {
  it('normalises null optionals to undefined and keeps extra fields', () => {
    const [opts] = validateArgs('get-cloud-feed-page', schemas.cloudFeedPageArgs, [{ page: 2, search: null, extra: 'x' }]);
    expect(opts).toEqual({ page: 2, search: undefined, extra: 'x' });
    expect(validateArgs('get-cloud-feed-page', schemas.cloudFeedPageArgs, [])).toEqual([undefined]);
  });

  it('accepts real renderer payloads', () => {
    expect(() =>
      validateArgs('save-master-profile', schemas.saveMasterProfileArgs, [
        { firstName: 'A', groqApiKey: 'gsk_x', customAnswersJson: '{}', onboarding_completed: 1, saveScreenshots: true },
      ])
    ).not.toThrow();
    expect(() =>
      validateArgs('start-heartbeat', schemas.heartbeatArgs, [{ userId: 7, sessionToken: 't', deviceFingerprint: 'f' }])
    ).not.toThrow();
    expect(validateArgs('start-heartbeat', schemas.heartbeatArgs, [{ userId: 7, sessionToken: 't', deviceFingerprint: 'f' }])[0].userId).toBe('7');
  });

  it('rejects wrong types and oversize input with readable issues', () => {
    expect(() => validateArgs('launch-autonomous', schemas.jobUrlsArgs, ['https://a'])).toThrow(/arg0/);
    expect(() => validateArgs('send-outreach', schemas.sendOutreachArgs, [[{ name: 'x' }]])).toThrow(/arg0\.0\.email/);
    expect(() => validateArgs('verify-email', schemas.emailArgs, ['a'.repeat(400)])).toThrow(IpcValidationError);
    expect(() => validateArgs('save-master-profile', schemas.saveMasterProfileArgs, [{ groqApiKey: 123 }])).toThrow();
  });
});
