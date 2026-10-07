# Conventions

Last updated: 7 October 2026.

## Where code goes

- Platform-only code goes in its app folder (`apps/desktop`, `apps/mac`, `apps/android`); shared code in `packages/`.
  See the table in [architecture.md](architecture.md). Never import one app from another.
- `packages/app-core` must not import `packages/app-ui` (the UI depends on core types, never the reverse). Data both
  need (job roles, question vault) lives in `packages/app-core/src/shared/data/`.
- Platform checks: `PLATFORM`, `IS_MOBILE`, `IS_MAC`, `IS_DESKTOP` from `packages/app-ui/src/platform.ts`; OS hooks for
  the Electron apps go through `DesktopPlatform` in `packages/app-core/src/main/app.ts`.

## UI features

- Feature folders in `packages/app-ui/src/features/<name>/`: pure logic (`*Logic.ts` / `*Form.ts`) + data hook
  (`use*.ts`, stale-response safe, error state, optimistic updates with rollback) + small components.
- Every screen needs loading, empty and error-with-recovery states, keyboard-only use, and works at 1024 px (and at
  phone width when it is on Android).
- Use `@nomadic/ui` components and token classes; `PageHeader` and `FilterBar` for new screens.
- `store/preferences.ts` is the only file that touches `localStorage` (UI preferences only).

## IPC and data

- Every IPC input is validated with zod in `packages/app-core/src/main/ipc/schemas.ts`. Adding a channel means
  updating `packages/app-core/src/shared/ipc.ts` (`IPC_CHANNELS`, `Channel` map, `NomadicApi`),
  `packages/app-core/src/main/preload.ts`, `packages/app-ui/src/types.ts`, the channel count in
  `packages/app-core/src/main/__tests__/ipc-handle.test.ts`, and — if the phone has it — `apps/android/src/host/boot.ts`
  (otherwise the phone answers "desktop only").
- Local SQLite schema changes are new entries in `LOCAL_MIGRATIONS` (`packages/app-core/src/main/local-db/schema.ts`);
  never edit a shipped one. Supabase changes are new numbered files in `packages/supabase/migrations` (next: 034) plus
  a paste-safe copy in `packages/supabase/baseline/apply_0NN.sql` (no blank lines).
- No invented data anywhere: unknown stays unknown (profiles, salaries, match scores, AI answers, scraped facts).

## Tests

- Vitest projects (root `vitest.config.ts`): `packages`, `app-core` (Node), `app-ui` (jsdom), `desktop`, `mac`,
  `android`, `web`, plus `packages/ui` and `packages/learning`. Tests sit next to the code in `__tests__/`.
- Component tests: `// @vitest-environment jsdom` where needed, explicit `afterEach(cleanup)`, stub `window.api`.

## Before pushing

```
npm run typecheck        # root + desktop + mac + web + android
npm test                 # on the owner's laptop: npx vitest run --maxWorkers=2 --testTimeout=30000
npm run lint             # 0 errors (warnings allowed)
npm run build:desktop && npm run build:mac && npm run build:android
```

CI (`ci.yml`) runs the same on every push, including a build of each app.

## Never

- Secrets in code, commits or docs; model identifiers in commits or code.
- Submitting an application without the user's review; publishing invented data.
- Editing a shipped migration (local or Supabase); renaming generated project ids or feed company slugs.
- Non-ASCII text in `scripts/scraper-folder` (PowerShell 5.1 reads UTF-8 without BOM as ANSI).
