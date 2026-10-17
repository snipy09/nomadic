// Checks a release DMG with the free tools that come with macOS (hdiutil, codesign, spctl, lipo, otool, plutil, xattr).
// It installs nothing and changes no system setting. Run on a Mac:
//   node apps/mac/scripts/validate-mac.mjs dist-electron/Nomadic-1.4.0-mac-universal.dmg [--launch]
// Exit code 1 when a check fails. The spctl (Gatekeeper) result is reported, not enforced: without an Apple
// Developer ID it is always "rejected", which is expected and the reason users click Open Anyway once.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  archFromDmgName,
  DEV_PATH_PATTERNS,
  DMG_EXTRA_ALLOWED,
  forbiddenAsarEntries,
  isBundledOrSystemLib,
  missingArchs,
  parseOtoolIds,
  parseOtoolLibs,
} from './mac-release-lib.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'));
const require = createRequire(import.meta.url);

const MACHO_MAGICS = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca']);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

/** Runs a command and returns { ok, out } instead of throwing; stderr is included (codesign/spctl print there). */
function tryRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, out: r.status === 0 ? out : out.trim() || String(r.error ?? `exit ${r.status}`) };
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(p, files);
    else if (entry.isFile()) files.push(p);
  }
  return files;
}

function isMachO(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4);
    if (fs.readSync(fd, buf, 0, 4, 0) < 4) return false;
    return MACHO_MAGICS.has(buf.toString('hex'));
  } finally {
    fs.closeSync(fd);
  }
}

export async function validateDmg(dmgPath, { launch = false } = {}) {
  const failures = [];
  const warnings = [];
  const ok = (msg) => console.log(`  ✓ ${msg}`);
  const fail = (msg) => {
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  };
  const check = (passed, okMsg, failMsg) => (passed ? ok(okMsg) : fail(failMsg));
  const warn = (msg) => {
    warnings.push(msg);
    console.log(`  ! ${msg}`);
  };

  const arch = archFromDmgName(path.basename(dmgPath));
  if (!arch) throw new Error(`Not a release DMG name: ${path.basename(dmgPath)} (expected Nomadic-<version>-mac-<arch>.dmg)`);
  const productName = pkg.build.productName;
  console.log(`\nValidating ${path.basename(dmgPath)} (${arch}, ${(fs.statSync(dmgPath).size / 1e6).toFixed(1)} MB)`);

  // 1. The disk image itself.
  const verify = tryRun('hdiutil', ['verify', dmgPath]);
  check(verify.ok, 'hdiutil verify: checksum valid', `hdiutil verify failed: ${verify.out}`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nomadic-validate-'));
  const mnt = path.join(work, 'mnt');
  fs.mkdirSync(mnt);
  run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mnt]);
  const app = path.join(work, `${productName}.app`);
  try {
    const items = fs.readdirSync(mnt);
    check(items.includes(`${productName}.app`), `DMG contains ${productName}.app`, `DMG has no ${productName}.app`);
    const appsLink = path.join(mnt, 'Applications');
    if (fs.existsSync(appsLink) && fs.lstatSync(appsLink).isSymbolicLink() && fs.readlinkSync(appsLink) === '/Applications') {
      ok('DMG contains the Applications shortcut (drag-to-install)');
    } else {
      fail('DMG has no Applications shortcut pointing to /Applications');
    }
    const extra = items.filter((i) => i !== `${productName}.app` && i !== 'Applications' && !DMG_EXTRA_ALLOWED.has(i));
    if (extra.length) warn(`Unexpected items in the DMG: ${extra.join(', ')}`);
    else ok('No unexpected files in the DMG');
    // Copy out the way Finder does when the user drags it to Applications.
    run('ditto', [path.join(mnt, `${productName}.app`), app]);
  } finally {
    tryRun('hdiutil', ['detach', mnt, '-force']);
  }

  // 2. Info.plist: identity, version, executable, icon.
  const plist = path.join(app, 'Contents/Info.plist');
  const lint = tryRun('plutil', ['-lint', plist]);
  check(lint.ok, 'Info.plist is valid', `Info.plist: ${lint.out}`);
  const key = (k) => {
    const r = tryRun('/usr/libexec/PlistBuddy', ['-c', `Print :${k}`, plist]);
    return r.ok ? r.out.trim() : '';
  };
  const expect = {
    CFBundleIdentifier: pkg.build.appId,
    CFBundleName: productName,
    CFBundleDisplayName: productName,
    CFBundleExecutable: productName,
    CFBundleShortVersionString: pkg.version,
    LSMinimumSystemVersion: pkg.build.mac.minimumSystemVersion,
  };
  for (const [k, want] of Object.entries(expect)) {
    const got = key(k);
    check(got === want, `${k} = ${got}`, `${k} is "${got}", expected "${want}"`);
  }
  const icon = key('CFBundleIconFile');
  const iconFile = path.join(app, 'Contents/Resources', icon.endsWith('.icns') ? icon : `${icon}.icns`);
  check(icon && fs.existsSync(iconFile), `Icon ${path.basename(iconFile)} present`, `Icon file missing (CFBundleIconFile="${icon}")`);

  // 3. Main executable.
  const exe = path.join(app, 'Contents/MacOS', productName);
  if (fs.existsSync(exe) && (fs.statSync(exe).mode & 0o111) !== 0) ok('Main executable present and executable');
  else fail('Main executable missing or not executable');

  // 4. Code signature (ad-hoc): structurally valid, every nested binary sealed.
  const cs = tryRun('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  check(cs.ok, 'codesign --verify --deep --strict: valid', `codesign verify failed:\n${cs.out}`);
  const info = tryRun('codesign', ['-dv', '--verbose=2', app]).out;
  const sig = /Signature=(\S+)/.exec(info)?.[1] ?? (/Authority=([^\n]+)/.exec(info)?.[1] || 'unknown');
  ok(`Signature: ${sig}${sig === 'adhoc' ? ' (ad-hoc; not Developer ID, not notarized)' : ''}`);

  // 5. Every Mach-O: right architectures, no libraries from outside the bundle or macOS.
  const files = walk(app);
  const machos = files.filter(isMachO);
  let archProblems = 0;
  let libProblems = 0;
  for (const bin of machos) {
    const rel = path.relative(app, bin);
    const lipo = tryRun('lipo', ['-archs', bin]);
    const missing = lipo.ok ? missingArchs(arch, lipo.out) : ['(unreadable)'];
    if (missing.length) {
      archProblems++;
      fail(`${rel}: missing ${missing.join(', ')} (has ${lipo.out.trim()})`);
    }
    const ownIds = new Set(parseOtoolIds(tryRun('otool', ['-D', bin]).out));
    const libs = [...new Set(parseOtoolLibs(tryRun('otool', ['-L', bin]).out))].filter((l) => !ownIds.has(l));
    for (const lib of libs.filter((l) => !isBundledOrSystemLib(l))) {
      libProblems++;
      fail(`${rel} links ${lib}, which a clean Mac does not have`);
    }
  }
  if (!archProblems) ok(`${machos.length} Mach-O binaries, all contain ${arch === 'universal' ? 'arm64 + x86_64' : arch}`);
  if (!libProblems) ok('All linked libraries are part of macOS or inside the app');

  // 6. Permissions: no world-writable files, no quarantine flag baked into the build.
  const worldWritable = files.filter((f) => (fs.statSync(f).mode & 0o002) !== 0);
  check(!worldWritable.length, 'No world-writable files', `World-writable files: ${worldWritable.slice(0, 5).join(', ')}`);
  const xattr = tryRun('xattr', ['-lr', app]).out;
  check(!/com\.apple\.quarantine/.test(xattr), 'No quarantine attribute in the build', 'The built app carries com.apple.quarantine');

  // 7. app.asar: no secrets, no dev source maps, no build machine paths, no dev server URL.
  const asarPath = path.join(app, 'Contents/Resources/app.asar');
  if (fs.existsSync(asarPath)) {
    const asar = require('@electron/asar');
    const entries = asar.listPackage(asarPath);
    const bad = forbiddenAsarEntries(entries);
    check(!bad.length, `app.asar: ${entries.length} entries, no .env / keys / app source maps`, `Must not ship: ${bad.join(', ')}`);
    const ownCode = entries.filter((e) => /^\/out\/.*\.(c?js|html)$/.test(e));
    const hits = [];
    for (const e of ownCode) {
      const text = asar.extractFile(asarPath, e.slice(1)).toString('utf-8');
      for (const re of DEV_PATH_PATTERNS) if (re.test(text)) hits.push(`${e} matches ${re}`);
    }
    check(!hits.length, 'No local development paths or dev server URL in app code', `Development paths in app code:\n    ${hits.join('\n    ')}`);
    check(entries.includes('/out/main/index.cjs'), 'Production main bundle present', 'out/main/index.cjs missing from app.asar');
    check(entries.includes('/out/renderer/index.html'), 'Production renderer present', 'out/renderer/index.html missing from app.asar');
  } else {
    fail('Contents/Resources/app.asar missing');
  }

  // 8. Gatekeeper's verdict, for information. Expected: rejected (no Developer ID / notarization).
  const gk = tryRun('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  console.log(`  i spctl (Gatekeeper): ${gk.out.split('\n').slice(0, 2).join(' | ') || (gk.ok ? 'accepted' : 'rejected')}`);
  console.log('    Expected for a free build: rejected. Users allow it once with Open Anyway (deploy/mac/MAC_INSTALL.md).');

  // 9. Optional: start the installed copy and check it stays up (opens a window).
  if (launch) {
    const child = spawn(exe, [], { stdio: 'ignore' });
    let exited = null;
    child.on('exit', (code) => (exited = code));
    await new Promise((r) => setTimeout(r, 15_000));
    if (exited === null) {
      ok('App started and was still running after 15 s');
      child.kill();
    } else {
      fail(`App exited during start (code ${exited})`);
    }
  }

  fs.rmSync(work, { recursive: true, force: true });
  console.log(failures.length ? `  → ${failures.length} problem(s)` : `  → all checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
  return { failures, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.error('validate-mac needs macOS (hdiutil, codesign, lipo, otool).');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const dmgs = args.filter((a) => a.endsWith('.dmg'));
  if (!dmgs.length) {
    console.error('Usage: node scripts/validate-mac.mjs <Nomadic-…-mac-<arch>.dmg> [more.dmg] [--launch]');
    process.exit(1);
  }
  let failed = 0;
  for (const dmg of dmgs) failed += (await validateDmg(path.resolve(dmg), { launch: args.includes('--launch') })).failures.length;
  process.exit(failed ? 1 : 0);
}
