# Nomadic

Career app for engineering students in India: learning roadmap, practice, a job board matched to their skills,
application forms filled in for them to review, and a tracker for every application. One codebase ships three apps:
**Windows**, **macOS** (test builds) and **Android**, plus the marketing site.

> **New here (person or AI)?** Read [`context/README.md`](context/README.md) first, then the `CONTEXT.md` of the app
> you are changing.

| | Windows | macOS | Android |
|---|---|---|---|
| Learn: roadmap, path, today, topics, quizzes, progress | ✓ | ✓ | ✓ |
| Job board with match %, Saved, Hidden; News | ✓ | ✓ | ✓ (News is Home) |
| Apply with review (fills the real form, you approve every field) | ✓ | ✓ | "Auto apply from desktop" |
| Tracker, Application answers, Settings, Help, Admin | ✓ | ✓ | ✓ |
| Practice (~1,800 company problems, mock mode, AI feedback) | ✓ | ✓ | – |
| Projects (~4,100 guided projects, repo check, AI help) | ✓ | ✓ | – |
| Outreach (behind a feature flag, shown as "Soon") | ✓ | ✓ | – |

- Nothing is ever submitted without the user's review.
- Plans: Free, Pro ₹249/month, Max ₹599/month (`packages/config/src/plans.ts`); limits are enforced on the server.
- Current app version: 1.4.0.

## Repository layout

```
apps/                 one folder per shipped app (a change here affects only that app)
  desktop/            Windows (Electron): startup, NSIS + portable packaging            → apps/desktop/CONTEXT.md
  mac/                macOS (Electron): menu, DMG packaging                            → apps/mac/CONTEXT.md
  android/            Android (Capacitor 8): WebView host + native project             → apps/android/CONTEXT.md
  web/                marketing site (Vite + React, prerendered)
packages/             shared code (app-ui / app-core changes affect every app)
  app-ui/             every screen, mountApp(), platform flags
  app-core/           Electron main process: services, IPC handlers + typed contract, local SQLite, security
  ui/                 design system: tokens, Tailwind preset, accessible components
  config/             prices, feature flags, legal text, download info (single source of truth)
  learning/           skill graph, SM-2, matching, Learn v2 engine, project library, seed content
  form-engine/        reads, classifies, answers and verifies application forms
  automation/         apply with review in the user's own Chrome / Edge / Brave
  capacitor-apply-browser/  Android apply WebView plugin (built and tested, not wired in yet)
  scrapers/           ALL scrapers: jobs, company feed, hackathons, news, contacts, the Desktop scraper folder
                      and its launchers                                                → packages/scrapers/README.md
  supabase/           client wrappers, migrations, Edge Functions, one-paste setup SQL
  email-verifier/     email checks and SMTP sending (Outreach)
  form-bench/         form-filling benchmark (22 ATS fixtures)
deploy/               ALL deployments: Windows build + signing, Mac release, tester builds → deploy/README.md
context/              project context, kept current (start here)
docs/                 decisions, feature list, guides (database, Android), plans, security
scripts/              dev/ one-off scripts, windows/ local UI + admin launchers, OCR helper
brand/                profile icon and GitHub profile assets
.github/workflows/    CI and release workflows
vercel.json           Vercel config for the website (must stay at the repo root)
```

Rules: never import one app from another; `packages/app-core` never imports `packages/app-ui`.

## Getting started

Requirements: Node.js 22 (`.nvmrc`), npm 10. Packaging needs Windows (Windows app) or a Mac (Mac app); the Android APK
is built by CI.

```bash
npm ci
cp .env.example .env     # optional: builds default to the live Supabase project's public key
npm run dev:desktop      # Windows app with hot reload
npm run dev:mac          # Mac app (on a Mac)
npm run dev:android      # Android app in a browser (open it at phone size, e.g. 390×844)
npm run dev:web          # marketing site
```

## Checks (run before every push)

```bash
npm run typecheck        # root, desktop, mac, web and android
npm run lint
npm test                 # slow machine: npx vitest run --maxWorkers=2 --testTimeout=30000
npm run build:desktop && npm run build:mac && npm run build:android && npm run build:web
```

Checklists for IPC channels, migrations and tests: [`context/conventions.md`](context/conventions.md).

## Deployments

All targets, commands, workflows and their current state: **[`deploy/README.md`](deploy/README.md)**.

| Target | Short version |
|---|---|
| Website | Vercel project `nomadic-app` deploys every push to `main` that touches the site → https://nomadicai.vercel.app |
| Windows | Signed release: tag `v*.*.*` (`release.yml`). Local: `deploy\windows\Build Nomadic.bat` |
| macOS | `npm run release:mac` or `release-mac.yml` → `snipy09/nomadic-releases` (not notarized) |
| Android | Debug APK from `android-app.yml`; no release signing or Play Store yet |
| Supabase | `packages/supabase/scripts/migrate.sh`; migrations 001–033 live (no 013), 034 in the repo, next is 035 |
| Tester builds | `deploy/tester-builds/` |

## Scrapers

Everything lives in [`packages/scrapers`](packages/scrapers/README.md). The Desktop scraper folder
(`Desktop\Nomadic Content\Scraper`) runs every scraper on its own interval and publishes to Supabase: jobs
(Internshala, Unstop, company careers sites, Greenhouse / Lever / Ashby boards, Adzuna, …; 30-day job age), company
hiring snapshots, hackathons and Codeforces contests, hiring news from Indian publishers, and Outreach contacts.
Details: [`context/scrapers.md`](context/scrapers.md), [`packages/scrapers/SCRAPER_LAPTOP.md`](packages/scrapers/SCRAPER_LAPTOP.md).

## Backend (Supabase)

- Project `nomadic`, region Mumbai. Accounts are custom `users_profile` rows; one active computer and one active
  phone per account (migration 032).
- Row-level security on every table; clients call only session-checked `SECURITY DEFINER` functions on an explicit
  allow-list ([`docs/security/SECURITY_CHECKLIST.md`](docs/security/SECURITY_CHECKLIST.md)).
- Edge Functions: `ai-proxy` (Gemini, per-plan daily limits), `send-email-code` (Resend), `google-sign-in`;
  `razorpay-webhook` is not deployed yet. Keys live in Supabase Vault, never in the apps.
- New project setup: [`docs/guides/DATABASE_SETUP.md`](docs/guides/DATABASE_SETUP.md).

## Legal

Terms of Service, Privacy Policy and Refund & Cancellation Policy live in `packages/config/src/legal.ts` and are shown
on the website (`/terms`, `/privacy`, `/refunds`) and in the apps. All payments are final.
