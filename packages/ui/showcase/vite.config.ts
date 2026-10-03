import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: here('./tailwind.config.cjs') }), autoprefixer()],
    },
  },
  server: { port: 5180, strictPort: false },
  preview: { port: 5181 },
  build: { outDir: here('./dist'), emptyOutDir: true },
});
