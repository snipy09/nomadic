# Nomadic

A Windows desktop app that helps Indian engineering students go from learning to getting hired: a personal
learning roadmap, practice, a job board matched to your skills, applications filled in for you to review, and a
tracker for every application.

- **Learn**: pick a target role and get a roadmap at the end of onboarding. Lessons with curated links, quiz
  checks, spaced-repetition reviews, streaks and a Today queue.
- **Practice**: ~1,800 company interview problems, role questions, timed mock mode, weak-topic tracking and AI
  feedback on written answers.
- **Job board**: openings collected from Indian and global sources, each with a skill-based match score and the
  top skills you are missing.
- **Apply with review**: Nomadic fills the real application form in your browser, shows every field and its
  source, and submits only after you tick "I reviewed this". It never submits without your review.
- **Tracker**: kanban and list of every application, with status history and notes, synced to your account.
- **Plans**: Free, Pro ₹249/month, Max ₹599/month. Limits are enforced on the server.

> New here (person or AI)? Read [`CLAUDE.md`](CLAUDE.md) first: the complete project context, decisions,
> architecture, live infrastructure and what is left.

## Repository layout

```
apps/
  desktop/          Electron app (main process + React renderer on @nomadic/ui)
    src/main/       IPC handlers (zod-validated), services, local SQLite (sql.js), Supabase calls
    src/renderer/   features/<name>/ folders: auth, onboarding, learn, practice, feed, apply,
                    applications, profile, billing, admin, data-safety, updates, help
    src/shared/     typed IPC contract shared by main and renderer
  web/              Marketing site (Vite + React, prerendered, sitemap, OG images, legal pages)
packages/
  ui/               Design system: tokens, Tailwind preset, accessible components
  config/           Single source for plans/prices, feature flags and legal text
  learning/         Skill graph, planner, SM-2, readiness/match, seed content (102 skills, 8 roles)
  form-engine/      Reads, classifies, answers and verifies application forms
  automation/       Browser automation, ATS adapters, fill-then-review flow
  scrapers/         Job pipeline: fetch, normalise, dedupe, validate, publish
  supabase/         Client, migrations, Edge Functions, setup and seed files
  form-bench/       Form-filling benchmark (22 ATS fixtures)
  email-verifier/   Email verification (used by the hidden Outreach feature)
docs/               Plans, decisions, security checklist, database setup, release
marketing/, brand-kit/, profile-readme/   Brand and marketing assets
```

## Getting started

Requirements: Node.js 20+, npm 10+, Windows for packaging (development works on any OS).

```bash
npm install
cp .env.example .env            # fill SUPABASE_URL and SUPABASE_ANON_KEY (public client key)
npm run dev:desktop             # Electron app with hot reload
npm run dev:web                 # marketing site
```

The app's build already defaults to the live Supabase project, so `.env` is optional for local development.

## Checks

```bash
npm test                                   # all unit and component tests (vitest)
npx tsc --noEmit -p apps/desktop           # desktop typecheck
npx tsc --noEmit -p apps/web               # website typecheck
npm run lint
npm run build:desktop && npm run build:web
npm run bench:forms                        # form-filling benchmark
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every push. Other workflows: `release.yml`
(signed Windows release), `nightly-bench.yml` (form benchmark), `scrape.yml` (scheduled job pipeline).

## Backend (Supabase)

- Project `nomadic`, region Mumbai (ap-south-1). Accounts are custom `users_profile` rows (not Supabase Auth).
- Every table has row-level security with no client policies; the app only calls session-checked
  `SECURITY DEFINER` functions on an explicit allow-list (`docs/SECURITY_CHECKLIST.md`).
- Migrations live in `packages/supabase/migrations` (001–022). A fresh project is set up with one paste of
  `packages/supabase/baseline/supabase_full_setup.sql`, then the later migrations, then `content_seed.sql`.
  Full steps: [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md).
- Edge Functions (`packages/supabase/functions`): `ai-proxy` (Gemini), `send-email-code` (Resend),
  `google-sign-in`, `razorpay-webhook`. Keys live in Supabase Vault, never in the app.

## Releasing

See [`docs/RELEASE.md`](docs/RELEASE.md). Packaging: `npm run package:desktop` (needs a code-signing certificate
for a trusted installer). Auto-update uses electron-updater with Stable and Beta channels.

## Documentation

| File | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Complete project context for people and AI assistants |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every product decision, numbered |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-by-feature status (F1–F14) |
| [`docs/SAAS_PLAN.md`](docs/SAAS_PLAN.md) | Quality bar and plan |
| [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) | Security findings, fixes, RPC allow-list, owner actions |
| [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md) | Supabase setup, live status, Edge Function deploys |
| [`REVAMP_PLAN.md`](REVAMP_PLAN.md) | Original revamp plan and step prompts |

## Legal

Terms of Service, Privacy Policy and Refund & Cancellation Policy live in `packages/config/src/legal.ts` and are
shown on the website (`/terms`, `/privacy`, `/refunds`) and in the app. All payments are final.
