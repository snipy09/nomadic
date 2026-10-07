// Builds the Desktop scraper folder: every scraper bundled into one file (bin/nomadic-scrapers.mjs, needs only
// Node.js 22) next to the launchers in scripts/scraper-folder. Output: dist/scraper-folder/Scraper.
// Windows files are written with CRLF line ends whatever the checkout uses.
import { execSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outRoot = join(root, 'dist', 'scraper-folder');
const out = join(outRoot, 'Scraper');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(join(out, 'bin'), { recursive: true });

await build({
  entryPoints: [join(root, 'packages', 'scrapers', 'src', 'cli.ts')],
  outfile: join(out, 'bin', 'nomadic-scrapers.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'warning',
  // Some dependencies still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __nomadicRequire } from 'module'; const require = __nomadicRequire(import.meta.url);" },
});

cpSync(join(root, 'scripts', 'scraper-folder'), out, { recursive: true });
const CRLF = new Set(['.cmd', '.ps1', '.vbs', '.ini', '.txt']);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
for (const file of walk(out)) {
  if (!CRLF.has(extname(file).toLowerCase())) continue;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  writeFileSync(file, text);
}

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {
  /* not a git checkout */
}
writeFileSync(join(out, 'bin', 'VERSION.txt'), `Nomadic scrapers\r\nbuilt ${new Date().toISOString()} from commit ${commit}\r\n`);
const size = statSync(join(out, 'bin', 'nomadic-scrapers.mjs')).size;
console.log(`[scraper-folder] ${out} (bundle ${(size / 1024 / 1024).toFixed(1)} MB, commit ${commit})`);
