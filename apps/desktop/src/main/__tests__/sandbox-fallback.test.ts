import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  STATUS_DLL_NOT_FOUND,
  isSandboxStartupFailure,
  planRelaunch,
  readSandboxFallback,
  shouldRunWithoutSandbox,
  writeSandboxFallback,
} from '../sandbox-fallback';

describe('sandbox fallback', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomadic-sandbox-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('treats only STATUS_DLL_NOT_FOUND as a sandbox startup failure', () => {
    expect(isSandboxStartupFailure(STATUS_DLL_NOT_FOUND)).toBe(true);
    expect(isSandboxStartupFailure(-1073741819)).toBe(false); // access violation: a real crash
    expect(isSandboxStartupFailure(0)).toBe(false);
    expect(isSandboxStartupFailure(undefined)).toBe(false);
  });

  it('keeps the sandbox on when nothing was recorded', () => {
    expect(readSandboxFallback(dir)).toBeNull();
    expect(shouldRunWithoutSandbox({}, null, '1.0.8')).toBe(false);
  });

  it('turns the sandbox off for the version that recorded a failure only', () => {
    writeSandboxFallback(dir, '1.0.8', new Date('2026-10-04T10:00:00Z'));
    const marker = readSandboxFallback(dir);
    expect(marker).toEqual({ appVersion: '1.0.8', recordedAt: '2026-10-04T10:00:00.000Z' });
    expect(shouldRunWithoutSandbox({}, marker, '1.0.8')).toBe(true);
    expect(shouldRunWithoutSandbox({}, marker, '1.0.9')).toBe(false);
  });

  it('honours the NOMADIC_DISABLE_SANDBOX escape hatch', () => {
    expect(shouldRunWithoutSandbox({ NOMADIC_DISABLE_SANDBOX: 'true' }, null, '1.0.8')).toBe(true);
    expect(shouldRunWithoutSandbox({ NOMADIC_DISABLE_SANDBOX: '1' }, null, '1.0.8')).toBe(false);
  });

  it('ignores a corrupt marker file', () => {
    fs.writeFileSync(path.join(dir, 'sandbox-fallback.json'), '{not json');
    expect(readSandboxFallback(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'sandbox-fallback.json'), JSON.stringify({ appVersion: 7 }));
    expect(readSandboxFallback(dir)).toBeNull();
  });

  it('does not throw when the marker cannot be written', () => {
    expect(() => writeSandboxFallback(path.join(dir, 'missing', 'deeper'), '1.0.8')).not.toThrow();
  });

  it('relaunches in place outside the portable build', () => {
    expect(planRelaunch({}, 'C:\\Temp')).toEqual({ kind: 'electron', options: {} });
  });

  it('restarts the portable .exe with a temp folder of its own instead of relaunching from the shared one', () => {
    const exe = 'C:\\Users\\a b\\Downloads\\Nomadic-v1.0.9-portable.exe';
    const plan = planRelaunch(
      { PORTABLE_EXECUTABLE_FILE: exe, TEMP: 'C:\\Users\\a b\\AppData\\Local\\Temp', NOMADIC_DISABLE_SANDBOX: 'true' },
      'C:\\Users\\a b\\AppData\\Local\\Temp',
    );
    const tempDir = 'C:\\Users\\a b\\AppData\\Local\\Temp\\NomadicRestart';
    expect(plan).toEqual({
      kind: 'portable',
      file: exe,
      tempDir,
      env: { PORTABLE_EXECUTABLE_FILE: exe, TEMP: tempDir, TMP: tempDir, NOMADIC_DISABLE_SANDBOX: 'true' },
    });
  });
});
