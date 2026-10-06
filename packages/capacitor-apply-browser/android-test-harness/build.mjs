/**
 * Builds the assets for the Android instrumentation test into
 * android/build/generated/nomadic-test-assets (an androidTest assets dir, gitignored):
 *   www/                 web root served by the test's local HTTP server (two origins)
 *   www/<fixture>/       the form-bench fixtures
 *   www/_profiles/       bench profiles + sample resume
 *   www/_harness/        index.html + harness.js (host engine) + test-agent.js (agent + read-only bench commands)
 *
 *   npm run build:android-test -w @nomadic/capacitor-apply-browser
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const out = path.join(pkg, 'android/build/generated/nomadic-test-assets');
const bench = path.resolve(pkg, '../form-bench');

const www = path.join(out, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(www, '_harness'), { recursive: true });
fs.cpSync(path.join(bench, 'fixtures'), www, { recursive: true });
fs.cpSync(path.join(bench, 'profiles'), path.join(www, '_profiles'), { recursive: true });

const common = { bundle: true, write: true, format: 'iife', platform: 'browser', target: ['chrome90'], logLevel: 'warning', legalComments: 'none' };
await build({ ...common, entryPoints: [path.join(here, 'harness.ts')], outfile: path.join(www, '_harness/harness.js') });
await build({ ...common, minify: true, entryPoints: [path.join(here, 'test-agent.ts')], outfile: path.join(www, '_harness/test-agent.js') });
fs.writeFileSync(path.join(www, '_harness/index.html'), '<!doctype html><meta charset="utf-8"><title>Nomadic apply harness</title><script src="harness.js"></script>\n');

const count = fs.readdirSync(www).filter((d) => !d.startsWith('_')).length;
console.log(`android test assets: ${count} fixtures -> ${path.relative(process.cwd(), www)}`);
