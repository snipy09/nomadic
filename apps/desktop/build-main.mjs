import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardcode official Supabase public endpoints for production client binaries
const DEFAULT_SUPABASE_URL = 'https://grqkiddfwoyicktpgdea.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycWtpZGRmd295aWNrdHBnZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNTAyNDAsImV4cCI6MjEwNjYyNjI0MH0.ZTuqnzhEbYtmOHgDLTwX8ENFBIkKmrLVo-y6O1Mvsek';

const isWatch = process.argv.includes('--watch');

// Local builds read apps/desktop/.env (gitignored); real environment variables win.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function build() {
  console.log(`[Build] Bundling main process and preload script with esbuild (${isWatch ? 'watch mode' : 'single build'})...`);

  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  const appVersion = pkgJson.version || '1.0.1';

  // Secrets are injected from the build environment only (CI secrets / local
  // .env). Missing values compile to '' and the matching feature degrades:
  //   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET -> Google sign-in (installed-app flow with PKCE;
  //     Google's "Desktop app" client type still requires the secret at the token endpoint and documents it as
  //     not confidential; the ID token is verified server-side by the google-sign-in Edge Function)
  //   No model keys are ever embedded: AI goes through the server-side ai-proxy (DECISIONS #12, #23).
  // Legacy names GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are still honoured.
  const env = (...names) => {
    for (const n of names) {
      if (process.env[n]) return process.env[n];
    }
    return '';
  };

  const define = {
    '__APP_VERSION__': JSON.stringify(appVersion),
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
    // Razorpay Payment Page URLs per plan (public, not secrets); empty = manual upgrade route only.
    'process.env.RAZORPAY_CHECKOUT_URL_PRO': JSON.stringify(env('RAZORPAY_CHECKOUT_URL_PRO')),
    'process.env.RAZORPAY_CHECKOUT_URL_MAX': JSON.stringify(env('RAZORPAY_CHECKOUT_URL_MAX')),
  };

  // Ensure out/main directory exists
  fs.mkdirSync(path.join(__dirname, 'out/main'), { recursive: true });

  // Copy sql-wasm.wasm into out/main
  const possibleWasmPaths = [
    path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm'),
  ];
  const wasmDest = path.join(__dirname, 'out/main/sql-wasm.wasm');

  let wasmCopied = false;
  for (const src of possibleWasmPaths) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, wasmDest);
      console.log('[Build] Copied sql-wasm.wasm from ' + src + ' to out/main/');
      wasmCopied = true;
      break;
    }
  }

  if (!wasmCopied) {
    console.warn('[Build Warning] sql-wasm.wasm not found in node_modules/sql.js/dist');
  }

  // Practice question sets: read by the main process at runtime (never bundled
  // into the renderer). See src/main/services/practice-catalog.ts.
  const practiceDataDir = path.join(__dirname, 'out/main/data');
  fs.mkdirSync(practiceDataDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'data/practice/leetcode-companies.json'),
    path.join(practiceDataDir, 'leetcode-companies.json'),
  );

  // Copy logo assets into out/renderer/assets
  const rendererAssetsDir = path.join(__dirname, 'out/renderer/assets');
  fs.mkdirSync(rendererAssetsDir, { recursive: true });
  const logoSrc = path.join(__dirname, 'assets/logo-icon.png');
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(rendererAssetsDir, 'logo-icon.png'));
    fs.copyFileSync(logoSrc, path.join(rendererAssetsDir, 'logo.png'));
  }

  const mainConfig = {
    entryPoints: [path.join(__dirname, 'src/main/index.ts')],
    outfile: path.join(__dirname, 'out/main/index.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    define,
    external: [
      'electron',
      'electron-reload',
      'fsevents',
      'playwright',
      'playwright-core',
      'chromium-bidi',
      'chromium-bidi/*',
      'unpdf',
    ],
    alias: {
      '@job-automator/automation': path.join(__dirname, '../../packages/automation/src/index.ts'),
      '@job-automator/scrapers': path.join(__dirname, '../../packages/scrapers/src/index.ts'),
      '@job-automator/supabase': path.join(__dirname, '../../packages/supabase/src/index.ts'),
      '@job-automator/email-verifier': path.join(__dirname, '../../packages/email-verifier/src/index.ts'),
    },
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: process.env.NODE_ENV === 'production',
    banner: {
      js: '// Nomadic Main Process Bundle',
    },
  };

  const preloadConfig = {
    entryPoints: [path.join(__dirname, 'src/main/preload.ts')],
    outfile: path.join(__dirname, 'out/main/preload.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    define,
    external: ['electron'],
    sourcemap: false,
    minify: process.env.NODE_ENV === 'production',
  };

  if (isWatch) {
    const mainCtx = await esbuild.context(mainConfig);
    const preloadCtx = await esbuild.context(preloadConfig);
    await mainCtx.watch();
    await preloadCtx.watch();
    console.log('[Build] Watching main process & preload for changes ✓');
  } else {
    await esbuild.build(mainConfig);
    await esbuild.build(preloadConfig);
    console.log('[Build] Main process & preload bundled successfully ✓');
  }
}

build().catch((err) => {
  console.error('[Build Error]', err);
  process.exit(1);
});
