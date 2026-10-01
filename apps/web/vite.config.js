import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      // In dev there is no prerender step, so give the page a title.
      name: 'dev-head',
      apply: 'serve',
      transformIndexHtml: (html) => html.replace('<!--app-head-->', '<title>Nomadic (dev)</title>'),
    },
  ],
  base: '/',
  build: { cssMinify: true, reportCompressedSize: false },
});
