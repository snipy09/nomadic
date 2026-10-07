import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { buildContentSecurityPolicy } from '../desktop/src/shared/csp';

/**
 * Nomadic for Android: the desktop renderer plus the desktop's main-process services, run inside the
 * WebView. Electron and Node modules are replaced by small browser versions (src/host), the file database
 * by an IndexedDB one, and the device id by a phone one. Apply, outreach, practice and projects are not
 * registered; the renderer hides them (VITE_PLATFORM=android).
 */

const here = __dirname;
const desktop = path.join(here, '../desktop');
const host = path.join(here, 'src/host');
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf-8'));

const DEFAULT_SUPABASE_URL = 'https://grqkiddfwoyicktpgdea.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycWtpZGRmd295aWNrdHBnZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNTAyNDAsImV4cCI6MjEwNjYyNjI0MH0.ZTuqnzhEbYtmOHgDLTwX8ENFBIkKmrLVo-y6O1Mvsek';

/** Files of the desktop main process that the APK replaces. */
const REPLACED: Record<string, string> = {
  [path.join(desktop, 'src/main/db.ts')]: path.join(host, 'db.ts'),
  [path.join(desktop, 'src/main/device.ts')]: path.join(host, 'device.ts'),
};

function replaceMainModules(): Plugin {
  return {
    name: 'nomadic-mobile-replace',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (!importer || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (!resolved) return null;
      const target = REPLACED[resolved.id.split('?')[0]];
      return target ? { id: target } : null;
    },
  };
}

const cspMeta: Plugin = {
  name: 'nomadic-csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildContentSecurityPolicy(undefined, { wasm: true }) }, injectTo: 'head-prepend' },
  ],
};

const stub = path.join(host, 'stubs/empty.ts');
const node = (m: string) => path.join(host, 'node', m);

export default defineConfig({
  base: './',
  root: here,
  plugins: [replaceMainModules(), react(), cspMeta],
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('android'),
    'import.meta.env.VITE_GOOGLE_SIGN_IN': JSON.stringify('off'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY),
    'process.env.RAZORPAY_CHECKOUT_URL_PRO': JSON.stringify(process.env.RAZORPAY_CHECKOUT_URL_PRO || ''),
    'process.env.RAZORPAY_CHECKOUT_URL_MAX': JSON.stringify(process.env.RAZORPAY_CHECKOUT_URL_MAX || ''),
    'process.env.GOOGLE_CLIENT_ID': JSON.stringify(''),
    'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(''),
    'process.env.SENTRY_DSN': JSON.stringify(''),
    'process.env.UPDATE_POLICY_URL': JSON.stringify(''),
  },
  resolve: {
    alias: [
      { find: /^electron$/, replacement: path.join(host, 'electron.ts') },
      { find: /^fs\/promises$/, replacement: node('fs-promises.ts') },
      { find: /^(node:)?fs$/, replacement: node('fs.ts') },
      { find: /^(node:)?path$/, replacement: node('path.ts') },
      { find: /^(node:)?os$/, replacement: node('os.ts') },
      { find: /^(node:)?crypto$/, replacement: node('crypto.ts') },
      { find: /^(node:)?(http|https|child_process|url|net|tls)$/, replacement: node('net.ts') },
      { find: /^ws$/, replacement: stub },
      { find: /^@sentry\/electron(\/.*)?$/, replacement: stub },
      { find: /^electron-updater$/, replacement: stub },
      { find: /^unpdf$/, replacement: stub },
      { find: /^@job-automator\/automation$/, replacement: stub },
      { find: /^@job-automator\/scrapers$/, replacement: path.join(host, 'stubs/scrapers.ts') },
      { find: /^@job-automator\/supabase$/, replacement: path.join(here, '../../packages/supabase/src/index.ts') },
      { find: /^@job-automator\/email-verifier$/, replacement: stub },
      { find: '@', replacement: path.join(desktop, 'src') },
    ],
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.join(here, 'tailwind.config.cjs') }), autoprefixer()],
    },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  server: { port: 5175, strictPort: true },
});
