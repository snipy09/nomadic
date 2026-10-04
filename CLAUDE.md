# Nomadic: complete project context

Read this first. It is the single source of context for anyone (person or AI assistant) working on this repo.
Last full update: 4 October 2026. Keep it current when something important changes.
New session or new assistant account? Read sections 9–11 at the end first (handoff state, how to build and test,
how the owner wants work done).

## 1. What Nomadic is

A **Windows desktop app** (Electron) for **Indian engineering students** looking for placements, internships and
first jobs. One app covers the whole path:

1. **Onboarding** (4–5 short steps) ends with a **personal learning roadmap** (core feature).
2. **Learn**: My Path (skills ordered by prerequisites, fitted to weekly hours and horizon), lessons with curated
   links and quiz checks, "I already know this" placement, Today queue with SM-2 spaced repetition, streaks.
3. **Practice**: ~1,800 LeetCode-company problems (external links), role questions, timed mock mode, weak topics,
   AI rubric feedback on written answers (Pro/Max).
4. **Job board**: jobs collected by the scraper pipeline, skill-based match % and top missing skills, save, filters.
5. **Apply with review**: fills the real form in the user's Chrome, shows every field with its source and
   confidence, the user edits what needs them and ticks "I reviewed this" per application; only then is it
   submitted. **Nothing is ever submitted without review** (product rule, also in the Terms).
6. **Tracker**: kanban + list of applications, status history, notes, synced.
7. **Settings**: profile (no invented data), resumes, workspace, application answers, portal sign-ins, plan,
   data & privacy (export, delete account, diagnostics), updates (Stable/Beta), crash reports (opt-in), help.
8. **Admin** (role `admin` only, enforced server side): users, plans/status changes with reasons, audit log,
   scraper health, content editing with versions.

Plans: **Free / Pro ₹249 / Max ₹599 per month**, no auto-renewal, **no refunds** (payment errors excepted).
Free: 1 learning track, 10 practice/day, 3 applies/day, 10 feed listings, no AI feedback, 10 AI form calls/day.
Pro: 10 applies/day, 30 AI feedback, 40 AI form calls. Max: unlimited applies, 100 feedback, 300 form calls.
Prices and limits live only in `packages/config/src/plans.ts` (SQL copies are parity-tested).

Owner: solo founder, no fixed deadline, quality over speed. Product name "Nomadic" is final (old names hirestack /
jobmaxxer were removed).

## 2. Product decisions (summary; full list in `docs/DECISIONS.md`)

- India-first job sources; Windows only at launch (macOS after beta).
- Hidden behind feature flags (`packages/config/src/features.ts`): Outreach, Opportunity Board, Resource Vault,
  AI Assistant. Enable with `VITE_FEATURES="outreach=on,..."` at build time.
- Learn: curated, link-checked free resources; AI-drafted lessons only after review. No code runner at launch.
- Analytics/crash reports opt-in only. No offline mode (local DB is a cache/outbox).
- AI: operator's Gemini key held server side (Supabase Vault) behind the `ai-proxy` Edge Function; never shipped
  in the app; per-user daily limits on the server. Groq is a stub behind the same provider interface.
- Data: local-first SQLite (sql.js) synced to Supabase. **No invented data anywhere** (profiles, salaries, match
  scores, AI answers: unknown stays unknown).
- Email: Resend via the `send-email-code` Edge Function. Google sign-in via the `google-sign-in` Edge Function.
- No alpha users exist: legacy data migrations are not needed; legacy code is deleted outright.
- Legal text is written for India (DPDP Act 2023) and lives in `packages/config/src/legal.ts`.

## 3. Architecture

```
apps/desktop   Electron
  src/main/        index.ts (startup), ipc/*.ts (handlers; every input zod-validated in ipc/schemas.ts),
                   services/*.ts (auth, oauth, profile, apply, applications, learning, practice, billing,
                   entitlements, admin, ai-proxy, email-codes, cloud-sync, account-data, updates, telemetry),
                   db.ts + local-db/ (versioned SQLite migrations via PRAGMA user_version, backups, integrity)
  src/shared/      ipc.ts: the typed IPC contract (IPC_CHANNELS, Channel types, NomadicApi); admin.ts
  src/renderer/    App.tsx (shell + routing by activeTab), store/ (Zustand appStore; preferences.ts is the ONLY
                   file allowed to touch localStorage, UI prefs only), features/<name>/ (one folder per feature:
                   pure logic module + hooks + components), components/ (remaining legacy screens), browserApiShim.ts
                   (browser preview mock; no real data)
apps/web       Marketing site: Vite + React, prerendered pages, sitemap, per-page OG images, JSON-LD,
               /terms /privacy /refunds rendered from @nomadic/config
packages/ui          @nomadic/ui design system: tokens, Tailwind preset, AppShell, NavItem, Button, Dialog, Drawer,
                     Tabs, Select, Combobox, Toast, Skeleton, EmptyState, ProgressRing, etc. Use token classes
                     (bg-surface, text-fg, text-fg-muted, border-line, text-body, text-caption, font-strong); never
                     hardcoded slate/zinc colours or `dark:` variants.
packages/config      plans.ts (prices/limits), features.ts (flags), legal.ts (terms/privacy/refunds), tiers.ts
packages/learning    @job-automator/learning: types (zod), graph, planner, sm2, today, readiness/jobMatch, tagSkills,
                     practiceAttempts/weakTopics, seed/bundle.json (8 roles, 102 skills, 207 weights, 29 resources,
                     102 lessons, 145 practice items; all AI-drafted, status draft), scripts/seed-sql.mjs
packages/form-engine FormReader, classifier, answerer (one batched LLM call via a FormAnswerClient), writers, verifier
packages/automation  AutoApplyEngine: fill with autoSubmit off, onReadyForReview, submitReviewed; ATS adapters
packages/scrapers    Pipeline: fetch, normalise (zod Job schema), dedupe, validate links, classify, publish
packages/supabase    client wrappers (index.ts), migrations/, functions/, baseline/ (one-paste setup files), scripts/
packages/form-bench  22 ATS fixtures and scorer (`npm run bench:forms`)
```

Key flows:
- **Sign-in**: `authenticate_user` returns a single-use `login_ticket`; `register_device_session` registers one
  active device (requires the ticket when `app_security.require_login_ticket` is on); heartbeat + `sync_pull`.
  Google sign-in: PKCE in the desktop, ID token verified by the `google-sign-in` Edge Function, which calls the
  service-role-only `google_sign_in` and returns the same row incl. a ticket.
- **Apply**: renderer `features/apply/useApplyRunner` → `startBatchCoPilot` (fills forms one at a time, streams
  per-field events) → `ApplyRunView` (review, edit, tick) → `submitAllBatchCoPilot(overrides, ids)`; the server
  quota (`consume_apply_quota`) is consumed right before each submission.
- **Matching**: `features/feed/match.ts` tags job text and profile skills against the same skill catalogue as Learn.
- **AI**: desktop main `services/ai-proxy.ts` → `{SUPABASE_URL}/functions/v1/ai-proxy` (anon key as bearer + device
  session in body) → `consume_ai_quota` → Gemini (`gemini-2.5-flash`, JSON schema) → output checks → refund on failure.

## 4. Live infrastructure

- **Supabase project `nomadic`**: ref `grqkiddfwoyicktpgdea`, region ap-south-1 (Mumbai), free plan, org "Nomadic".
  URL `https://grqkiddfwoyicktpgdea.supabase.co`. The anon key is public by design and is the build default in
  `apps/desktop/build-main.mjs`, scrapers and web. The service-role key is never in the app or repo.
- **Applied migrations**: 001–012, 014–024 (013 does not exist; 023 is the web waitlist; 024, no Max downgrade on
  payment, applied 4 Oct 2026). **Not yet applied: 025** (payment history RPC; `baseline/apply_025.sql`,
  rehearsed on PostgreSQL 16) and **026** (account sync of hidden jobs and follow-up dates; `baseline/apply_026.sql`,
  not rehearsed: no local PostgreSQL on this machine). Until 026 is applied the app logs the missing RPCs and keeps
  both local. Security advisor: no errors; remaining notices are by design (deny-all tables;
  session-checked SECURITY DEFINER RPCs callable by anon).
- **Learn content seeded** from the bundle (checksums verified).
- **Edge Functions deployed** (JWT verification on): `google-sign-in`, `send-email-code`, `ai-proxy`.
  `razorpay-webhook` exists in the repo but is not deployed yet.
- **Vault secrets**: `resend_api_key`, `gemini_api_key`, `google_oauth_client_id` (set). Missing: `email_from`.
- **Google OAuth**: "Desktop app" client created; id/secret are in GitHub repo secrets and in the gitignored
  `apps/desktop/.env` (read by `build-main.mjs` and `vite.config.ts`; real env vars win). `require_login_ticket` is on.
  Read only by service_role via `public.server_secret(name)` (allow-listed names) / `private.get_vault_secret`.
- A leftover schema `zz_unused` holds empty tables from the first setup attempt; safe to drop (needs a paste in the
  SQL editor because it is a DROP).
- **Applying SQL**: the Supabase MCP connector times out on statements it treats as destructive (DROP/DELETE),
  so those are pasted by the owner. Paste files have no blank lines (the SQL editor splits on them) and the content
  seed uses dollar quoting (the editor misreads backslash escapes). Rehearse locally first: PostgreSQL 16 at
  `/usr/lib/postgresql/16/bin`, shim `packages/supabase/scripts/local-supabase-shim.sql`, then
  `baseline/supabase_full_setup.sql` and later migrations (stub `vault.decrypted_secrets` locally).

## 5. Security model (details: `docs/SECURITY_CHECKLIST.md`)

- RLS on every public table; no client policies except read-only published content and active jobs.
- Clients call only allow-listed RPCs, each re-checking `session_token + user_id + device_fingerprint + is_active`.
  New client RPCs must be granted explicitly in a migration and added to the allow-list.
- Service-role-only: `server_secret`, `consume_ai_quota`, `refund_ai_quota`, `request_email_code`, `google_sign_in`.
- Roles/tiers come only from the server (email-based admin grants were removed). Admin actions are server-checked
  RPCs with an append-only audit log.
- Passwords: bcrypt of a client pre-hash; login rate limits; generic credential errors; one active device.
- API keys / SMTP passwords stay on the computer (OS keychain) and are never uploaded; no model keys in builds.

## 6. Status by feature (details: `docs/FEATURES.md`)

Built and merged: F1 shell, F2 accounts + onboarding + password reset/verification + Google sign-in (server side),
F3 feed + matching, F4 apply with review, F5 tracker, F6 profile, F7 Learn + roadmap, F8 Practice, F9 entitlements
and quotas, F10 data safety, F11 updates/telemetry/help, F12 admin, F14 landing (Lighthouse mobile 97/100/100/100).
F13 (Outreach, Opportunity Board, Resource Vault, Assistant) stays hidden; Outreach and the Assistant still call AI
directly and need rework or removal.

Tests: ~1,084 vitest tests pass (105 files); typecheck, lint (0 errors, ~200 warnings) and desktop/web builds pass.
The built Electron app has been smoke-tested over CDP (window, live feed via IPC, Learn, Settings, Help, Activity, Admin
screens). The owner has signed in on the packaged v1.0.6 app and run apply up to the review screen on a real Lever form
(4 Oct 2026). **Not yet verified live: Google sign-in end to end, an actual reviewed submission, AI feedback.**

## 7. What is left

Owner actions:
1. Keep the live `jobs` table fresh (seeded once on 4 Oct 2026 with 328 active India-open jobs, 137 internships): run
   `scripts\scrape-laptop.cmd` on a laptop (`docs/SCRAPER_LAPTOP.md`) and/or set the GitHub Actions secrets
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The pipeline keeps only jobs open to candidates in India by default
   (`--region all` to keep everything).
2. Create the admin account (SQL in `docs/DATABASE_SETUP.md`).
3. Run the app (`npm run dev:desktop`) and test: sign-up, onboarding → roadmap, lesson, feed, apply with review,
   tracker, password reset, AI feedback.
4. Google OAuth: done (Vault, repo secrets, local `.env`). If the consent screen is in "Testing", add testers or
   publish it, or only listed Google accounts can sign in.
5. Verify a sending domain in Resend; store `email_from` in Vault.
6. Razorpay: account under verification (4 Oct 2026); owner adds it once approved. Then Payment Pages for Pro/Max →
   `RAZORPAY_CHECKOUT_URL_PRO/MAX`; deploy `razorpay-webhook` with its secret. Not a blocker for other work.
7. Code-signing certificate for releases; Sentry DSN if crash reports are wanted.
8. Lawyer review of the legal text; real `support@` and `grievance@` mailboxes; registered business name.
9. (Done 4 Oct 2026) `require_login_ticket` is on.
10. Review and publish Learn content (all drafts; 69 lessons have no resource yet); run the link checker.
11. Rotate the Resend and Gemini keys (they were shared in a chat) and update Vault.
12. Apply migrations 025 and 026 (`packages/supabase/baseline/apply_025.sql`, `apply_026.sql`); 024 is done.
13. (Done) `GOOGLE_OAUTH_CLIENT_ID/SECRET` repository secrets.

Done in October 2026: hide job ("Not interested", local migration 5), tracker follow-up reminders (local
migration 6), feed match uses Learn mastery, mid-form cancel in apply (AbortSignal closes the tab), company question
sets gated in main by the server plan, payment history with receipts (025), no Max downgrade on payment (024),
India region filter + laptop runner for the scraper, CI green. Answers typed during apply review are remembered
locally (by question fingerprint and label, `services/form-answers.ts`, local migration 7 cleared the old store) and
pre-filled on later forms; model-written answers are never stored. "Continue with Google" opens the terms first if
they are not accepted, then continues. v1 portable build (4 Oct): the app relaunches itself
without the Chromium sandbox when the GPU/renderer process cannot start (STATUS_DLL_NOT_FOUND; `NOMADIC_DISABLE_SANDBOX`
forces it); a saved sign-in is handed back to the main process at launch (`features/auth/useSessionRestore.ts`) and the
user is signed out with a notice only when the server ends the session (heartbeat `ended`), never on a network error;
apply's AI form answers go through `ai-proxy`; the feed treats the column default `'unknown'` as unknown and sorts by
`posted_at`. Hidden jobs and follow-up dates sync to the account (026: `user_hidden_jobs`,
`user_applications.follow_up_at`, RPCs `sync_hide_job`/`sync_unhide_job`/`sync_pull_hidden_jobs`/
`sync_set_application_follow_up`); on pull, hidden jobs are a union and local-only ones are uploaded; for follow-ups
the newer row wins, a cloud date is never dropped by a local row without one.

Code follow-ups: resume parsing/versions; multi-step form edits in apply; GST tax invoices (need a GSTIN; today receipts only); skill tagging in the
scraper pipeline (the app tags at runtime, so optional); event sync beyond learning; F13 decisions (Outreach and the
Assistant still call AI directly); OS notification for due follow-ups (today an in-app list).

## 8. Conventions

- Feature folders: pure logic (`*Logic.ts` / `*Form.ts`) + data hook (`use*.ts`, stale-response safe, error state,
  optimistic updates with rollback) + small components. Tests in `apps/desktop/src/renderer/__tests__` and
  `apps/desktop/src/main/__tests__` (component tests: `// @vitest-environment jsdom`, explicit `afterEach(cleanup)`,
  stub `window.api`).
- Every screen needs loading, empty and error-with-recovery states, keyboard-only use, and works at 1024 px.
- Every IPC input is validated with zod in `apps/desktop/src/main/ipc/schemas.ts`; adding a channel means updating
  `shared/ipc.ts` (`IPC_CHANNELS`, `Channel` map, `NomadicApi`), `preload.ts`, `renderer/types.ts` and the channel
  count in `main/__tests__/ipc-handle.test.ts`.
- Local SQLite schema changes are new entries in `LOCAL_MIGRATIONS` (`apps/desktop/src/main/db.ts`); never edit a
  shipped one. Supabase changes are new numbered files in `packages/supabase/migrations`.
- Before pushing: `npx tsc --noEmit -p apps/desktop`, `npm test`, `cd apps/desktop && npx vite build && node
  build-main.mjs`.
- Do not put secrets in code, commits or docs. Do not add model identifiers to commits or code.

## 9. Handoff state (4 October 2026)

- Branch `main` (remote github.com/snipy09/nomadic) holds everything; there are no open feature branches to merge.
  Last commit of the session: "fix(desktop): remember answers typed during apply review; Google button opens terms".
- Untracked on purpose, never stage: `brag-output*/`, `reel*/`, `showreel/` (local marketing renders) and `.claude/`
  (local assistant settings and `launch.json`; its notes are folded into section 10).
- Delivered build: `Nomadic-v1.0.8-portable.exe` in `C:\Users\sajal\Downloads` and `Desktop\Nomadic-v1\`
  (built from `apps/desktop/dist-electron/Nomadic.1.0.8.exe`; adds hidden-job and follow-up account sync). Bump `apps/desktop/package.json` `version` for the next one.
  App icon (`apps/desktop/assets/icon.ico`, `logo-icon.png`, `logo.png`) is the site mark from `apps/web/public/logo-icon.svg`.
- Google sign-in: client id/secret are baked into the build from `apps/desktop/.env`; the app opens Google with PKCE
  and a loopback listener on `http://127.0.0.1:42813/callback`; Google accepts the client. If users see "Access
  blocked", the OAuth consent screen is still in Testing (owner action 4). Errors from the callback are shown on the
  sign-in screen as "Google sign-in did not finish: …".
- Apply review: answers the user types are remembered in local SQLite `cached_form_answers` (fingerprint `q_<16 hex>`
  and label keys; `services/form-answers.ts`; matched in `packages/form-engine/src/answerer.ts` `lookupUserAnswer`).
  Messages such as "* Please try again." in the review list come from the portal's own page, not from Nomadic.
- Next most useful work: owner actions in section 7 (consent screen, migrations 024/025, Resend domain, key rotation),
  then a live end-to-end pass (Google sign-in, reviewed submit, AI feedback), then the code follow-ups in section 7.

## 10. Build, package, test and deploy

- Desktop dev: `npm run dev:desktop`. Package Windows: `cd apps/desktop; npm run package:win` (about 10 minutes;
  outputs `dist-electron/Nomadic.<ver>.exe` portable, `Nomadic.Setup.<ver>.exe`, and `win-unpacked/NomadicOS.exe`).
  Kill running `NomadicOS` processes first or the files stay locked.
- Smoke test the packaged app without a person: start `win-unpacked/NomadicOS.exe --remote-debugging-port=9333` with
  env `NOMADIC_DISABLE_SANDBOX=true`, then `chromium.connectOverCDP('http://127.0.0.1:9333')` from the repo's
  `playwright-core`, find the page whose URL contains `index.html`, read `document.body.innerText`, subscribe to
  `window.api.onLog` for main-process logs. It uses the owner's real local profile and session: read only, do not sign
  in, sign up or submit applications from scripts.
- Marketing site `apps/web` (Vite 5, React 18, Tailwind 3.4): dev `npm run dev --workspace apps/web -- --port 5174`;
  check `npx tsc --noEmit` and `npm run build` in `apps/web` (client build + SSR build + `scripts/prerender.mjs`, which
  writes `dist/{index,download,terms,privacy,404}.html` and `sitemap.xml`; never add a `public/sitemap.xml`).
  Copy and sample data live in `src/content.ts` (fictional companies only); titles/indexing in `src/seo.ts` (must not
  import `src/jsonld.ts`). A new page needs a `PAGES` entry, a route in `src/App.tsx`, and prerender coverage.
  Design: Archivo variable font, ultramarine `#2338E0`, ink `#0A0F2C`, fog, marigold; no pills, no blur, 4px radius.
  Downloads are NOT public: every download CTA is `ComingSoon`; do not reintroduce a registration or alpha flow.
  Launch email list: `components/EmailSignup.tsx` → RPC `join_waitlist` (`src/waitlist.ts`, migration 023); read
  signups with SQL in the Supabase dashboard. `src/supabase.ts` is unused and points at an old project.
  Motion: `Reveal`/`CountUp`/`anim-*`, gated by `html.js`, off under `prefers-reduced-motion`; the preloader is inline
  in `index.html` (once per session). Logo: `components/Logo.tsx`, SVG sources in `public/logo*.svg`.
- Web deploy (Vercel project `nomadic-app`, live at https://nomadicai.vercel.app): no auto-deploy. Push to `main`, then
  create a deployment from git source (github snipy09/nomadic ref main, framework vite, rootDirectory `apps/web`,
  buildCommand `npm run build`, outputDirectory `dist`, `forceNew: "1"`, no `teamId`) via the Vercel MCP
  `create_deployment`, or POST the same body to `https://api.vercel.com/v13/deployments?forceNew=1` with the Vercel
  CLI token (never print it). Poll until READY (~1 min). Smoke test: `/`, `/download`, `/terms`, `/privacy` → 200,
  unknown path → 404, `/sitemap.xml` and `/robots.txt` served.
- Leftovers cleaned 4 Oct 2026 (old installer, `install.ps1`, old `logo.png` removed). The 92 MB installer is still
  in git history (`docs/SECURITY_CLEANUP.md` has the rewrite steps). Flag new leftovers; do not delete unasked.

## 11. Working with the owner

- Instructions are short and informal ("fix it", "finish everything"). Finish end to end: code, tests, build,
  package or deploy, verify, push to `main`. Do not stop at a plan or ask onboarding questions; pick sensible defaults.
- Reports are concise: what changed, what was verified, what the owner must do. For routine web deploys, two or three
  lines (live URL, pass/fail).
- Anything made for the owner (builds, images, docs, exports) is also copied to `C:\Users\sajal\OneDrive\Desktop` in
  a named subfolder (e.g. `Desktop\Nomadic-v1`, `Desktop\Nomadic-Logo`); builds also go to `Downloads`.
- Do not delete or publish things unasked; flag them. Do not sign in, sign up or submit forms against the live
  backend; the owner tests accounts. Do not print secrets from `.env`, Vault or tokens.
- Windows + PowerShell 5.1: no `&&`; write commit messages to a file with
  `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))` and `git commit -F path`
  (`Set-Content -Encoding utf8` adds a BOM). `git push` prints to stderr even on success.
