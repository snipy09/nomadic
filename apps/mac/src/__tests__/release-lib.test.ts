import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { macDmgFileName } from '@nomadic/config';
import {
  archFromDmgName,
  DEV_PATH_PATTERNS,
  dmgFileName,
  forbiddenAsarEntries,
  isBundledOrSystemLib,
  missingArchs,
  parseOtoolLibs,
} from '../../scripts/mac-release-lib.mjs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

describe('macOS release naming', () => {
  it('electron-builder, the release script and the website agree on DMG names', () => {
    const fromBuilder = pkg.build.dmg.artifactName.replace('${version}', '1.4.0').replace('${arch}', 'universal').replace('${ext}', 'dmg');
    expect(fromBuilder).toBe(dmgFileName('1.4.0', 'universal'));
    expect(macDmgFileName('1.4.0', 'arm64')).toBe(dmgFileName('1.4.0', 'arm64'));
  });

  it('reads the architecture back from a DMG name', () => {
    expect(archFromDmgName('Nomadic-1.4.0-mac-universal.dmg')).toBe('universal');
    expect(archFromDmgName('Nomadic-1.4.0-mac-x64.dmg')).toBe('x64');
    expect(archFromDmgName('Nomadic-1.4.0-arm64.dmg')).toBeNull();
  });

  it('ad-hoc signs, never auto-discovers a certificate, and ships no update feed', () => {
    expect(pkg.build.afterPack).toBe('./build-resources/mac-adhoc-sign.cjs');
    expect(pkg.build.publish).toBeUndefined();
    expect(pkg.build.dmg.writeUpdateInfo).toBe(false);
    expect(pkg.build.dmg.contents.some((c: { type: string; path?: string }) => c.type === 'link' && c.path === '/Applications')).toBe(true);
  });
});

describe('macOS DMG validation helpers', () => {
  it('requires both architectures in a universal build', () => {
    expect(missingArchs('universal', 'x86_64 arm64\n')).toEqual([]);
    expect(missingArchs('universal', 'arm64\n')).toEqual(['x86_64']);
    expect(missingArchs('x64', 'x86_64\n')).toEqual([]);
    expect(missingArchs('arm64', 'x86_64\n')).toEqual(['arm64']);
  });

  it('parses otool -L for fat binaries without treating the per-arch headers as libraries', () => {
    const out = [
      '/A/Nomadic.app/Contents/MacOS/Nomadic (architecture x86_64):',
      '\t@rpath/Electron Framework.framework/Electron Framework (compatibility version 0.0.0, current version 0.0.0)',
      '\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1345.0.0)',
      '/A/Nomadic.app/Contents/MacOS/Nomadic (architecture arm64):',
      '\t/opt/homebrew/lib/libfoo.dylib (compatibility version 1.0.0, current version 1.0.0)',
      '',
    ].join('\n');
    const libs = parseOtoolLibs(out);
    expect(libs).toEqual(['@rpath/Electron Framework.framework/Electron Framework', '/usr/lib/libSystem.B.dylib', '/opt/homebrew/lib/libfoo.dylib']);
    expect(libs.filter((l) => !isBundledOrSystemLib(l))).toEqual(['/opt/homebrew/lib/libfoo.dylib']);
  });

  it('finds Mac build machine paths but not Windows example paths shown in the UI', () => {
    const hit = (t: string) => DEV_PATH_PATTERNS.some((re) => re.test(t));
    expect(hit('"/Users/sajal/nomadic/apps/mac/src/main.ts"')).toBe(true);
    expect(hit('fetch("http://localhost:5176/")')).toBe(true);
    expect(hit('"C:/Users/Candidate/Documents/Resume.pdf"')).toBe(false);
  });

  it('excludes source maps from the packaged app', () => {
    expect(pkg.build.files).toContain('!out/**/*.map');
  });

  it('flags secrets and app source maps in app.asar, not third-party maps', () => {
    expect(
      forbiddenAsarEntries(['/out/main/index.cjs', '/out/main/index.cjs.map', '/.env', '/node_modules/x/index.js.map', '/certs/a.p12']),
    ).toEqual(['/out/main/index.cjs.map', '/.env', '/certs/a.p12']);
  });
});
