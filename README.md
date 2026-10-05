# Nomadic

A Windows desktop app that helps Indian engineering students go from learning to getting hired: a personal
learning roadmap, practice, a job board matched to your skills, applications filled in for you to review, and a
tracker for every application.

- **Learn**: a short one-question-per-page intake builds a dated roadmap (AI-picked from a reviewed catalogue,
  with a rules fallback), shown as a week-by-week path of study days with Today, topics, quizzes, SM-2 reviews,
  named LeetCode problems and progress.
- **Projects**: ~4,100 guided projects (12 curated, the rest generated across web, backend, full-stack, mobile,
  CLI, DevOps, data and ML stacks), with stages, starter code, checks, a GitHub repo check and AI help per stage.
- **Practice**: ~1,800 company interview problems, role questions, timed mock mode, weak-topic tracking and AI
  feedback on written answers.
- **Job board**: openings collected from Indian and global sources, each with a skill-based match score and the
  top skills you are missing.
- **Apply with review**: Nomadic fills the real application form in your browser, shows every field and its
  source, and submits only after you tick "I reviewed this". It never submits without your review.
- **Tracker**: kanban and list of every application, with status history, notes and follow-up reminders,
  synced to your account.
- **Answers**: common application answers and the answers you typed during apply, reused on later forms.
- **Outreach** (shown as "Soon"): referral emails with a review gate, behind a build-time feature flag.
- **Plans**: Free, Pro ₹249/month, Max ₹599/month. Limits are enforced on the server.

> New here (person or AI)? Read [`CLAUDE.md`](CLAUDE.md) first: the complete project context, decisions,
> architecture, live infrastructure and what is left.

## Repository layout

```
apps/
  desktop/          Electron app (main process + React renderer on @nomadic/ui)
    src/main/       IPC handlers (zod-validated), services, local SQLite (sql.js), Supabase calls
    src/renderer/   features/<name>/ folders: auth, onboarding, learn, projects, practice, feed, apply,
                    applications, answers, outreach, profile, billing, admin, data-safety, updates, help
    src/shared/     typed IPC contract shared by main and renderer
  web/              Marketing site (Vite + React, prerendered, sitemap, OG images, legal pages),
                    live at https://nomadicai.vercel.app
packages/
  ui/               Design system: tokens, Tailwind preset, accessible components
  config/           Single source for plans/prices, feature flags and legal text
  learning/         Skill graph, SM-2, readiness/match, Learn v2 engine (roadmap, scheduler, path, projects),
                    seed content (109 skills, 109 lessons, 864 quiz items, 420 topics, 337 problems)
  form-engine/      Reads, classifies, answers and verifies application forms
  automation/       Browser automation, ATS adapters, fill-then-review flow
  scrapers/         Job pipeline (fetch, normalise, dedupe, validate, India filter, publish) and
                    the public-page contacts scraper for Outreach
  supabase/         Client, migrations, Edge Functions, setup and seed files
  form-bench/       Form-filling benchmark (22 ATS fixtures)
  email-verifier/   Email verification and SMTP sending (Outreach)
docs/               Plans, decisions, security checklist, database setup, release, scraper, Learn v2, Outreach
scripts/            Laptop/desktop scraper runners, Windows signing, test helpers
brand-kit/, profile-readme/   Brand assets (videos and carousels are kept outside the repo)
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

On a slow machine run the tests with `npx vitest run --maxWorkers=2 --testTimeout=30000`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every push. Other workflows: `release.yml`
(signed Windows release), `nightly-bench.yml` (form benchmark), `scrape.yml` (scheduled job pipeline).

## Jobs feed

The feed reads the live `jobs` table. Fill it with `npm run scrape:publish` (needs `SUPABASE_SERVICE_ROLE_KEY`),
the laptop runner `scripts\scrape-laptop.cmd` ([`docs/SCRAPER_LAPTOP.md`](docs/SCRAPER_LAPTOP.md)), or the
scheduled `scrape.yml` workflow once the repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

## Backend (Supabase)

- Project `nomadic`, region Mumbai (ap-south-1). Accounts are custom `users_profile` rows (not Supabase Auth).
- Every table has row-level security with no client policies; the app only calls session-checked
  `SECURITY DEFINER` functions on an explicit allow-list (`docs/SECURITY_CHECKLIST.md`).
- Migrations live in `packages/supabase/migrations` (001–030, no 013; all applied live). A fresh project is set up with one paste of
  `packages/supabase/baseline/supabase_full_setup.sql`, then the later migrations, then `content_seed.sql`.
  Full steps: [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md).
- Edge Functions (`packages/supabase/functions`): `ai-proxy` (Gemini: rubric feedback, form answers, outreach
  drafts, roadmap plan/adjust, project help; per-plan daily limits), `send-email-code` (Resend), `google-sign-in`
  (deployed) and `razorpay-webhook` (not deployed yet). Keys live in Supabase Vault, never in the app.

## Releasing

See [`docs/RELEASE.md`](docs/RELEASE.md). Packaging: `npm run package:desktop` (needs a code-signing certificate
for a trusted installer); the current version is 1.2.0. Auto-update uses electron-updater with Stable and Beta channels.

## Documentation

| File | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Complete project context for people and AI assistants |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every product decision, numbered |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-by-feature status (F1–F14) |
| [`docs/SAAS_PLAN.md`](docs/SAAS_PLAN.md) | Quality bar and plan |
| [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) | Security findings, fixes, RPC allow-list, owner actions |
| [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md) | Supabase setup, live status, Edge Function deploys |
| [`docs/LEARN_V2_PLAN.md`](docs/LEARN_V2_PLAN.md), [`docs/LEARN_V2_HANDOFF.md`](docs/LEARN_V2_HANDOFF.md) | Learn v2 design and build status |
| [`docs/OUTREACH_PLAN.md`](docs/OUTREACH_PLAN.md) | Outreach design and launch checklist |
| [`docs/SCRAPER_LAPTOP.md`](docs/SCRAPER_LAPTOP.md) | Running the job scraper from a laptop |
| [`docs/RELEASE.md`](docs/RELEASE.md) | Packaging, signing and update channels |
| [`docs/SECURITY_CLEANUP.md`](docs/SECURITY_CLEANUP.md) | Git history cleanup steps |
| [`REVAMP_PLAN.md`](REVAMP_PLAN.md) | Original revamp plan and step prompts |

## Legal

Terms of Service, Privacy Policy and Refund & Cancellation Policy live in `packages/config/src/legal.ts` and are
shown on the website (`/terms`, `/privacy`, `/refunds`) and in the app. All payments are final.
