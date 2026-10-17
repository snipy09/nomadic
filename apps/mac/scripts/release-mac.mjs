// One command for a macOS release, run on a Mac (or the free "Release macOS" GitHub Actions workflow):
//   npm run release:mac                     # arm64 (Apple Silicon) + x64 (Intel) DMGs
//   npm run release:mac -- --arch arm64     # one of them
//   npm run release:mac -- --arch universal # experimental, not shipped (see BUILDABLE_ARCHES)
// Steps: clean old output → production build (main + renderer) → electron-builder DMGs (ad-hoc signed, no Apple
// Developer ID, not notarized) → validate each DMG (validate-mac.mjs) → SHA256SUMS.txt → print the file paths.
// Free tooling only: Node, electron-builder and the tools that come with macOS. Nothing is uploaded.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDABLE_ARCHES, dmgFileName, MAC_ARCHES } from './mac-release-lib.mjs';
import { validateDmg } from './validate-mac.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'));
const outDir = path.join(appDir, pkg.build.directories.output);

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i !== -1) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const archArg = argValue('--arch') ?? 'all';
const arches = archArg === 'all' ? MAC_ARCHES : archArg.split(',');
for (const a of arches) {
  if (!BUILDABLE_ARCHES.includes(a)) {
    console.error(`Unknown --arch ${a}. Use arm64, x64 or all (universal is experimental).`);
    process.exit(1);
  }
}
if (arches.includes('universal')) {
  console.warn('! universal is experimental: its app hung at start-up in testing. Do not upload it.');
}

if (process.platform !== 'darwin') {
  console.error(
    'The DMG must be built on macOS (hdiutil, codesign and lipo exist only there).\n' +
      'No Mac? GitHub → Actions → "Release macOS" → Run workflow builds the same DMGs on a free macOS runner.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  // Never pick up a certificate from the keychain: this is an honest ad-hoc build.
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  PATH: [path.join(appDir, 'node_modules/.bin'), path.join(rootDir, 'node_modules/.bin'), process.env.PATH].join(path.delimiter),
};

function step(title, cmd, args) {
  console.log(`\n▶ ${title}\n  $ ${[cmd, ...args].join(' ')}`);
  execFileSync(cmd, args, { cwd: appDir, env, stdio: 'inherit' });
}

console.log(`Nomadic ${pkg.version} for macOS: ${arches.join(', ')}`);

console.log('\n▶ Clean old builds (out/, dist-electron/)');
for (const dir of [path.join(appDir, 'out'), outDir]) fs.rmSync(dir, { recursive: true, force: true });

step('Build the main process (production)', 'node', ['build-main.mjs']);
step('Build the renderer (production)', 'vite', ['build']);
step('Package the DMGs (ad-hoc signed)', 'electron-builder', [
  '--mac',
  'dmg',
  ...arches.map((a) => `--${a}`),
  '--publish',
  'never',
  '-c.npmRebuild=false',
]);

const dmgs = arches.map((a) => path.join(outDir, dmgFileName(pkg.version, a)));
const missing = dmgs.filter((d) => !fs.existsSync(d));
if (missing.length) {
  console.error(`\nExpected DMG(s) not produced:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

let failures = 0;
for (const dmg of dmgs) failures += (await validateDmg(dmg, { launch: process.argv.includes('--launch') })).failures.length;

const sums = dmgs
  .map((d) => `${crypto.createHash('sha256').update(fs.readFileSync(d)).digest('hex')}  ${path.basename(d)}`)
  .join('\n');
const sumsFile = path.join(outDir, `Nomadic-${pkg.version}-mac-SHA256SUMS.txt`);
fs.writeFileSync(sumsFile, `${sums}\n`);

if (failures) {
  console.error(`\n✗ ${failures} validation problem(s). Do not upload these DMGs.`);
  process.exit(1);
}

console.log('\n✓ Release ready. Upload these files (deploy/mac/MAC_RELEASE.md → "Publish"):');
for (const d of [...dmgs, sumsFile]) console.log(`  ${d}  (${(fs.statSync(d).size / 1e6).toFixed(1)} MB)`);
console.log('\nNot notarized, not Developer ID signed: users allow the first launch once (deploy/mac/MAC_INSTALL.md).');
