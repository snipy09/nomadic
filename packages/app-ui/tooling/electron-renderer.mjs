// Vite config for an Electron app's renderer (apps/desktop, apps/mac): the shared UI (packages/app-ui) built with the
// app's platform id, its own index.html/public assets (<app>/renderer) and its Tailwind config.
import path from 'path';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { loadEnv } from 'vite';

/**
 * @param {{ appDir: string, platform: 'windows' | 'mac', port: number, contentSecurityPolicy: string }} options
 */
export function electronRendererConfig({ appDir, platform, port, contentSecurityPolicy }) {
  // <app>/.env (gitignored) plus the real environment, which wins. Same names build-main reads, so the Google
  // button shows only when the main build can use it.
  const env = { ...loadEnv('', appDir, ''), ...process.env };
  return {
    base: './',
    root: path.join(appDir, 'renderer'),
    envDir: appDir,
    plugins: [
      react(),
      {
        // Packaged builds load from file://, where the main-process CSP header may not apply, so embed it too.
        name: 'nomadic-csp-meta',
        apply: 'build',
        transformIndexHtml: () => [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head-prepend' },
        ],
      },
    ],
    define: {
      'import.meta.env.VITE_PLATFORM': JSON.stringify(platform),
      'import.meta.env.VITE_GOOGLE_SIGN_IN': JSON.stringify(env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_CLIENT_ID ? 'on' : 'off'),
    },
    css: {
      devSourcemap: true,
      postcss: { plugins: [tailwindcss({ config: path.join(appDir, 'tailwind.config.js') }), autoprefixer()] },
    },
    build: {
      outDir: path.join(appDir, 'out/renderer'),
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 4000,
    },
    server: { port, strictPort: true, hmr: { overlay: true } },
  };
}
