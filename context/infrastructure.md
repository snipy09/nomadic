# Live infrastructure

Last updated: 27 October 2026. Supabase project, migrations applied, Edge Functions, secrets, accounts and how SQL reaches production.

- **Supabase project `nomadic`**: ref `grqkiddfwoyicktpgdea`, region ap-south-1 (Mumbai), free plan, org "Nomadic".
  URL `https://grqkiddfwoyicktpgdea.supabase.co`. The anon key is public by design and is the build default in
  `packages/app-core/tooling/electron-main.mjs`, scrapers and web. The service-role key is never in the app or repo.
- **Applied migrations**: 001–012, 014–032 (028 Learn v2 state and 029 AI roadmap quotas pasted by the owner on
  5 Oct 2026, verified; Learn v2 content seed pasted too: 109 skills, 109 lessons, 55 resources; the 624 v1.2.0 quiz items were added
  through the connector on 5 Oct 2026, so 864 practice items are live and match the seed by content hash) (013 does not exist; 023 is the web waitlist; 024 no Max downgrade on
  payment, 025 payment history, 026 account sync of hidden jobs and follow-up dates, 027 outreach directory and
  outreach AI quota, all applied by 5 Oct 2026). The legacy `public.hr_contacts` (empty) still exists live and is
  dropped by an owner paste (`DROP TABLE IF EXISTS public.hr_contacts;`; the connector times out on DROP).
  028 = Learn v2 state documents + v2 event types; 029 = AI roadmap quotas (`ai_limits` with roadmap columns,
  outreach metrics of 027 kept); 030 = AI project help quota (metric `ai_project_help`, `ai_project_help_limits`
  5/40/150, applied through the Supabase connector on 5 Oct 2026 and verified). 031 (feed sources: `companies`, `company_openings`, `company_hiring_snapshots`, `hackathons`, read-only for clients) and 032 (one computer + one phone per account: device classes by fingerprint prefix `mobile-`) were applied through the Supabase connector on 7 Oct 2026 and verified (device_class, per-class register/heartbeat, 4 read-only feed tables with RLS; 031 applied without its no-op `DROP POLICY IF EXISTS` lines because the tables were new). The connector must be signed in to the Supabase account that owns the "Nomadic" org (another account sees only old projects). 033 (Desktop scraper folder: `news_items` read-only for clients, hackathons `kind` + sources hack2skill/mlh/codeforces, 30-day job age) is live (7 Oct 2026, through the connector in three parts: 033a recorded; the lifecycle function and the `hackathons_source_check` swap timed out on the client but ran on the server, verified with catalog queries; `baseline/apply_033.sql` stays as the idempotent paste file). 034 (in-app review: `app_reviews`, session-checked `app_review_status` / `app_review_submit`, export adds `app_reviews`) was applied through the connector on 27 Oct 2026 (recorded as `034_app_reviews`) and verified (table, both RPCs, export includes `app_reviews`). 035 (UPI direct payments: `upi_settings`, `upi_orders`, client RPCs `billing_upi_create_order` / `billing_upi_submit_utr` / `billing_upi_list_orders`, admin RPCs `admin_list_upi_orders` / `admin_review_upi_order`; approval runs the 024 payment logic) and 036 (fixes 035's UPI ID check: PostgreSQL allows at most 255 regex repetitions, so 035's `{2,256}` rejected every UPI ID) were applied through the connector on 18 Oct 2026 and verified; the merchant UPI ID is set and `enabled` is on (in `upi_settings` only, never in the repo). `baseline/apply_035.sql` still has the old check; apply 036 after it. 037 (first-month coupons on UPI orders: deny-all `billing_coupons` holding only sha256 hashes of codes, `upi_orders.coupon_hash` / `list_price_inr`, `billing_upi_create_order` gains `p_coupon`, approval of a coupon order grants 30 days of the plan and records the amount paid) was applied through the connector on 18 Oct 2026 in parts (037a recorded; the rest by SQL) and verified. The connector hangs on `DROP FUNCTION`, so on the live database the old 4-argument `billing_upi_create_order` was renamed to `billing_upi_create_order_035_retired` (no grants) instead of dropped; it can be dropped from the SQL editor. One coupon row exists (₹1, Pro and Max, 100 redemptions, no end date); the code is not written anywhere in the repo or docs: the owner has it. **Next free migration number: 038.** Security advisor: no errors; remaining notices are by design (deny-all tables;
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
