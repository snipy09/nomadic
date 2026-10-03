import { defineConfig } from 'vitest/config';

// One vitest run, three projects:
//  - packages:          shared Node packages (automation, scrapers, supabase, email-verifier)
//  - desktop-main:      Electron main-process code (Node environment)
//  - desktop-renderer:  React renderer code, resolved from apps/desktop with a DOM (jsdom)
const sharedExclude = ['**/node_modules/**', '**/dist/**', '**/out/**', '**/dist-electron/**'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'desktop-main',
          root: './apps/desktop',
          environment: 'node',
          include: ['src/main/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'desktop-renderer',
          root: './apps/desktop',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          exclude: sharedExclude,
        },
      },
    ],
  },
});
