import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    name: 'ui',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
  },
});
