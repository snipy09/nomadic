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
| S11 | Password reset and email verification (`019`, Edge Function `send-email-code`, DECISIONS #22). | ✅ (deploy pending) | Codes are 6 digits, stored only as a salted sha256 (`email_codes`, RLS on, no client grants), valid 15 minutes, single use, locked after 5 wrong guesses, and a new code retires the previous one. `request_email_code` (creates the code and returns it once) is **service_role only**; the Edge Function calls it and emails the code with Resend (key from Vault via `server_secret`, never logged, codes never logged). **No enumeration (S2d):** for a reset, unknown emails, rate-limited emails, send failures and real accounts all get the same `200 {"ok":true}`; the email is sent after the response (`EdgeRuntime.waitUntil`) so timing does not depend on Resend; requests for unknown emails are recorded so the limit (3 codes per email per hour, all purposes; 200 sent codes per hour overall) behaves identically. `confirm_password_reset` (anon) returns one generic message for wrong, expired, used or locked codes and unknown emails; on success it stores bcrypt(`login_prehash`) like `set_user_password`, ends **every device session**, burns outstanding login tickets and other codes, clears failed sign-ins for that email and marks the email verified. The desktop also replaces the old password in its offline cache. Verification (`confirm_email_verification`, `email_verification_status`) is session-checked like `sync_*`; the code always goes to the account's own address (the request cannot choose it). **Unverified accounts keep full access** (sign-in is never blocked); the app offers verification right after sign-up and shows a reminder in Settings > Account. Rehearsed on PostgreSQL 16 as `anon` (`packages/supabase/scripts/rehearse-019.sql`); tests: `packages/supabase/src/__tests__/send-email-code.test.ts`, `apps/desktop/src/main/__tests__/email-codes.test.ts`, `apps/desktop/src/renderer/__tests__/authRecovery.test.tsx`. Remaining: S3's 10-minute compatibility window (a device can register for a user who signed in within 10 minutes, without a ticket) also applies after a reset until `require_login_ticket` is on. |
| S9 | Google sign-in (`apps/desktop/src/main/services/oauth.ts`) has no server-side session: it never calls `authenticate_user` or `register_device_session`, uses Google's `sub` as the user id (not a `users_profile` UUID), and its direct `users_profile` read/insert with the anon key is denied by RLS since `008`. Result: Google users get a local, free-tier, user-role account whose heartbeat and cloud sync cannot succeed. Nothing is escalated (role/tier are never taken from the client), but the flow cannot obtain a login ticket. | ☐ | Needs a server path: an RPC or Edge Function that verifies the Google ID token (or a Supabase Auth JWT) server-side, finds or creates the `users_profile` row by the verified email, and returns the same row shape as `authenticate_user` including `login_ticket`. The desktop then registers the device exactly like password sign-in. Also move the Google code exchange to PKCE so no client secret ships in the build. |

## Verified as correct (no change)

- RLS is enabled on every table. `email_codes`, `email_code_requests` (019), `admin_audit_log`, `content_versions` (014), `users_profile`, `user_sessions`, `user_preferences`, `user_job_matches`, `billing_records`, `razorpay_payments`, `user_cloud_profiles`, `user_applications`, `user_saved_jobs`, `user_resumes`, `scrape_runs`, `learning_events`, `user_tracks`, `practice_solutions`, `login_attempts`, `login_tickets`, `app_security` have **no** anon/authenticated policy: they are reachable only through session-checked SECURITY DEFINER RPCs or the service role.
- All `sync_*` RPCs check `session_token + user_id + device_fingerprint + is_active` before touching data.
- `learning_*` RPCs (`007`) check the device session and enforce the free tier server-side (1 active track, 10 practice attempts/day); `learning_events` is append-only (update trigger).
- `get_entitlements` / `consume_apply_quota` (`011`) check the device session; plan limits come from `plan_limits()` (rows rendered from `packages/config`, parity-tested). Daily applies are counted in `usage_counters` (RLS on, no anon/authenticated access) under a per-user advisory lock, all or nothing. There is no refund RPC, so a client cannot reset its own count. The desktop calls `consume_apply_quota` before every submission and refuses to submit when it is refused or unreachable. Helpers (`plan_limits`, `billing_effective_plan`, `billing_session_ok`, `billing_today`) are not callable by anon.
- Learn content tables expose only published lessons/practice and `active` (link-checked) resources.
- SECURITY DEFINER functions added in `002`–`008` pin `search_path`.
- The Razorpay webhook verifies the HMAC signature and refuses to run without `RAZORPAY_WEBHOOK_SECRET`.

## Anon-callable allow-list after `008`

`authenticate_user`, `register_device_session`, `verify_and_update_session`, `sync_pull_user_data`,
`sync_push_user_profile`, `sync_push_application`, `sync_push_saved_job`, `sync_remove_saved_job`,
`sync_push_resume`, `sync_delete_resume`, `sync_delete_application` (010), `learning_start_track`, `learning_archive_track`,
`learning_record_events`, `learning_pull_events`, `learning_get_tracks` (012), `get_entitlements` (011), `consume_apply_quota` (011), `register_user` (009), and the admin RPCs (014; each re-checks the
session and the admin role): `admin_list_users`, `admin_set_user_plan`, `admin_set_user_status`, `admin_list_audit`,
`admin_scrape_health`, `admin_list_content`, `admin_update_lesson`, `admin_set_resource_status`,
`admin_content_history`, and the email-code RPCs (019): `confirm_password_reset` (code-checked, generic errors),
`confirm_email_verification` and `email_verification_status` (session-checked). `request_email_code` and
`server_secret` (018) are service_role only, never anon. Any new client RPC must be added to this list in a migration; everything else is denied by
default. (`login_prehash` is also executable by anon; it is a pure hashing helper with no data access.)

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
- ☐ Apply `019` to production, then deploy the Edge Function (`DATABASE_SETUP.md` step 7). Until both are done the
  desktop's "Forgot password?" says it could not send a code and the verify reminder stays hidden.
- ☐ Verify a sending domain in Resend and store the sender in Vault as `email_from`
  (e.g. `Nomadic <no-reply@yourdomain>`). Until then the default `Nomadic <onboarding@resend.dev>` only delivers to
  the Resend account owner's address: every other user gets no email (reset still answers "code sent", verification
  shows "could not send the email"). The function logs `HTTP 403 ...` with a hint when this happens.
- ☐ Rotate the service-role key if it was ever on a customer machine, and the code-signing cert per
  `docs/SECURITY_CLEANUP.md`.
- ☐ Electron hardening and secrets-in-keychain were done in the main-process work stream (Step 3.2);
  re-check them with this list before the first public release.
