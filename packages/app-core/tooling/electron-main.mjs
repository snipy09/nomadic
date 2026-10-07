// Bundles an Electron app's main process and preload (apps/desktop, apps/mac) with esbuild, and copies what the
// main process reads at runtime next to it: sql.js's wasm and the practice question sets. Each app calls this from its
// own build-main.mjs with its entry file, so OS-specific startup stays in the app.
//
// Build-time values: SUPABASE_URL / SUPABASE_ANON_KEY (public defaults below), SENTRY_DSN, UPDATE_POLICY_URL,
// GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (Google's "Desktop app" client; the ID token is verified server
// side), RAZORPAY_CHECKOUT_URL_PRO / _MAX. Missing values compile to '' and the feature turns itself off. No model
// keys are ever embedded: AI goes through the server-side ai-proxy. The app folder's .env (gitignored) is read first;
// real environment variables win.
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(coreDir, '..', '..');

export const DEFAULT_SUPABASE_URL = 'https://grqkiddfwoyicktpgdea.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycWtpZGRmd295aWNrdHBnZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNTAyNDAsImV4cCI6MjEwNjYyNjI0MH0.ZTuqnzhEbYtmOHgDLTwX8ENFBIkKmrLVo-y6O1Mvsek';

function loadAppEnv(appDir) {
  const envFile = path.join(appDir, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = (...names) => names.map((n) => process.env[n]).find(Boolean) ?? '';

function copyRuntimeFiles(appDir) {
  const outMain = path.join(appDir, 'out', 'main');
  fs.mkdirSync(path.join(outMain, 'data'), { recursive: true });
  const wasm = [path.join(repoRoot, 'node_modules/sql.js/dist/sql-wasm.wasm'), path.join(appDir, 'node_modules/sql.js/dist/sql-wasm.wasm')].find((p) =>
    fs.existsSync(p)
  );
  if (wasm) fs.copyFileSync(wasm, path.join(outMain, 'sql-wasm.wasm'));
  else console.warn('[build-main] sql-wasm.wasm not found in node_modules/sql.js/dist');
  // Practice question sets: read by the main process at runtime, never bundled into the renderer.
  fs.copyFileSync(path.join(coreDir, 'data/practice/leetcode-companies.json'), path.join(outMain, 'data', 'leetcode-companies.json'));
  // The window icon fallback (the packaged app uses the platform icon).
  const logo = path.join(appDir, 'assets/logo-icon.png');
  if (fs.existsSync(logo)) {
    const rendererAssets = path.join(appDir, 'out', 'renderer', 'assets');
    fs.mkdirSync(rendererAssets, { recursive: true });
    fs.copyFileSync(logo, path.join(rendererAssets, 'logo-icon.png'));
    fs.copyFileSync(logo, path.join(rendererAssets, 'logo.png'));
  }
}

/**
 * @param {{ appDir: string, entry: string, watch?: boolean }} options  appDir = the app folder; entry = its main.ts
 */
export async function buildElectronMain({ appDir, entry, watch = false }) {
  loadAppEnv(appDir);
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'));
  const define = {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY),
    // Public values (not secrets): a Sentry DSN only allows sending events; the policy URL is public.
    'process.env.SENTRY_DSN': JSON.stringify(env('SENTRY_DSN')),
    'process.env.UPDATE_POLICY_URL': JSON.stringify(env('UPDATE_POLICY_URL')),
    'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_CLIENT_ID')),
    'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(env('GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET')),
    'process.env.GEMINI_API_KEY': JSON.stringify(''),
    'process.env.GEMINI_API_KEY_1': JSON.stringify(''),
    'process.env.GEMINI_API_KEY_2': JSON.stringify(''),
    // Razorpay Payment Page URLs per plan (public); empty = manual upgrade route only.
    'process.env.RAZORPAY_CHECKOUT_URL_PRO': JSON.stringify(env('RAZORPAY_CHECKOUT_URL_PRO')),
    'process.env.RAZORPAY_CHECKOUT_URL_MAX': JSON.stringify(env('RAZORPAY_CHECKOUT_URL_MAX')),
  };
  copyRuntimeFiles(appDir);

  const production = process.env.NODE_ENV === 'production';
  const shared = { bundle: true, platform: 'node', target: 'node20', format: 'cjs', define, logLevel: 'warning' };
  const mainConfig = {
    ...shared,
    entryPoints: [entry],
    outfile: path.join(appDir, 'out/main/index.cjs'),
    external: ['electron', 'electron-reload', 'fsevents', 'playwright', 'playwright-core', 'chromium-bidi', 'chromium-bidi/*', 'unpdf'],
    sourcemap: !production,
    minify: production,
    banner: { js: `// Nomadic main process (${pkg.name} ${pkg.version})` },
  };
  const preloadConfig = {
    ...shared,
    entryPoints: [path.join(coreDir, 'src/main/preload.ts')],
    outfile: path.join(appDir, 'out/main/preload.cjs'),
    external: ['electron'],
    sourcemap: false,
    minify: production,
  };

  if (watch) {
    const contexts = await Promise.all([esbuild.context(mainConfig), esbuild.context(preloadConfig)]);
    await Promise.all(contexts.map((c) => c.watch()));
    console.log(`[build-main] watching ${pkg.name} main process and preload`);
  } else {
    await Promise.all([esbuild.build(mainConfig), esbuild.build(preloadConfig)]);
    console.log(`[build-main] ${pkg.name} ${pkg.version}: main process and preload bundled`);
  }
}
