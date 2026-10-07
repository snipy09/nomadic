import { defineConfig } from 'vitest/config';

// One vitest run, one project per package/app:
//  - packages:   shared Node packages (automation, scrapers, supabase, email-verifier, form-engine, ...)
//  - app-core:   the shared Electron main process (Node environment)
//  - app-ui:     the shared React UI, with a DOM (jsdom)
//  - desktop:    Windows-only startup code (apps/desktop)
//  - mac:        macOS-only startup code (apps/mac)
//  - android:    the Android host layer (Electron/Node stand-ins, phone device id)
//  - web:        landing page data (pricing from config, SEO, share cards, privacy content)
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
          exclude: [...sharedExclude, 'packages/ui/**', 'packages/learning/**', 'packages/app-core/**', 'packages/app-ui/**'],
        },
      },
      {
        test: {
          name: 'android',
          root: './apps/android',
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
          name: 'app-core',
          root: './packages/app-core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'app-ui',
          root: './packages/app-ui',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'desktop',
          root: './apps/desktop',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
      {
        test: {
          name: 'mac',
          root: './apps/mac',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: sharedExclude,
        },
      },
    ],
  },
});
