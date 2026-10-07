# Nomadic

Nomadic helps Indian engineering students go from learning to getting hired: a personal learning roadmap,
practice, a job board matched to their skills, applications filled in for them to review, and a tracker for every
application. It ships as a **Windows desktop app** and an **Android app**.

| | Desktop (Windows) | Android |
|---|---|---|
| Learn: roadmap, path, today, topics, quizzes, progress | ✓ | ✓ |
| Job board with match %, Saved, Hidden | ✓ | ✓ |
| Apply with review (fills the real form, you approve every field) | ✓ | "Auto apply from desktop": saves the job for the desktop |
| Tracker, Application answers, Settings, Help, Admin | ✓ | ✓ |
| Practice (~1,800 company problems, mock mode, AI feedback) | ✓ | – |
| Projects (~4,100 guided projects, repo check, AI help) | ✓ | – |
| Outreach (behind a feature flag, shown as "Soon") | ✓ | – |

Jobs saved on one device show up on the other (both sync through the account). Nothing is ever submitted without
the user's review. Plans: Free, Pro ₹249/month, Max ₹599/month; limits are enforced on the server.

> New here (person or AI)? Read [`CLAUDE.md`](CLAUDE.md) first: the complete project context, decisions,
> architecture, live infrastructure and what is left. The docs index is [`docs/README.md`](docs/README.md).

## Repository layout

```
apps/
  desktop/            Electron app: src/main (IPC handlers, services, local SQLite), src/renderer (React,
                      features/<name>/), src/shared (typed IPC contract)
  mobile/             Android app (Capacitor 8): the desktop renderer and services run in the WebView;
                      src/host = Electron/Node stand-ins, IndexedDB database, phone device id; android/ = native project
  web/                Marketing site (Vite + React, prerendered), live at https://nomadicai.vercel.app
packages/
  ui/                 Design system: tokens, Tailwind preset, accessible components (Apple design language)
  config/             Plans and prices, feature flags, legal text (single source of truth)
  learning/           Skill graph, SM-2, matching, Learn v2 engine, generated project library, seed content
  form-engine/        Reads, classifies, answers and verifies application forms (desktop + Android agent)
  automation/         Browser automation for apply with review (desktop)
  capacitor-apply-browser/  Android apply WebView plugin (built and tested; not wired into the app yet)
  scrapers/           Job pipeline, contacts scraper (Outreach) and feed scraper (company openings, hackathons)
  supabase/           Client wrappers, migrations, Edge Functions, one-paste setup files
  form-bench/         Form-filling benchmark (22 ATS fixtures)
  email-verifier/     Email checks and SMTP sending (Outreach)
docs/
  DECISIONS.md, FEATURES.md   Product decisions and feature status
  guides/             How to: database setup, release, laptop scraper, Android app, Android apply, SQL to paste
  plans/              Designs and plans: SaaS quality bar, Learn v2, Outreach, Home feed, original revamp
  security/           Security checklist and git history cleanup
  architecture.excalidraw     Architecture diagram
scripts/
  scraper-folder/     The Desktop scraper folder (launchers, settings.ini, auto schedule); built with every scraper
                      bundled by `npm run build:scraper-folder`, installed by windows/Install scraper folder.cmd
  windows/            Windows launchers: Build Nomadic.bat (+ build-nomadic.ps1), Install scraper folder.cmd, OCR helper
  dev/                One-off developer scripts
  scrape-laptop.*, sign-windows.js
brand/                Profile icon and GitHub profile assets (videos and carousels are kept outside the repo)
```

## Getting started

Requirements: Node.js 22, npm 10. Packaging the desktop app needs Windows; the Android APK is built by CI.

```bash
npm install
cp .env.example .env            # optional: the builds default to the live Supabase project's public key
npm run dev:desktop             # Electron app with hot reload
npm run dev:web                 # marketing site
npm run dev -w @nomadic/mobile  # Android app in a browser (open it at phone size, e.g. 390×844)
```

## Checks

```bash
npm run typecheck                          # root, desktop, web and mobile
npm run lint
npm test                                   # all vitest projects (on a slow machine: --maxWorkers=2 --testTimeout=30000)
npm run build:desktop && npm run build:web
npm run build -w @nomadic/mobile           # Android web bundle
npm run bench:forms                        # form-filling benchmark
```

CI: `ci.yml` (typecheck, lint, tests on every push), `android-app.yml` (builds the debug APK and smoke-tests it on
an emulator; the APK is a run artifact), `android-apply.yml` (Android form agent on emulators), `build-windows.yml`
(unsigned Windows build on demand), `release.yml` (signed release), `nightly-bench.yml`, `scrape.yml`,
`scraper-folder.yml` (builds the Desktop scraper folder as a downloadable artifact).

## Data pipelines

- **All scrapers on a schedule**: the Desktop scraper folder (`Desktop\Nomadic Content\Scraper`, source in
  `scripts/scraper-folder`, [`docs/guides/SCRAPER_LAPTOP.md`](docs/guides/SCRAPER_LAPTOP.md)) runs every scraper
  below on its own interval (settings.ini) through a Windows scheduled task and publishes to Supabase.
- **Jobs** (`jobs` table): `npm run scrape:publish` or `scrape.yml` once the repository secrets `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are set. Sources: Internshala, Unstop, company careers sites, Greenhouse/Lever/Ashby
  boards (built in plus those `discover` finds for ~370 India-hiring companies), Remotive, Jobicy, Arbeitnow, RSS,
  Adzuna (with a key). Jobs expire 30 days after posting (migration 033).
- **Feed sources** (migration 031): `npm run scrape:feed -- --publish` reads India-open openings (full time and
  internships) from 66 famous companies' own careers sites and ATS boards (plus discovered boards), with daily hiring
  snapshots, plus hackathons from Devfolio, Unstop, Devpost, HackerEarth, Hack2skill and MLH, and Codeforces contests
  (migration 033). robots.txt is obeyed.
- **Hiring news** (migration 033 `news_items`): `npm run scrape:news -- --publish` reads Indian publishers' RSS feeds
  and keeps hiring plans, campus drives, layoffs, funding and expansion, with facts read from the text.
- **Contacts** (Outreach): `npm run scrape:contacts -- --publish`, public pages only.

## Backend (Supabase)

- Project `nomadic`, region Mumbai. Accounts are custom `users_profile` rows (not Supabase Auth); one active
  computer and one active phone per account (migration 032).
- Row-level security on every table; clients call only session-checked `SECURITY DEFINER` functions on an
  explicit allow-list ([`docs/security/SECURITY_CHECKLIST.md`](docs/security/SECURITY_CHECKLIST.md)).
- Migrations: `packages/supabase/migrations` (001–032, no 013; 031 and 032 still to be pasted live, see
  `packages/supabase/baseline/apply_031.sql` and `apply_032.sql`). New project setup:
  [`docs/guides/DATABASE_SETUP.md`](docs/guides/DATABASE_SETUP.md).
- Edge Functions: `ai-proxy` (Gemini, per-plan daily limits), `send-email-code` (Resend), `google-sign-in`,
  `razorpay-webhook` (not deployed yet). Keys live in Supabase Vault, never in the apps.

## Releasing

- Desktop: [`docs/guides/RELEASE.md`](docs/guides/RELEASE.md). `npm run package:desktop` or double-click
  `scripts/windows/Build Nomadic.bat` (copies the .exe files to Downloads). Current version 1.4.0.
- Android: [`docs/guides/MOBILE_APP.md`](docs/guides/MOBILE_APP.md). Debug APK from the `android-app.yml` run
  artifacts; release signing and the Play Store are not set up yet.

## Legal

Terms of Service, Privacy Policy and Refund & Cancellation Policy live in `packages/config/src/legal.ts` and are
shown on the website (`/terms`, `/privacy`, `/refunds`) and in the apps. All payments are final.
