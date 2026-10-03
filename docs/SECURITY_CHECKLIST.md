# Security checklist (Supabase RLS / RPC review)

Scope: migrations `001`–`005` plus the new `006`–`008`, the Razorpay webhook, and how the desktop app
calls them. Every finding below was reproduced on PostgreSQL 16 with Supabase's default grants
(anon/authenticated receive EXECUTE on new `public` functions), then re-tested after the fix.

Legend: ✅ fixed and verified · ⚠️ mitigated, follow-up needed · ☐ open (owner action)

## Critical

| # | Finding | Status | Fix |
|---|---|---|---|
| S1a | `set_user_password` was only revoked `FROM PUBLIC`; anon still had EXECUTE through Supabase default privileges, so **anyone could reset any user's password**. | ✅ | `008` revokes EXECUTE from anon/authenticated on every public function, stops future auto-grants (`ALTER DEFAULT PRIVILEGES`), re-grants an explicit allow-list. |
| S1b | `handle_razorpay_payment_success` same problem: **anyone could upgrade their own plan** without paying. | ✅ | Same allow-list; service role only. |
| S3 | `register_device_session` accepted any `p_user_id` with no proof of login: anyone with a user's UUID could mint a session, kick the real device (`p_force_takeover`) and **read that user's synced profile, resumes and applications** via `sync_pull_user_data`. | ⚠️ | `008`: requires a one-time `login_ticket` (issued by `authenticate_user`, 10 min, single use) **or**, for older desktop builds, a successful login for that user in the last 10 minutes. A session token can't be moved between users. **Desktop (F2):** password sign-in passes the ticket from `authenticate_user` as `p_login_ticket`; a force-takeover retry signs in again for a fresh ticket; sign-up calls `authenticate_user` once after `register_user` (which issues no ticket) and sends that ticket. The parameter is omitted only when the server returns no ticket (database without `008`). Tests: `apps/desktop/src/main/__tests__/auth-login-ticket.test.ts`, `packages/supabase/src/__tests__/index.test.ts`. **Remaining:** owner turns on `require_login_ticket` after this build ships (see Owner actions). Google sign-in never calls `register_device_session` (S9). |
| S5 | Razorpay fulfilment trusted `notes.plan` from checkout: ₹1 with `plan: lifetime` gave a non-expiring plan, `turbo` gave Max; replayed webhooks re-extended plans. | ✅ | `008` derives the plan from the captured amount (₹249 Pro, ₹599 Max, below ₹249 rejected) and fulfils each `payment_id` once; webhook ignores `notes.plan` and compares signatures in constant time. |

## High

| # | Finding | Status | Fix |
|---|---|---|---|
| S2a | `authenticate_user` failed with `column reference "email" is ambiguous` (RETURNS TABLE column vs. table column). | ✅ | Rewritten with `#variable_conflict use_column` and qualified columns. |
| S2b | Passwords stored as unsalted `sha256(email:password)`; the stored value was also accepted as the password (pass-the-hash). | ✅ | bcrypt (`crypt(..., gen_salt('bf', 10))`) of the client pre-hash, upgraded transparently on next login; `set_user_password` writes bcrypt. A leaked table no longer yields working credentials. |
| S2c | No brute-force protection on login. | ✅ | `login_attempts`; 10 failures per email in 15 minutes locks that email for 15 minutes. |
| S6 | `maintain_jobs_lifecycle()` (deletes jobs) was callable with the anon key. | ✅ | `006` revokes it; service role only. |

## Medium / low

| # | Finding | Status | Fix |
|---|---|---|---|
| S2d | Login error messages revealed whether an email has an account. | ✅ | One message: "Incorrect email or password." The desktop's offline-cache fallback now returns the same text, and the sign-in screen collapses any credential error into it. Sign-up still says an email is taken (unavoidable without email verification); `register_user` rate-limits that to 5 attempts per email per 15 minutes. |
| S4 | `hr_contacts` (recruiter names and emails) readable by anyone with the anon key. | ✅ | `008` drops the policy. Outreach is hidden behind a feature flag; re-enabling it needs a session-checked RPC (`apps/desktop/src/main/services/outreach.ts` reads the table with the anon key today). |
| S7 | `match_jobs_for_user(p_user_id)` (SECURITY DEFINER, no `search_path`) callable by anon for any user. | ✅ | Removed from anon by the `008` allow-list (no client calls it). |
| S8 | `jobs` readable by anon. | ✅ by design | Only `is_active = TRUE` rows; writes service-role only (`002`). Expired jobs are hidden via the `006` status trigger. |
| S10 | Admin panel (`apps/desktop/src/main/services/admin.ts`) read and wrote `users_profile`, `billing_records` and local tables with the **service-role key** when present (anon key otherwise); hiding the Admin tab was the only gate, and audit entries were invented in `sessionStorage`. | ✅ | `014`: every admin read/write is a SECURITY DEFINER RPC that checks `session_token + user_id + device_fingerprint + is_active` **and** `users_profile.role = 'admin'` / `status = 'active'` for that user; an admin cannot change their own account; every change writes one row to the append-only `admin_audit_log` (update/delete/truncate blocked by trigger, no client grants) with the reason. Lesson/resource edits snapshot the old row into append-only `content_versions` and require the edited version (optimistic lock); resources can't be created from the app and only link-checked ones can be made `active`. Refused non-admins are logged (`admin.denied`, at most once per 10 min). The desktop no longer has a service-role client. Rehearsed on PostgreSQL 16 as `anon`: non-admin, suspended-admin, wrong-device and ended sessions refused; admin works; each change audited. Tests: `apps/desktop/src/main/__tests__/admin-service.test.ts`. |
| S9 | Google sign-in (`apps/desktop/src/main/services/oauth.ts`) has no server-side session: it never calls `authenticate_user` or `register_device_session`, uses Google's `sub` as the user id (not a `users_profile` UUID), and its direct `users_profile` read/insert with the anon key is denied by RLS since `008`. Result: Google users get a local, free-tier, user-role account whose heartbeat and cloud sync cannot succeed. Nothing is escalated (role/tier are never taken from the client), but the flow cannot obtain a login ticket. | ☐ | Needs a server path: an RPC or Edge Function that verifies the Google ID token (or a Supabase Auth JWT) server-side, finds or creates the `users_profile` row by the verified email, and returns the same row shape as `authenticate_user` including `login_ticket`. The desktop then registers the device exactly like password sign-in. Also move the Google code exchange to PKCE so no client secret ships in the build. |

## Verified as correct (no change)

- RLS is enabled on every table. `admin_audit_log`, `content_versions` (014), `users_profile`, `user_sessions`, `user_preferences`, `user_job_matches`, `billing_records`, `razorpay_payments`, `user_cloud_profiles`, `user_applications`, `user_saved_jobs`, `user_resumes`, `scrape_runs`, `learning_events`, `user_tracks`, `practice_solutions`, `login_attempts`, `login_tickets`, `app_security` have **no** anon/authenticated policy: they are reachable only through session-checked SECURITY DEFINER RPCs or the service role.
- All `sync_*` RPCs check `session_token + user_id + device_fingerprint + is_active` before touching data.
- `learning_*` RPCs (`007`) check the device session and enforce the free tier server-side (1 active track, 10 practice attempts/day); `learning_events` is append-only (update trigger).
- `get_entitlements` / `consume_apply_quota` (`011`) check the device session; plan limits come from `plan_limits()` (rows rendered from `packages/config`, parity-tested). Daily applies are counted in `usage_counters` (RLS on, no anon/authenticated access) under a per-user advisory lock, all or nothing. There is no refund RPC, so a client cannot reset its own count. The desktop calls `consume_apply_quota` before every submission and refuses to submit when it is refused or unreachable. Helpers (`plan_limits`, `billing_effective_plan`, `billing_session_ok`, `billing_today`) are not callable by anon.
- Learn content tables expose only published lessons/practice and `active` (link-checked) resources.
- AI proxy (`020` + Edge Function `ai-proxy`, DECISIONS #12/#20/#23): the operator's model key lives only in Vault
  (`gemini_api_key`), read by the function through `server_secret` (018, service_role only); the desktop ships no model
  key and reads none from the user (the `test-groq-key` channel is gone and the renderer CSP no longer allows model
  hosts). `consume_ai_quota`, `refund_ai_quota` and `ai_limits` are **service_role only** (revoked from PUBLIC, anon,
  authenticated; rehearsed: anon and authenticated get `permission denied`). The function is deployed with
  `verify_jwt = true` (the app's public anon key is the bearer) and passes the user's `user_id + session_token +
  device_fingerprint` to `consume_ai_quota`, which checks the active device session, suspended accounts, the plan
  (`aiFeedback` flag, `ai_limits` rows rendered from `packages/config`, parity-tested) and the daily count under a
  per-user advisory lock before counting one call; refusals count nothing. The function refunds a call only after it
  counted one and the model gave no usable answer. Prompts are built on the server from structured fields (no client
  prompt passthrough, user text sent as JSON data with an instruction to ignore embedded instructions), replies are
  forced to a JSON schema and checked: rubric quotes must be verbatim substrings of the answer, form answers are kept
  only for the question ids asked and clipped to their length. Body capped at 64 KB, answer 8000 chars, 30 questions;
  25 s timeout per model attempt, one retry. Logs carry kind, outcome codes, timings and the model name only, never
  prompts, answers, profile facts, session tokens or the key (tested). Tests: `packages/supabase/src/__tests__/ai-proxy.test.ts`,
  `ai-limits-parity.test.ts`, `apps/desktop/src/main/__tests__/ai-proxy.test.ts`.
- SECURITY DEFINER functions added in `002`–`008` pin `search_path`.
- The Razorpay webhook verifies the HMAC signature and refuses to run without `RAZORPAY_WEBHOOK_SECRET`.

## Anon-callable allow-list after `008`

`authenticate_user`, `register_device_session`, `verify_and_update_session`, `sync_pull_user_data`,
`sync_push_user_profile`, `sync_push_application`, `sync_push_saved_job`, `sync_remove_saved_job`,
`sync_push_resume`, `sync_delete_resume`, `sync_delete_application` (010), `learning_start_track`, `learning_archive_track`,
`learning_record_events`, `learning_pull_events`, `learning_get_tracks` (012), `get_entitlements` (011), `consume_apply_quota` (011), `register_user` (009), and the admin RPCs (014; each re-checks the
session and the admin role): `admin_list_users`, `admin_set_user_plan`, `admin_set_user_status`, `admin_list_audit`,
`admin_scrape_health`, `admin_list_content`, `admin_update_lesson`, `admin_set_resource_status`,
`admin_content_history`. Any new client RPC must be added to this list in a migration; everything else is denied by
default. (`login_prehash` is also executable by anon; it is a pure hashing helper with no data access.)

## Service-role-only functions (not client RPCs)

`server_secret` (018), `consume_ai_quota`, `refund_ai_quota`, `ai_limits` (020): callable only with the service-role
key, i.e. from Edge Functions. None of them may ever be granted to anon/authenticated.

## Owner actions

- ☐ Apply `006`, `007`, `008` to the production project, in order. `008` changes `authenticate_user`'s
  result (adds `login_ticket`); the desktop reads columns by name, so existing builds keep working.
- ✅ Desktop main process sends `p_login_ticket` to `register_device_session` (password sign-in and sign-up).
- ☐ Ship that build, wait until no older desktop builds are in use, then run
  `update app_security set require_login_ticket = true;` (closes the 10-minute compatibility window in S3).
  Do this only after `006`-`009` are applied. With it on, Google sign-in is unaffected (it never registers a
  device, see S9); password sign-in and sign-up keep working because both now send a ticket.
- ☐ S9: build the server-side Google sign-in path (verifies the token, issues a login ticket) before Google sign-in is
  promoted as a primary option.
- ☐ Apply `014` (admin tools) to production. Until it is applied the desktop Admin screen shows "the server does not
  have the admin functions yet"; nothing falls back to the service-role key. Admins are whoever has
  `users_profile.role = 'admin'` (set in SQL by the operator).
- ☐ Apply `020` and deploy `ai-proxy` (DATABASE_SETUP §7) before shipping the build that calls it; until then AI
  feedback and AI form answers report "not available" and the form engine leaves open-ended questions to the user.
- ☐ Rotate the service-role key if it was ever on a customer machine, and the code-signing cert per
  `docs/SECURITY_CLEANUP.md`.
- ☐ Electron hardening and secrets-in-keychain were done in the main-process work stream (Step 3.2);
  re-check them with this list before the first public release.
