# Nomadic: complete project context

Read this first. It is the single source of context for anyone (person or AI assistant) working on this repo.
Last full update: 3 October 2026. Keep it current when something important changes.

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
- **Applied migrations**: 001–012, 014–023 (013 does not exist; 023 is the web waitlist). **Not yet applied: 024**
  (payments never downgrade an active Max; paste `baseline/apply_024.sql`) and **025** (payment history RPC;
  `baseline/apply_025.sql`), both rehearsed on PostgreSQL 16. Security advisor: no errors; remaining notices are by design (deny-all tables;
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

Tests: ~1,080 vitest tests pass; typecheck, lint (0 errors) and desktop/web builds pass. **The app has not yet been run end to end
as a real Electron app, and the Edge Functions have not been called live.**

## 7. What is left

Owner actions:
1. Fill the live `jobs` table (empty, so the feed is empty): run `scripts\scrape-laptop.cmd` on a laptop
   (`docs/SCRAPER_LAPTOP.md`) and/or set the GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
   The pipeline keeps only jobs open to candidates in India by default (`--region all` to keep everything).
2. Create the admin account (SQL in `docs/DATABASE_SETUP.md`).
3. Run the app (`npm run dev:desktop`) and test: sign-up, onboarding → roadmap, lesson, feed, apply with review,
   tracker, password reset, AI feedback.
4. Google OAuth: done (Vault, repo secrets, local `.env`). If the consent screen is in "Testing", add testers or
   publish it, or only listed Google accounts can sign in.
5. Verify a sending domain in Resend; store `email_from` in Vault.
6. Razorpay Payment Pages for Pro/Max → `RAZORPAY_CHECKOUT_URL_PRO/MAX`; deploy `razorpay-webhook` with its secret.
7. Code-signing certificate for releases; Sentry DSN if crash reports are wanted.
8. Lawyer review of the legal text; real `support@` and `grievance@` mailboxes; registered business name.
9. (Done 4 Oct 2026) `require_login_ticket` is on.
10. Review and publish Learn content (all drafts; 69 lessons have no resource yet); run the link checker.
11. Rotate the Resend and Gemini keys (they were shared in a chat) and update Vault.
12. Apply migrations 024 and 025 (paste files in `packages/supabase/baseline/`).
13. (Done) `GOOGLE_OAUTH_CLIENT_ID/SECRET` repository secrets.

Done in October 2026: hide job ("Not interested", local migration 5), tracker follow-up reminders (local
migration 6), feed match uses Learn mastery, mid-form cancel in apply (AbortSignal closes the tab), company question
sets gated in main by the server plan, payment history with receipts (025), no Max downgrade on payment (024),
India region filter + laptop runner for the scraper, CI green.

Code follow-ups: resume parsing/versions; multi-step form edits in apply; sync hidden jobs and follow-up dates to
the account (both local only today); GST tax invoices (need a GSTIN; today receipts only); skill tagging in the
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
