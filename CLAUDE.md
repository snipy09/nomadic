# Nomadic: complete project context

Read this first. It is the single source of context for anyone (person or AI assistant) working on this repo.
Last full update: 5 October 2026 (v1.2.0: Learn path + Projects page; v1.1.0: Outreach + Learn v2; live
database brought up to date: owner admin, 864 quiz items). Keep it current when something important changes.
New session or new assistant account? Read sections 9–11 at the end first (handoff state, how to build and test,
how the owner wants work done).

## 1. What Nomadic is

A **Windows desktop app** (Electron) for **Indian engineering students** looking for placements, internships and
first jobs. One app covers the whole path:

1. **Onboarding** (4–5 short steps) ends with a **personal learning roadmap** (core feature).
2. **Learn (v2)**: a page-by-page intake (one question per page: role, aim, duration, schedule, level, DSA
   language, focus, extras, summary) → a roadmap of modules → day-sized topics → tasks, picked by AI from the
   reviewed catalogue (rules planner as fallback) and fitted into dated days by a deterministic scheduler (buffer,
   revision and OA-mock days, re-plan, pace factor). Shown as a Duolingo-style **path**: a banner per week ("Week 3:
   Arrays & Web foundations") and a node per study day ("Day 2: Prefix sums"), plus Today, a day page, Topic and
   Progress. Every topic has a "What to learn" list (no external resources are shown in Learn), named LeetCode
   problems, quizzes with SM-2 reviews.
   **Projects** (sidebar, under Practice): a library of ~4,100 fully guided projects (12 curated + 4,085 generated
   idea × stack × level: 80 app ideas on 5 frontend, 6 backend, 5 full-stack, 3 mobile, 3 CLI and 3 DevOps stacks;
   40 datasets on 3 data and 2 ML stacks), each with stages, steps with starter code, hints, acceptance checks, an
   optional GitHub repo check, a finish kit and "Stuck? Ask Nomadic AI" help per stage (ai-proxy `project_help`;
   when the daily limit is hit the question waits and is asked again automatically after the midnight IST reset).
3. **Practice**: ~1,800 LeetCode-company problems (external links), role questions, timed mock mode, weak topics,
   AI rubric feedback on written answers (Pro/Max).
4. **Job board**: jobs collected by the scraper pipeline, skill-based match % and top missing skills, save, filters.
5. **Apply with review**: fills the real form in the user's own Chrome/Edge/Brave (a separate persistent Nomadic
   profile; see section 9), shows every field with its source and
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
                     Tabs, Select, Combobox, Toast, Skeleton, EmptyState, ProgressRing, PageHeader, FilterBar, etc.
                     Apple design language since 1.4.0 (system neutrals #F5F5F7/#1D1D1F, SF Pro on macOS and bundled
                     Inter elsewhere, radii 6/8/12/16 via the preset's rounded-*, soft shadows, grey-filled secondary
                     buttons, capsule badges/filters, green switches, page titles `text-headline font-bold`). Use token
                     classes (bg-surface, text-fg, text-fg-muted, border-line, text-body, text-caption, font-strong,
                     bg-fg/[0.06] for Apple grey fills); never hardcoded slate/zinc colours or `dark:` variants.
packages/config      plans.ts (prices/limits), features.ts (flags), legal.ts (terms/privacy/refunds), tiers.ts
packages/learning    @job-automator/learning: types (zod), graph, sm2, readiness/jobMatch, tagSkills,
                     practiceAttempts/weakTopics, v1 planner (unused by the app now), and src/v2 (Learn v2 engine:
                     catalog, problems, expand, scheduler, roadmap, intake, projects, progressV2, path (weeks/days),
                     gen (generated project library: ideas.ts, dataIdeas.ts, kinds/frontend|backend|data.ts; ids
                     g.<idea>.<stack>.<b|i|a>, never rename keys)). seed/bundle.json (SEED_VERSION 2026.10.3): 109
                     skills, 55 resources, 109 lessons, 864 practice items, 54 modules, 420 topics (each with
                     learn_items), 337 problems, 12 projects; all AI-drafted, status draft. Content sources in
                     scripts/seed-source/v2 (dev syllabus per skill in v2/dev/*.ts); scripts build-problems,
                     check-paid-only, check-links --write-seed, check-content (validate without writing)
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
- **Matching**: `features/feed/match.ts` tags job text and profile skills against the same skill catalogue as Learn;
  mastery is the higher of v1 mastery and Learn v2 progress (`masteryFromProgress`).
- **Learn v2**: renderer intake → `learnRoadmapGenerate` (main `services/learn-v2.ts`: compact catalogue → ai-proxy
  `roadmap_plan` → `normaliseAiRoadmap`, else `planRoadmapRules`; `fitRoadmap` → draft in local `learn_state`) →
  Review → `learnRoadmapAccept`. Day actions (re-plan, skip today, do more, move, pace) run the engine in the
  renderer and save via `learnScheduleSave`. Roadmap, schedule, projects and notes sync through migration 027.
- **AI**: desktop main `services/ai-proxy.ts` → `{SUPABASE_URL}/functions/v1/ai-proxy` (anon key as bearer + device
  session in body) → `consume_ai_quota` → Gemini (`gemini-2.5-flash`, JSON schema) → output checks → refund on failure.

## 4. Live infrastructure

- **Supabase project `nomadic`**: ref `grqkiddfwoyicktpgdea`, region ap-south-1 (Mumbai), free plan, org "Nomadic".
  URL `https://grqkiddfwoyicktpgdea.supabase.co`. The anon key is public by design and is the build default in
  `apps/desktop/build-main.mjs`, scrapers and web. The service-role key is never in the app or repo.
- **Applied migrations**: 001–012, 014–030 (028 Learn v2 state and 029 AI roadmap quotas pasted by the owner on
  5 Oct 2026, verified; Learn v2 content seed pasted too: 109 skills, 109 lessons, 55 resources; the 624 v1.2.0 quiz items were added
  through the connector on 5 Oct 2026, so 864 practice items are live and match the seed by content hash) (013 does not exist; 023 is the web waitlist; 024 no Max downgrade on
  payment, 025 payment history, 026 account sync of hidden jobs and follow-up dates, 027 outreach directory and
  outreach AI quota, all applied by 5 Oct 2026). The legacy `public.hr_contacts` (empty) still exists live and is
  dropped by an owner paste (`DROP TABLE IF EXISTS public.hr_contacts;`; the connector times out on DROP).
  028 = Learn v2 state documents + v2 event types; 029 = AI roadmap quotas (`ai_limits` with roadmap columns,
  outreach metrics of 027 kept); 030 = AI project help quota (metric `ai_project_help`, `ai_project_help_limits`
  5/40/150, applied through the Supabase connector on 5 Oct 2026 and verified). Next free number is 031. Security advisor: no errors; remaining notices are by design (deny-all tables;
  session-checked SECURITY DEFINER RPCs callable by anon).
- **Learn content seeded** from the bundle (checksums verified; quiz items re-checked 5 Oct 2026).
- **Accounts**: the owner account (`sajalmishra0908@gmail.com`) has role `admin` (granted 5 Oct 2026 by SQL, with an
  `admin_audit_log` row). Further role changes go through the Admin screen.
- **Jobs**: 328 active jobs from the 4 Oct 2026 run. The `scrape.yml` workflow still needs the repository secrets
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the owner sets them in GitHub; assistant sessions cannot read the
  service-role key or write repository secrets).
- **Edge Functions deployed** (JWT verification on): `google-sign-in`, `send-email-code`, `ai-proxy` (kinds
  `rubric_feedback`, `form_answers`, `outreach_email`, `roadmap_plan`, `roadmap_adjust`, `project_help`; version 4
  deployed 5 Oct 2026 from the repo files, byte-checked against them; `project_help` needs 030).
  `razorpay-webhook` exists in the repo but is not deployed yet.
- **Vault secrets**: `resend_api_key`, `gemini_api_key`, `google_oauth_client_id` (set). Missing: `email_from`.
- **Google OAuth**: "Desktop app" client created; id/secret are in GitHub repo secrets and in the gitignored
  `apps/desktop/.env` (read by `build-main.mjs` and `vite.config.ts`; real env vars win). `require_login_ticket` is on.
  Read only by service_role via `public.server_secret(name)` (allow-listed names) / `private.get_vault_secret`.
- A leftover schema `zz_unused` holds 8 empty tables from the first setup attempt; safe to drop with an owner paste
  (`DROP SCHEMA IF EXISTS zz_unused CASCADE;`), tried through the connector on 5 Oct 2026 and it timed out.
- **Remote branches**: many old feature branches remain on GitHub; assistant sessions are not allowed to delete them.
  The owner deletes the merged ones in the GitHub UI (keep `main` and `gh-pages`).
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
- Learn v2 client RPCs (028): `learning_save_state`, `learning_pull_state` (session-checked, 512 KB per document).
- Roles/tiers come only from the server (email-based admin grants were removed). Admin actions are server-checked
  RPCs with an append-only audit log.
- Passwords: bcrypt of a client pre-hash; login rate limits; generic credential errors; one active device.
- API keys / SMTP passwords stay on the computer (OS keychain) and are never uploaded; no model keys in builds.

## 6. Status by feature (details: `docs/FEATURES.md`)

Built and merged: F1 shell, F2 accounts + onboarding + password reset/verification + Google sign-in (server side),
F3 feed + matching, F4 apply with review, F5 tracker, F6 profile, F7 Learn v2 (roadmap, day plan, projects), F8 Practice, F9 entitlements
and quotas, F10 data safety, F11 updates/telemetry/help, F12 admin, F14 landing (Lighthouse mobile 97/100/100/100).
F13: Outreach was rebuilt in v1.1.0 (see section 9) and shows in the sidebar as "Soon" with an information screen;
the working module needs `VITE_FEATURES="outreach=on"`. Opportunity Board, Resource Vault and the Assistant stay
hidden; the Assistant still needs rework or removal.

Tests: 1,742 vitest tests pass (131 files, 5 Oct 2026, v1.2.0 branch; run with `--maxWorkers=2 --testTimeout=30000` on this laptop, the default
parallelism times out component tests, and the three Chrome DOM suites can time out closing Chrome in `afterAll`);
typecheck, lint (0 errors, ~190 warnings) and desktop/web builds pass.
The built Electron app has been smoke-tested over CDP (window, live feed via IPC, Learn, Settings, Help, Activity, Admin
screens). The owner has signed in on the packaged v1.0.6 app and run apply up to the review screen on a real Lever form
(4 Oct 2026). **Not yet verified live: Google sign-in end to end, an actual reviewed submission, AI feedback.**

## 7. What is left

Owner actions:
0. **Learn v2 go-live** (merged into `main` with 1.1.0): 028, 029, the content seed and the ai-proxy redeploy are
   done (5 Oct 2026). v1.2.0's 624 quiz items are live (5 Oct 2026: 864 practice items, content hash checked against the
   seed). Left: on the laptop run `npm run check-paid-only -w
   @job-automator/learning`, `npm run build-problems`, `npm run check-links -w @job-automator/learning --
   --write-seed` and `npm run build-seed` (the build container could not reach leetcode.com or the resource sites,
   so paid-only flags are a hand list and the 26 new resources stay hidden until link-checked), then regenerate and re-paste `baseline/content_seed.sql` and package the next version.
1. Keep the live `jobs` table fresh (seeded once on 4 Oct 2026 with 328 active India-open jobs, 137 internships): run
   `Desktop\Nomadic Content\Scraper\Run job scraper.cmd` (contacts: `Run contact scraper.cmd` → `outreach_contacts`; sources
   in `scripts/desktop-scraper/`) (`scripts/scrape-desktop.ps1 -Mode jobs|contacts`: `--max-new 100` new jobs per run,
   duplicates of published jobs skipped, a summary in `reports\` per run; first run asks for the service role key,
   which no `.env` on this laptop had on 4 Oct 2026) or `scripts\scrape-laptop.cmd` (`docs/SCRAPER_LAPTOP.md`) and/or set the GitHub Actions secrets
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The pipeline keeps only jobs open to candidates in India by default
   (`--region all` to keep everything).
2. ~~Create the admin account~~: done 5 Oct 2026 (owner account has role `admin`, audit-logged).
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
12. (Done 4 Oct 2026) Migrations 024, 025 and 026 applied.
13. (Done) `GOOGLE_OAUTH_CLIENT_ID/SECRET` repository secrets.
14. Paste in the SQL editor: `DROP SCHEMA IF EXISTS zz_unused CASCADE; DROP TABLE IF EXISTS public.hr_contacts;`.
15. Delete merged remote branches in the GitHub UI (keep `main` and `gh-pages`).

Done in October 2026: hide job ("Not interested", local migration 5), tracker follow-up reminders (local
migration 6), feed match uses Learn mastery, mid-form cancel in apply (AbortSignal closes the tab), company question
sets gated in main by the server plan, payment history with receipts (025), no Max downgrade on payment (024),
India region filter + laptop runner for the scraper, CI green. The Ashby source skips boards whose
hosted pages are off (e.g. Cursor: the posting API still returns jobs.ashbyhq.com links that render "Page not found"
with HTTP 200), detected by Ashby's `ApiOrganizationFromHostedJobsPageName` query returning `organization: null`. Answers typed during apply review are remembered
locally (by question fingerprint and label, `services/form-answers.ts`, local migration 7 cleared the old store) and
pre-filled on later forms; model-written answers are never stored. They are listed, edited and forgotten on the
Answers page (v1.0.12), which also holds the common application answers drafted during onboarding. "Continue with Google" opens the terms first if
they are not accepted, then continues. Sandbox fallback (`main/sandbox-fallback.ts`, v1.0.9): when any sandboxed
child (GPU, utility or renderer; `child-process-gone` and `render-process-gone`) exits with STATUS_DLL_NOT_FOUND, the
app writes `%APPDATA%\Nomadic\sandbox-fallback.json` for this app version and restarts without the sandbox; later
launches of that version skip the sandbox at once, and a new version tries it again. The portable build restarts
by starting `PORTABLE_EXECUTABLE_FILE` with TEMP/TMP set to `%TEMP%\NomadicRestart`: its NSIS launcher extracts to
`$TEMP\<fixed name>` and empties that folder before extracting and after exit, so two launchers sharing `%TEMP%`
delete each other's files. `NOMADIC_DISABLE_SANDBOX=true` forces it off. 1.0.7/1.0.8 showed a blank window on such
machines. A saved sign-in is handed back to the main process at launch (`features/auth/useSessionRestore.ts`) and the
user is signed out with a notice only when the server ends the session (heartbeat `ended`), never on a network error;
apply's AI form answers go through `ai-proxy`; the feed treats the column default `'unknown'` as unknown and sorts by
`posted_at`. Hidden jobs and follow-up dates sync to the account (026: `user_hidden_jobs`,
`user_applications.follow_up_at`, RPCs `sync_hide_job`/`sync_unhide_job`/`sync_pull_hidden_jobs`/
`sync_set_application_follow_up`); on pull, hidden jobs are a union and local-only ones are uploaded; for follow-ups
the newer row wins, a cloud date is never dropped by a local row without one.

Code follow-ups: `packages/automation/src/ai-pilot-engine.ts` is unused (only its test) and holds invented
placeholder defaults: remove it; form-engine DOM tests and `npm run bench:forms` need
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to an installed Chrome on this laptop (else they skip/fail to launch);
resume parsing/versions; multi-step form edits in apply; GST tax invoices (need a GSTIN; today receipts only); skill tagging in the
scraper pipeline (the app tags at runtime, so optional); event sync beyond learning; F13 decisions (Outreach launch
checklist in `docs/OUTREACH_PLAN.md` section 11; the Assistant); OS notification for due follow-ups (today an in-app list).

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

## 9. Handoff state (5 October 2026)

- Branch `main` (remote github.com/snipy09/nomadic) holds everything (Outreach and Learn v2 merged); there are no open feature branches to merge.
  v1.2.0 (Learn path, Projects page with ~4,100 projects, AI project help) was fast-forwarded into `main` on 5 Oct 2026.
- **v1.1.0 Outreach** (`docs/OUTREACH_PLAN.md`): targets everyone who can refer (recruiter/HR, hiring manager,
  founder, employee, alumni, team inbox). Contacts scraper `packages/scrapers/src/contacts/` (public pages only, no
  LinkedIn scraping or guessed emails, MX check; `npm run scrape:contacts -- --publish` with the service key) writes
  `outreach_contacts` (027, service role only), read via `outreach_list_contacts` / `outreach_report_contact`.
  Desktop: local people/messages store `main/services/outreach-store.ts` (review gate: placeholders, LinkedIn 300
  chars, edits reset review, sent is locked), SMTP send via nodemailer (`packages/email-verifier/src/sender.ts`,
  password stored locally via `writeSecret`, never uploaded, 20/day, a minute apart), Gmail/mailto/LinkedIn open, tracker entry on send; AI drafts
  via ai-proxy kind `outreach_email` (deployed) with per-plan limits `aiOutreachDraftsPerDay`. Renderer
  `features/outreach/` (OutreachView, Composer, PersonForm, DirectoryPanel, SmtpPanel, OutreachComingSoon). The old
  HR scraper, `hr_contacts` reads and Chrome outreach were deleted.
- Videos, reel/brag renders and carousels never go in the repo (`.gitignore` blocks `brag-output*/`, `reel*/`,
  `showreel/`, `instagram-carousel/`, `marketing/` and video/audio files); they live in `Desktop\Nomadic Content`.
  `.claude/` is untracked on purpose, never stage it (local assistant settings and `launch.json`; its notes are folded into section 10).
- Delivered build: `Nomadic-v1.2.0-portable.exe` (v1.2.0 as below; before it 1.1.0) in `C:\Users\sajal\Downloads` and `Desktop\Nomadic Content\App builds\`
  (built from `apps/desktop/dist-electron/Nomadic.1.1.0.exe`; 1.1.0: Outreach as above, shown as "Soon"; 1.0.13: a listing that names no skills is scored
  against the core skills (weight ≥ 0.8) of the role family in its title and shown as an estimate (`~N%`, "est.
  match"; `JobMatch.estimated`, `features/feed/match.ts`); `inferRole` matches whole stemmed words; the Internshala
  scraper no longer writes filler descriptions (empty instead); the Internshala adapter waits for the
  `/application/form/` page and apply reads the form once more before "No Application Form Found". 1.0.12 adds the AI onboarding (seven steps: about →
  links → resume → target → answers → workspace → roadmap; resume/LinkedIn PDF text read locally by
  `services/document-text.ts` with unpdf, external in `build-main.mjs`; drafts for common application questions via
  `services/profile-drafts.ts` → ai-proxy `form_answers`, never auto-saved), the **Answers** page (sidebar tab
  `answers`, `renderer/features/answers/`: common questions from `shared/applicationAnswers.ts` stored in
  `customAnswers` under `__app_<id>` keys, the user's own Q&A, and remembered apply answers that can be edited,
  forgotten or cleared), 5 IPC channels (`readDocumentText`, `draftProfileAnswers`, `listRememberedAnswers`,
  `updateRememberedAnswer`, `clearRememberedAnswers`), the Learn activity heatmap, the job board redesign, the logo
  inside the collapsible sidebar, and apply polish; 1.0.11 fixes new Greenhouse boards (phantom
  "Unlabelled field" inputs behind react-select, preferred name, country questions, yes/no questions no longer read as
  profile facts, upload groups named by their group label, uploads that swap the input for the file name), saves
  Location/Country/Preferred name/Portfolio/Years in `custom_answers_json` under reserved `__profile_*` keys
  (`shared/profileExtras.ts`, no schema change), and clears the previous account's local data when a different account
  signs in on the same computer so onboarding shows (`services/local-owner.ts`, local migration 8 `local_meta`);
  1.0.10 opens apply in the user's real browser; 1.0.9
  fixed the blank window of 1.0.7/1.0.8 via the sandbox fallback; 1.0.8 added hidden-job and follow-up account sync).
  Bump `apps/desktop/package.json` `version` for the next one.
- Apply browser (`packages/automation/src/user-browser.ts`, v1.0.10): apply opens the user's installed Chrome (else
  Edge, else Brave; a default of Chrome/Brave wins, Edge as the Windows default does not beat installed Chrome) via
  Playwright `launchPersistentContext` with `executablePath`, the sandbox on and Playwright's test flags removed
  (extensions, sync, Safe Browsing and the password manager work; no automation banner; `navigator.webdriver` false).
  Chrome 136+ refuses automation of the user's main profile, so it uses its own profile `%APPDATA%\Nomadic\browser_session`
  (`browser_session_edge`/`_brave` for others), kept between runs. Settings → Portal sign-ins opens pages in that same
  window (IPC `open-in-apply-browser` → `AutoApplyEngine.openInBrowser`), so sign-ins carry into applications. One
  session per app run; closing the window clears it and the next apply relaunches. Nothing is downloaded (Chrome for
  Testing / Playwright Chromium are no longer used for apply). `components/DependenciesView.tsx` is dead code (unused).
  App icon (`apps/desktop/assets/icon.ico`, `logo-icon.png`, `logo.png`) is the site mark from `apps/web/public/logo-icon.svg`.
- Google sign-in: client id/secret are baked into the build from `apps/desktop/.env`; the app opens Google with PKCE
  and a loopback listener on `http://127.0.0.1:42813/callback`; Google accepts the client. If users see "Access
  blocked", the OAuth consent screen is still in Testing (owner action 4). Errors from the callback are shown on the
  sign-in screen as "Google sign-in did not finish: …".
- Apply review: answers the user types are remembered in local SQLite `cached_form_answers` (fingerprint `q_<16 hex>`
  and label keys; `services/form-answers.ts`; matched in `packages/form-engine/src/answerer.ts` `lookupUserAnswer`).
  Messages such as "* Please try again." in the review list come from the portal's own page, not from Nomadic.
- **Learn v2: built** (4 Oct 2026, branch `claude/learn-v2-handoff-046pu4`, version 1.0.14, not packaged: the
  build ran in a Linux container). Plan `docs/LEARN_V2_PLAN.md`; what was built and what is left:
  `docs/LEARN_V2_HANDOFF.md` ("Status"). Engine `packages/learning/src/v2`; main `services/learn-v2.ts`,
  `services/github-check.ts`, local migration 9 (`learn_state`, widened `learning_events`); renderer
  `features/learn/` (LearnView router, IntakeFields, ReviewScreen + AdjustPanel, Today, Week, Roadmap, Topic,
  Progress, `learnModel.ts`, `quizLogic.ts`, `catalog.ts`) and `features/projects/`. v1 PathScreen, GoalSetup,
  GoalFields, LessonScreen and learnLogic are deleted; the v1 goal RPCs (007/012) are unused but still deployed.
  Go-live steps: owner action 0 in section 7.
- **v1.2.0 Learn path + Projects** (5 Oct 2026, built on `claude/relaxed-bell-eendal` and merged into `main`;
  packaged on the laptop 5 Oct 2026 as `Nomadic-v1.2.0-portable.exe`, smoke-tested over CDP): intake is one question per page (`features/learn/IntakeWizard.tsx`, `intakeSteps.ts`; onboarding's
  roadmap step uses the same pages via `IntakePage`); Learn tabs are Path / Today / Progress (`PathScreen.tsx` from
  engine `buildPath`, `DayScreen.tsx`, `DayTaskList.tsx` with the per-part "What to learn" list via `partSlice`);
  Week and Roadmap-tree screens and `IntakeFields` were deleted; the Topic page shows no resources. Review shows the
  plan week by week. Projects page = sidebar tab `learner-projects` (`features/projects/ProjectsView.tsx`,
  `ProjectLibrary.tsx`, `projectsLogic.ts`); main `services/learn-v2.ts` `projectFor` resolves generated ids for
  saves and repo checks. Generated kinds live in `packages/learning/src/v2/gen/kinds/` (frontend, backend, fullstack,
  mobile, cli, devops, data, ml), listed in `gen/index.ts`; `test/v2-gen.test.ts` builds every project in strict
  mode. AI help per stage: renderer `features/projects/projectHelp.ts` + `ProjectHelpPanel.tsx`, IPC
  `learn-project-help`, main `askProjectHelp` → ai-proxy `project_help`, plan limit `aiProjectHelpPerDay`.
- **v1.2.1 UI declutter** (6 Oct 2026, on `main`, not packaged yet): one sidebar (`components/Sidebar.tsx`: `getNavSections(workspaceMode)`
  = Learn + Jobs groups, `getFooterItems(isAdmin)` = Settings, Help, Admin; plan + Upgrade link in the footer), no Learn/Seek
  switch and no Upgrade button in the top bar (search field on the left, account menu with "Activity log" on the right);
  `PageHeader` and `FilterBar` in `@nomadic/ui` (`components/PageHeader.tsx`) are the page title and the one-row filter bar
  (selects keep their content width): use them on new screens. Job board: no stat cards, tabs All/Jobs/Internships/Best
  matches/Saved/Hidden, simpler cards (source moved to the drawer). Projects: no hero banner, empty type chips hidden.
  Practice: weak-topics column only when there are weak topics. Learn path: today card first, one combined progress card.
- **v1.3.0 Home + modern shell** (6 Oct 2026, on `main`, not packaged yet): **Home** (`features/home/`: `HomeView`,
  `homeLogic.ts` setup checklist by workspace mode, `useLearnSummary.ts` read-only Learn summary) is the landing page after
  sign-in/onboarding and the fallback route; "Get set up" checklist (profile, roadmap, resume, common answers, first
  application; hide stored by `prefs.setHomeChecklistHidden`), today's learning, applications + due follow-ups, best
  matches. No top bar any more (`components/TopBar.tsx` deleted): the sidebar holds logo + collapse, search (Ctrl+K), Home,
  the groups, Settings/Help/Admin and the account menu at the bottom (`UserMenu variant="sidebar"|"compact"`, opens
  upwards, has Activity log and Upgrade plan). Deep links: `handleNavigate(tab, intent)` sets store `tabIntent`
  (`LearnView initialTab`, `ProfileView initialSection`). Keyboard: G then H/L/P/R/J/A/W/S jumps to a page, `[` toggles
  the sidebar (`components/shell/shortcuts.ts`, ignored while typing or with a dialog open); the command palette groups
  results, shows shortcuts and has theme/sidebar/upgrade/sign-out actions. Global focus outline uses the `--nm-focus` token.
- **v1.4.0 Apple design language** (6 Oct 2026, on `main`, not packaged yet): new palette in `packages/ui/src/tokens.ts`
  + `styles.css` (kept in sync by `tokens.test.ts`, contrast AA checked), Apple type ramp (15/22/26/34 px, `font-bold`
  for large titles), preset `borderRadius` 6/8/12/16/20, Inter variable with optical sizes (`@fontsource-variable/inter`,
  imported in `renderer/index.css`, served from the app so CSP `font-src 'self'` covers it), macOS source-list sidebar
  (accent glyphs, grey selection, no indicator bar), Apple segmented control and capsule filter tabs, floating inset
  drawers, coloured icon tiles in Settings, soft focus halo, theme follows the system by default. The website keeps
  its own Archivo/4px brand styles (it does not use the preset).
- Next most useful work: owner action 0 (Learn v2 go-live), then owner actions in section 7 (consent screen, Resend domain, key rotation),
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
  Copy and sample data live in `src/content.ts` (fictional companies only; India locations; the Learn sample is a
  week-by-week path like the app's); titles/indexing in `src/seo.ts` (must not import `src/jsonld.ts`). Product claims
  must match the app: no unattended/autonomous submission, Windows first then macOS, Outreach not advertised while it
  is "Soon"; `site.test.ts` "product claims match the app" guards this for the site and the plan copy in
  `packages/config/src/plans.ts` (shown on Pricing and in the app's upgrade dialog). A new page needs a `PAGES` entry, a route in `src/App.tsx`, and prerender coverage.
  Design: Archivo variable font, ultramarine `#2338E0`, ink `#0A0F2C`, fog, marigold; no pills, no blur, 4px radius.
  Downloads are NOT public: every download CTA is `ComingSoon`; do not reintroduce a registration or alpha flow.
  Launch email list: `components/EmailSignup.tsx` → RPC `join_waitlist` (`src/waitlist.ts`, migration 023); read
  signups with SQL in the Supabase dashboard. `src/supabase.ts` is unused and points at an old project.
  Motion: `Reveal`/`CountUp`/`anim-*`, gated by `html.js`, off under `prefers-reduced-motion`; the preloader is inline
  in `index.html` (once per session). Logo: `components/Logo.tsx`, SVG sources in `public/logo*.svg`.
- Web deploy (Vercel project `nomadic-app`, live at https://nomadicai.vercel.app): the Vercel Git integration deploys
  every push to `main` that touches the site (`apps/web`, `packages/config`, root `package.json`/lockfile or
  `vercel.json`; other pushes are skipped by `ignoreCommand`). It builds from the repo root using the root
  `vercel.json` (install without scripts, `npm run build --workspace @nomadic/web`, output `apps/web/dist`, same headers
  as `apps/web/vercel.json`); before 6 Oct 2026 there was no root config and every Git deploy failed. Check a push with
  `gh api repos/snipy09/nomadic/commits/<sha>/status` (context `Vercel`). Manual fallback: the Vercel MCP
  `create_deployment` from git source (ref main, rootDirectory `apps/web`, buildCommand `npm run build`, outputDirectory
  `dist`, `forceNew: "1"`, no `teamId`). Assistant cloud containers cannot reach `*.vercel.app` (proxy 403). Smoke test:
  `/`, `/download`, `/terms`, `/privacy` → 200, unknown path → 404, `/sitemap.xml` and `/robots.txt` served.
- Windows build without the laptop: Actions → "Build Windows (unsigned)" (`.github/workflows/build-windows.yml`,
  workflow_dispatch) builds the installer and portable exe on `windows-latest` with the Google OAuth secrets and uploads
  them as an artifact for 14 days (unsigned: SmartScreen warns). Signed releases: `release.yml` (needs the certificate).
- Leftovers cleaned 4 Oct 2026 (old installer, `install.ps1`, old `logo.png` removed). The 92 MB installer is still
  in git history (`docs/SECURITY_CLEANUP.md` has the rewrite steps). Flag new leftovers; do not delete unasked.

## 11. Working with the owner

- Instructions are short and informal ("fix it", "finish everything"). Finish end to end: code, tests, build,
  package or deploy, verify, push to `main`. Do not stop at a plan or ask onboarding questions; pick sensible defaults.
- Reports are concise: what changed, what was verified, what the owner must do. For routine web deploys, two or three
  lines (live URL, pass/fail).
- The Desktop holds only two folders: `Nomadic` (this repo) and `Nomadic Content`. Anything made for the owner (builds,
  images, videos, docs, SQL, exports) goes in a subfolder of `Desktop\Nomadic Content` (`App builds`, `Logo`, `Videos`,
  `SQL`, `Handoff and plans`, `Scraper`, `Carousel and marketing`), never loose on the Desktop. Builds also go to `Downloads`.
- Do not delete or publish things unasked; flag them. Do not sign in, sign up or submit forms against the live
  backend; the owner tests accounts. Do not print secrets from `.env`, Vault or tokens.
- Windows + PowerShell 5.1: no `&&`; write commit messages to a file with
  `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))` and `git commit -F path`
  (`Set-Content -Encoding utf8` adds a BOM). `git push` prints to stderr even on success.
