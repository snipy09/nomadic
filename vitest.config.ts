import { defineConfig } from 'vitest/config';

// One vitest run, four projects:
//  - packages:          shared Node packages (automation, scrapers, supabase, email-verifier)
//  - desktop-main:      Electron main-process code (Node environment)
//  - desktop-renderer:  React renderer code, resolved from apps/desktop with a DOM (jsdom)
//  - mobile:            Android app host layer (Electron/Node stand-ins, phone device id)
//  - web:               landing page data (pricing from config, SEO, share cards, privacy content)
const sharedExclude = ['**/node_modules/**', '**/dist/**', '**/out/**', '**/dist-electron/**'];

export default defineConfig({
  test: {
    projects: [
      'packages/ui/vitest.config.ts',
      'packages/learning/vitest.config.ts',
      {
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          // packages with their own vitest config (jsdom, setup files) run as separate projects
          exclude: [...sharedExclude, 'packages/ui/**', 'packages/learning/**'],
        },
      },
      {
        test: {
          name: 'mobile',
          root: './apps/mobile',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'node',
          include: ['src/**/*.test.ts'],
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
