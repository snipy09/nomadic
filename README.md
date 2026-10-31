# Nomadic

Nomadic helps students in India go from learning to getting hired: a learning roadmap for any role, practice, a job
board matched to their skills, applications filled in for them to review, and a tracker for every application. Three apps share one codebase: **Windows**, **macOS** (test builds) and **Android**.

| | Windows | macOS | Android |
|---|---|---|---|
| Learn: a roadmap for any role (subjects → modules → topics), YouTube / ChatGPT / Done on every topic, 5 projects and a guided capstone | ✓ | ✓ | ✓ |
| Job board with match %, Saved, Hidden; News | ✓ | ✓ | ✓ (News is Home) |
| Apply with review (fills the real form, you approve every field) | ✓ | ✓ | "Auto apply from desktop" |
| Tracker, Application answers, Settings, Help, Admin | ✓ | ✓ | ✓ (Tracker opens from Jobs) |
| Practice (~1,800 company problems, mock mode, AI feedback) | ✓ | ✓ | – |
| Projects page (curated projects coming; links to the Learn capstone) | ✓ | ✓ | – |
| Outreach (behind a feature flag, shown as "Soon") | ✓ | ✓ | – |

Nothing is ever submitted without the user's review. Plans: Free, Pro ₹249/month, Max ₹599/month; limits are enforced
on the server.

> **New here (person or AI)? Start with [`context/README.md`](context/README.md)**: product, architecture, where each
> kind of change goes, conventions, status and how the owner works. Each app has its own `CONTEXT.md`.

## Repository layout

```
apps/
  desktop/      Windows app (Electron): Windows startup + NSIS/portable packaging        → apps/desktop/CONTEXT.md
  mac/          macOS app (Electron): Mac startup, menu, DMG packaging                   → apps/mac/CONTEXT.md
  android/      Android app (Capacitor 8): WebView host + native project                 → apps/android/CONTEXT.md
  web/          Marketing site (Vite + React, prerendered), https://nomadicai.vercel.app
packages/
  app-core/     Shared Electron main process: services, IPC handlers + typed contract, local SQLite, security
  app-ui/       Shared React UI: every screen, mountApp(), platform flags
  ui/           Design system: tokens, Tailwind preset, accessible components (Apple design language)
  config/       Plans and prices, feature flags, legal text (single source of truth)
  learning/     Learn v3 role roadmaps (src/v3), skill graph, SM-2, matching, v2 engine, seed content
  form-engine/  Reads, classifies, answers and verifies application forms (computer + Android agent)
  automation/   Browser automation for apply with review in the user's own Chrome/Edge/Brave
  capacitor-apply-browser/  Android apply WebView plugin (built and tested; not wired into the app yet)
  scrapers/     Job pipeline and sources, company feed, hackathons, hiring news, contacts, scraper-folder scheduler
  supabase/     Client wrappers, migrations, Edge Functions, one-paste setup files
  email-verifier/  Email checks and SMTP sending (Outreach)
  form-bench/   Form-filling benchmark (22 ATS fixtures)
context/        Project context (start here)
docs/           Decisions, feature list, how-to guides, plans, security
scripts/        scraper-folder/ (the Desktop scraper folder), windows/ (build + install launchers), dev/
brand/          Profile icon and GitHub profile assets
```

A change inside one `apps/` folder only affects that app. A change in `packages/app-ui` or `packages/app-core` affects
every app, and CI builds all three on every push.

## Getting started

Requirements: Node.js 22 (`.nvmrc`), npm 10. Packaging needs Windows (Windows app) or a Mac (Mac app); the Android APK
is built by CI.

```bash
npm ci
cp .env.example .env     # optional: builds default to the live Supabase project's public key
npm run dev:desktop      # Windows app (Electron) with hot reload
npm run dev:mac          # Mac app (on a Mac)
npm run dev:android      # Android app in a browser (open it at phone size, e.g. 390×844)
npm run dev:web          # marketing site
```

## Checks

```bash
npm run typecheck        # root, desktop, mac, web and android
npm run lint
npm test                 # all vitest projects (slow machine: --maxWorkers=2 --testTimeout=30000)
npm run build:desktop && npm run build:mac && npm run build:android && npm run build:web
npm run bench:forms      # form-filling benchmark
```

CI: `ci.yml` (typecheck, lint, tests and a build of each app on every push), `build-windows.yml` (unsigned Windows
build on demand), `release.yml` (signed Windows release), `build-mac.yml` (DMGs on demand), `android-app.yml` (debug APK +
emulator smoke test), `android-apply.yml`, `nightly-bench.yml`, `scrape.yml`, `scraper-folder.yml`.

## Data pipelines

The Desktop scraper folder (`Desktop\Nomadic Content\Scraper`, source in `scripts/scraper-folder`) runs every scraper
on its own interval and publishes to Supabase: jobs (Internshala, Unstop, company careers sites, Greenhouse/Lever/Ashby
boards, Adzuna, …; 30-day job age), company hiring snapshots, hackathons and Codeforces contests, hiring news from
Indian publishers, and Outreach contacts. Details: [`context/scrapers.md`](context/scrapers.md),
[`docs/guides/SCRAPER_LAPTOP.md`](docs/guides/SCRAPER_LAPTOP.md).

## Backend (Supabase)

- Project `nomadic`, region Mumbai. Accounts are custom `users_profile` rows; one active computer and one active
  phone per account (migration 032).
- Row-level security on every table; clients call only session-checked `SECURITY DEFINER` functions on an explicit
  allow-list ([`docs/security/SECURITY_CHECKLIST.md`](docs/security/SECURITY_CHECKLIST.md)).
- Migrations: `packages/supabase/migrations` (001–033, 035 and 036 live, no 013; 034 in the repo, not applied;
  next is 037). New project setup:
  [`docs/guides/DATABASE_SETUP.md`](docs/guides/DATABASE_SETUP.md).
- Edge Functions: `ai-proxy` (Gemini, per-plan daily limits), `send-email-code` (Resend), `google-sign-in`,
  `razorpay-webhook` (not deployed yet). Keys live in Supabase Vault, never in the apps.

## Releasing

- Windows: [`docs/guides/RELEASE.md`](docs/guides/RELEASE.md). `npm run package:desktop` on Windows, or
  `scripts/windows/Build Nomadic.bat` (copies the .exe files to Downloads). Current version 1.6.0 (1.5.0 on the website).
- macOS: [`docs/guides/MAC_APP.md`](docs/guides/MAC_APP.md). Unsigned test DMGs from `build-mac.yml` (code 1.6.0; site 1.4.0).
- Android: [`docs/guides/MOBILE_APP.md`](docs/guides/MOBILE_APP.md). Signed release APK built on the owner's laptop
  (code 1.6.0; 1.5.1 live on the website); debug APK from `android-app.yml`. Not on the Play Store.
- Public downloads are release assets in `snipy09/nomadic-releases` (tags `win-v<ver>`, `mac-v<ver>`, `android-v<ver>`).

All work lands on `main`; there are no other branches (old ones were removed 18 Oct 2026, unmerged ones kept as
`archive/*` tags).

## Legal

Terms of Service, Privacy Policy and Refund & Cancellation Policy live in `packages/config/src/legal.ts` and are
shown on the website (`/terms`, `/privacy`, `/refunds`) and in the apps. All payments are final.
