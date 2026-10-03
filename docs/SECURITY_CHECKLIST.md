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
| S3 | `register_device_session` accepted any `p_user_id` with no proof of login: anyone with a user's UUID could mint a session, kick the real device (`p_force_takeover`) and **read that user's synced profile, resumes and applications** via `sync_pull_user_data`. | ⚠️ | `008`: requires a one-time `login_ticket` (issued by `authenticate_user`, 10 min, single use) **or**, for older desktop builds, a successful login for that user in the last 10 minutes. A session token can't be moved between users. **Desktop (F2):** password sign-in passes the ticket from `authenticate_user` as `p_login_ticket`; a force-takeover retry signs in again for a fresh ticket; sign-up calls `authenticate_user` once after `register_user` (which issues no ticket) and sends that ticket. The parameter is omitted only when the server returns no ticket (database without `008`). Tests: `apps/desktop/src/main/__tests__/auth-login-ticket.test.ts`, `packages/supabase/src/__tests__/index.test.ts`. **Remaining:** owner turns on `require_login_ticket` after this build ships (see Owner actions). Google sign-in now registers the device with a ticket from `google_sign_in` (S9). |
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
| S9 | Google sign-in (`apps/desktop/src/main/services/oauth.ts`) had no server-side session: it never called `authenticate_user` or `register_device_session`, used Google's `sub` as the user id (not a `users_profile` UUID), read/inserted `users_profile` with the anon key (denied by RLS since `008`), cached the fixed offline credential `google_oauth_token`, and exchanged the code with only a client secret. Google users got a local free-tier account whose heartbeat and cloud sync could not succeed. | ✅ code / ☐ deploy | **Desktop:** installed-app flow with PKCE (S256), `state` and `nonce` on the loopback redirect `http://127.0.0.1:42813/callback`; state is single use and expires after 10 min. The code is exchanged for a Google ID token (the `client_secret` of Google's "Desktop app" client is still sent when the build provides it: Google requires it for that client type and documents it as not confidential; it comes from the build env, never the repo). The ID token goes to the **`google-sign-in` Edge Function** (anon key as bearer), which verifies it server-side (`functions/google-sign-in/verify.ts`: RS256 signature against Google's JWKS with kid rotation, `iss` accounts.google.com, `aud` == Vault `google_oauth_client_id` via `server_secret` (018), `exp`/`iat`, `email_verified`, nonce) and calls **`google_sign_in` (021, service_role only)**: finds the account by linked `google_sub`, else by verified email (links `google_sub` on first use; a different Google subject for an already linked email is refused), else creates a 14-day trial with `register_user`'s defaults and no password; refuses suspended accounts; records `login_attempts`; returns `authenticate_user`'s exact row incl. a single-use `login_ticket`. The desktop then runs the same `startServerSession` as password sign-in (device registration with that ticket, heartbeat, cloud pull); role/tier come only from that row; device conflicts offer a takeover that re-runs Google sign-in for a fresh ticket. The offline cache stores a random credential, so a Google account cannot be used offline with a guessed password. No desktop code touches `users_profile`. Rehearsed on PostgreSQL 16 (shim + baseline + 012/017/018/021, stub Vault): new user created with ticket, ticket registers a device with `require_login_ticket` on and only once, returning user found by `google_sub`, existing password user linked by email (password still works), other subject refused, suspended refused, expired plan still signs in, anon/authenticated get permission denied. Tests: `packages/supabase/src/__tests__/google-id-token.test.ts`, `apps/desktop/src/main/__tests__/google-sign-in.test.ts`. **Remaining (owner):** apply `021`, deploy the function, add `google_oauth_client_id` to Vault, configure the Google OAuth client (DATABASE_SETUP step 7). |

## Verified as correct (no change)

- RLS is enabled on every table. `admin_audit_log`, `content_versions` (014), `users_profile`, `user_sessions`, `user_preferences`, `user_job_matches`, `billing_records`, `razorpay_payments`, `user_cloud_profiles`, `user_applications`, `user_saved_jobs`, `user_resumes`, `scrape_runs`, `learning_events`, `user_tracks`, `practice_solutions`, `login_attempts`, `login_tickets`, `app_security` have **no** anon/authenticated policy: they are reachable only through session-checked SECURITY DEFINER RPCs or the service role.
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
`admin_content_history`. `google_sign_in` (021) is deliberately **not** on this list: it trusts its arguments and is
executable by `service_role` only (the `google-sign-in` Edge Function, after verifying the Google ID token). Any new client RPC must be added to this list in a migration; everything else is denied by
default. (`login_prehash` is also executable by anon; it is a pure hashing helper with no data access.)

## Owner actions

- ☐ Apply `006`, `007`, `008` to the production project, in order. `008` changes `authenticate_user`'s
  result (adds `login_ticket`); the desktop reads columns by name, so existing builds keep working.
- ✅ Desktop main process sends `p_login_ticket` to `register_device_session` (password sign-in and sign-up).
- ☐ Ship that build, wait until no older desktop builds are in use, then run
  `update app_security set require_login_ticket = true;` (closes the 10-minute compatibility window in S3).
  Do this only after `006`-`009` are applied. With it on, password sign-in, sign-up and (once `021` and the
  `google-sign-in` function are deployed) Google sign-in keep working because all three send a ticket.
- ☐ S9: apply `021`, deploy `packages/supabase/functions/google-sign-in`, store `google_oauth_client_id` in Vault and
  configure the Google OAuth client (DATABASE_SETUP step 7). Code and rehearsal are done.
- ☐ Apply `014` (admin tools) to production. Until it is applied the desktop Admin screen shows "the server does not
  have the admin functions yet"; nothing falls back to the service-role key. Admins are whoever has
  `users_profile.role = 'admin'` (set in SQL by the operator).
- ☐ Rotate the service-role key if it was ever on a customer machine, and the code-signing cert per
  `docs/SECURITY_CLEANUP.md`.
- ☐ Electron hardening and secrets-in-keychain were done in the main-process work stream (Step 3.2);
  re-check them with this list before the first public release.
