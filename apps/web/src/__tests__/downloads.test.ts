import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANDROID_DOWNLOAD,
  MAC_DOWNLOAD,
  MAC_INSTALL_SCRIPT_PATH,
  WINDOWS_DOWNLOAD,
  WINDOWS_INSTALL_SCRIPT_PATH,
  androidChecksumsPath,
  androidDownloadPath,
  downloadsOpen,
  macChecksumsPath,
  macDownloadPath,
  windowsChecksumsPath,
  windowsDownloadPath,
} from '@nomadic/config';

type Redirect = { source: string; destination: string; permanent: boolean };

const RELEASES = 'https://github.com/snipy09/nomadic-releases/releases/download';
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const configs = {
  'apps/web/vercel.json': JSON.parse(read('../../vercel.json')) as { redirects: Redirect[] },
  'vercel.json (root)': JSON.parse(read('../../../../vercel.json')) as { redirects: Redirect[] },
};

/** Follows a Vercel redirect the way the platform does for `:name(regex)` sources; null when no rule matches. */
function follow(redirects: Redirect[], path: string): string | null {
  for (const r of redirects) {
    const names: string[] = [];
    const pattern = r.source.replace(/:(\w+)\(([^)]*)\)/g, (_m, name: string, re: string) => {
      names.push(name);
      return `(${re})`;
    });
    const match = new RegExp(`^${pattern}$`).exec(path);
    if (!match) continue;
    let dest = r.destination;
    names.forEach((n, i) => (dest = dest.split(`:${n}`).join(match[i + 1])));
    return dest;
  }
  return null;
}

const v = '1.2.3';
const EXPECTED: Array<[string, string]> = [
  [macDownloadPath(v, 'arm64'), `${RELEASES}/mac-v${v}/Nomadic-${v}-mac-arm64.dmg`],
  [macDownloadPath(v, 'x64'), `${RELEASES}/mac-v${v}/Nomadic-${v}-mac-x64.dmg`],
  [macChecksumsPath(v), `${RELEASES}/mac-v${v}/Nomadic-${v}-mac-SHA256SUMS.txt`],
  [windowsDownloadPath(v), `${RELEASES}/win-v${v}/Nomadic-${v}-windows-x64.zip`],
  [windowsChecksumsPath(v), `${RELEASES}/win-v${v}/Nomadic-${v}-windows-SHA256SUMS.txt`],
  [androidDownloadPath(v), `${RELEASES}/android-v${v}/Nomadic-${v}-android.apk`],
  [androidChecksumsPath(v), `${RELEASES}/android-v${v}/Nomadic-${v}-android-SHA256SUMS.txt`],
];

describe('download redirects', () => {
  for (const [name, config] of Object.entries(configs)) {
    it(`${name} sends every download path to its release file`, () => {
      for (const [path, url] of EXPECTED) expect(follow(config.redirects, path), path).toBe(url);
      expect(config.redirects.filter((r) => r.source.startsWith('/downloads/')).every((r) => r.permanent === false)).toBe(true);
    });

    it(`${name} does not redirect unknown files`, () => {
      expect(follow(config.redirects, '/downloads/Nomadic-1.2.3-windows-x64.exe')).toBeNull();
      expect(follow(config.redirects, '/downloads/Nomadic-latest-mac-arm64.dmg')).toBeNull();
    });
  }

  it('both vercel.json files have the same download redirects', () => {
    const pick = (c: { redirects: Redirect[] }) => c.redirects.filter((r) => r.source.startsWith('/downloads/'));
    expect(pick(configs['vercel.json (root)'])).toEqual(pick(configs['apps/web/vercel.json']));
  });
});

describe('released versions', () => {
  it('are plain x.y.z versions (the redirects only match those)', () => {
    for (const d of [MAC_DOWNLOAD, WINDOWS_DOWNLOAD, ANDROID_DOWNLOAD]) if (d.version) expect(d.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(downloadsOpen()).toBe(Boolean(MAC_DOWNLOAD.version || WINDOWS_DOWNLOAD.version || ANDROID_DOWNLOAD.version));
  });

  it('the Mac one-line installer is served by the site and installs the advertised version', () => {
    const script = read(`../../public${MAC_INSTALL_SCRIPT_PATH}`);
    expect(script.startsWith('#!/bin/bash')).toBe(true);
    expect(script).not.toContain('\r');
    const version = /^VERSION="([^"]+)"$/m.exec(script)?.[1];
    if (MAC_DOWNLOAD.version) expect(version).toBe(MAC_DOWNLOAD.version);
    expect(script).toContain('shasum -a 256');
  });

  it('the Windows one-line installer is served by the site and installs the advertised version', () => {
    const script = read(`../../public${WINDOWS_INSTALL_SCRIPT_PATH}`);
    // irm decodes a response without a charset as ISO-8859-1, so the script must stay ASCII.
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(script)).toBe(true);
    const version = /^\s*\$Version = '([^']+)'$/m.exec(script)?.[1];
    if (WINDOWS_DOWNLOAD.version) expect(version).toBe(WINDOWS_DOWNLOAD.version);
    expect(script).toContain('Get-FileHash -Algorithm SHA256');
    expect(script).toContain('windows-SHA256SUMS.txt');
    // Under `irm | iex`, `exit` would close the user's PowerShell window.
    expect(/^\s*exit\b/m.test(script)).toBe(false);
  });
});
