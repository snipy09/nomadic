import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAC_DOWNLOAD, macChecksumsPath, macDownloadPath } from '@nomadic/config';
import { archFromGpuRenderer, detectMac, isMacNavigator } from '../mac-download';

const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('Mac download detection', () => {
  it('uses Chromium client hints when available', async () => {
    const nav = { userAgent: SAFARI_MAC, userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ architecture: 'arm' }) } };
    expect(await detectMac(nav, () => null)).toEqual({ isMac: true, arch: 'arm64' });
    nav.userAgentData.getHighEntropyValues = async () => ({ architecture: 'x86' });
    expect(await detectMac(nav, () => null)).toEqual({ isMac: true, arch: 'x64' });
  });

  it('falls back to the GPU name, and stays unknown when Safari only says "Apple GPU"', async () => {
    expect(await detectMac({ userAgent: SAFARI_MAC }, () => 'Apple M2 Pro')).toEqual({ isMac: true, arch: 'arm64' });
    expect(await detectMac({ userAgent: SAFARI_MAC }, () => 'Intel(R) Iris(TM) Plus Graphics 655')).toEqual({ isMac: true, arch: 'x64' });
    expect(await detectMac({ userAgent: SAFARI_MAC }, () => 'Apple GPU')).toEqual({ isMac: true, arch: null });
    expect(archFromGpuRenderer('AMD Radeon Pro 5500M')).toBe('x64');
  });

  it('does not treat Windows or an iPad as a Mac', async () => {
    expect(await detectMac({ userAgent: WINDOWS }, () => 'Apple M1')).toEqual({ isMac: false, arch: null });
    expect(isMacNavigator({ userAgent: SAFARI_MAC, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('Mac download links', () => {
  it('builds versioned /downloads paths', () => {
    expect(macDownloadPath('1.4.0', 'universal')).toBe('/downloads/Nomadic-1.4.0-mac-universal.dmg');
    expect(macChecksumsPath('1.4.0')).toBe('/downloads/Nomadic-1.4.0-mac-SHA256SUMS.txt');
  });

  it('vercel.json redirects every Mac download path to the release files', () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'));
    const rule = vercel.redirects.find((r: { source: string }) => r.source.startsWith('/downloads/Nomadic-'));
    expect(rule.destination).toMatch(/\/releases\/download\/mac-v:version\/Nomadic-:version-mac-:file$/);
    expect(rule.permanent).toBe(false);
  });

  it('the advertised version is a plain release version (the redirect only matches x.y.z)', () => {
    if (MAC_DOWNLOAD.version) expect(MAC_DOWNLOAD.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
