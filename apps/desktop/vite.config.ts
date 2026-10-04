import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { buildContentSecurityPolicy } from './src/shared/csp';

// Packaged builds load from file://, where the main-process CSP header may not apply, so embed it too.
const cspMeta = {
  name: 'nomadic-csp-meta',
  apply: 'build' as const,
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildContentSecurityPolicy() }, injectTo: 'head-prepend' as const },
  ],
};

export default defineConfig({
  base: './',
  root: path.join(__dirname, 'src/renderer'),
  // React Fast Refresh is on by default in @vitejs/plugin-react v4 (the old `fastRefresh` option was removed).
  plugins: [react(), cspMeta],
  // Same env names build-main.mjs reads, so the Google button shows only when the main build can use it.
  define: {
    'import.meta.env.VITE_GOOGLE_SIGN_IN': JSON.stringify(
      process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID ? 'on' : 'off'
    ),
  },
  css: {
    devSourcemap: true,
    postcss: {
      plugins: [
        tailwindcss({
          config: path.join(__dirname, 'tailwind.config.js'),
        }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.join(__dirname, 'out/renderer'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: true, // Shows error overlay visually in browser / DevTools
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
});
