import { describe, expect, it } from 'vitest';
import { detectPlatform, isPlatform } from '../platform';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

describe('download page platform detection', () => {
  it('suggests the download for Windows, Mac and Android browsers', () => {
    expect(detectPlatform({ userAgent: UA.windows })).toBe('windows');
    expect(detectPlatform({ userAgent: UA.mac })).toBe('mac');
    expect(detectPlatform({ userAgent: UA.android })).toBe('android');
  });

  it('trusts client hints over the user agent', () => {
    expect(detectPlatform({ userAgent: UA.mac, userAgentData: { platform: 'Windows' } })).toBe('windows');
    expect(detectPlatform({ userAgent: UA.windows, userAgentData: { platform: 'macOS' } })).toBe('mac');
  });

  it('suggests nothing for an iPhone or an iPad', () => {
    expect(detectPlatform({ userAgent: UA.iphone })).toBeNull();
    expect(detectPlatform({ userAgent: UA.mac, maxTouchPoints: 5 })).toBeNull();
  });

  it('only accepts known tab names', () => {
    expect(isPlatform('mac')).toBe(true);
    expect(isPlatform('linux')).toBe(false);
    expect(isPlatform(null)).toBe(false);
  });
});
