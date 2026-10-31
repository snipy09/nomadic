# Nomadic: start here

The full project context lives in [`context/`](context/README.md); this file only holds what an assistant must know
before touching anything. Read [`context/README.md`](context/README.md) next, then the `CONTEXT.md` of the app you are
changing. Keep facts in `context/` (update the right file and `context/history.md`), not here.

## The repo in one minute

- Nomadic: a career app for anyone job-hunting in India: engineers, product and project managers, analysts, designers, freshers and experienced hires. Three apps on shared code:
  `apps/desktop` (Windows, Electron), `apps/mac` (macOS, Electron, test builds), `apps/android` (Capacitor), plus
  `apps/web` (marketing site).
- Shared: `packages/app-ui` (every screen), `packages/app-core` (Electron main process, IPC contract, local SQLite),
  `packages/ui` (design system), `packages/config` (prices, flags, legal), learning, form-engine, automation,
  scrapers, supabase.
- Backend: Supabase project `nomadic` (ref `grqkiddfwoyicktpgdea`, Mumbai). Migrations 001–037 are live (no 013); **next is 038**. Data is published by the Desktop scraper folder (`context/scrapers.md`).
- Learn (v3, 31 Oct 2026): a roadmap for any role built by ai-proxy (`roadmap_plan` format `tree`), stored in the synced
  `roadmap` document; code in `packages/learning/src/v3`, `services/learn-role.ts`, `features/learn/`. Plan:
  `docs/plans/LEARN_V3_PLAN.md`.

## Where a change goes

| Change for… | Edit | Affects |
|---|---|---|
| Windows only | `apps/desktop/` | Windows |
| macOS only | `apps/mac/` | Mac |
| Android only | `apps/android/` | Android |
| Every app (screens, services, IPC, DB) | `packages/app-ui`, `packages/app-core` | all three (CI builds all) |

Never import one app from another; `packages/app-core` never imports `packages/app-ui`.

## Rules that are never broken

- Nothing is submitted without the user's review. No invented data anywhere (unknown stays unknown).
- No secrets in code, commits or docs; no model identifiers in commits or code. Never print secrets from `.env`, Vault
  or tokens. Never stage `.claude/`.
- Never edit a shipped migration (local `LOCAL_MIGRATIONS` or Supabase); never rename generated project ids or feed
  company slugs.
- Do not sign in, sign up or submit forms against the live backend; the owner tests accounts.
- Do not delete or publish things unasked; flag them.

## Before pushing

```
npm run typecheck && npm run lint && npm test
npm run build:desktop && npm run build:mac && npm run build:android
```

(On the owner's laptop: `npx vitest run --maxWorkers=2 --testTimeout=30000`.) Checklists for IPC channels, migrations
and tests: [`context/conventions.md`](context/conventions.md).

## How the owner works

Short, informal instructions ("fix it", "finish everything"). Finish end to end (code, tests, build, deploy, verify,
push to `main`); pick sensible defaults instead of stopping at a plan. Reports are concise: what changed, what was
verified, what the owner must do. Things made for the owner go in a subfolder of `Desktop\Nomadic Content`. Windows +
PowerShell 5.1 on the laptop. Full notes: [`context/working-with-owner.md`](context/working-with-owner.md).

## Current state and next work

[`context/status-and-roadmap.md`](context/status-and-roadmap.md): owner actions (scraper folder go-live, Learn v2
content checks, Resend domain, key rotation, consent screen, …) and code follow-ups.
