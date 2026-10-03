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
| S9 | Google sign-in (`apps/desktop/src/main/services/oauth.ts`) has no server-side session: it never calls `authenticate_user` or `register_device_session`, uses Google's `sub` as the user id (not a `users_profile` UUID), and its direct `users_profile` read/insert with the anon key is denied by RLS since `008`. Result: Google users get a local, free-tier, user-role account whose heartbeat and cloud sync cannot succeed. Nothing is escalated (role/tier are never taken from the client), but the flow cannot obtain a login ticket. | ☐ | Needs a server path: an RPC or Edge Function that verifies the Google ID token (or a Supabase Auth JWT) server-side, finds or creates the `users_profile` row by the verified email, and returns the same row shape as `authenticate_user` including `login_ticket`. The desktop then registers the device exactly like password sign-in. Also move the Google code exchange to PKCE so no client secret ships in the build. |

## Account emails (016)

| # | Item | Status | Detail |
|---|---|---|---|
| S10 | Password reset and email verification | ✅ (deploy pending) | 8-digit codes stored as bcrypt, never in plaintext; reset expires in 30 min, verification in 24 h; single use; burned after 5 wrong guesses; a new code replaces older ones; requests limited per email and purpose to 3/hour and 10/day (unknown emails count too, so the limit does not reveal accounts). `request_password_reset` answers the same for unknown and known emails, and `auth-email` sends in the background so timing does not reveal it either. A reset signs out every device, drops outstanding login tickets and clears the lockout. Verification and status RPCs are session-checked. Emails carry the code only, no links. Secrets `RESEND_API_KEY` and `RESEND_FROM` live only in Supabase secrets. Rehearsed on PostgreSQL 16; tests in `packages/supabase/src/__tests__/auth-email.test.ts`, `apps/desktop/src/main/__tests__/account-email.test.ts` and the renderer tests `forgotPassword`, `emailVerificationBanner`, `accountEmail`. |

## Verified as correct (no change)

- RLS is enabled on every table. `users_profile`, `user_sessions`, `user_preferences`, `user_job_matches`, `billing_records`, `razorpay_payments`, `user_cloud_profiles`, `user_applications`, `user_saved_jobs`, `user_resumes`, `scrape_runs`, `learning_events`, `user_tracks`, `practice_solutions`, `login_attempts`, `login_tickets`, `app_security` have **no** anon/authenticated policy: they are reachable only through session-checked SECURITY DEFINER RPCs or the service role.
- All `sync_*` RPCs check `session_token + user_id + device_fingerprint + is_active` before touching data.
- `learning_*` RPCs (`007`) check the device session and enforce the free tier server-side (1 active track, 10 practice attempts/day); `learning_events` is append-only (update trigger).
- Learn content tables expose only published lessons/practice and `active` (link-checked) resources.
- SECURITY DEFINER functions added in `002`–`008` pin `search_path`.
- The Razorpay webhook verifies the HMAC signature and refuses to run without `RAZORPAY_WEBHOOK_SECRET`.

## Anon-callable allow-list after `008`

`authenticate_user`, `register_device_session`, `verify_and_update_session`, `sync_pull_user_data`,
`sync_push_user_profile`, `sync_push_application`, `sync_push_saved_job`, `sync_remove_saved_job`,
`sync_push_resume`, `sync_delete_resume`, `sync_delete_application` (010), `learning_start_track`, `learning_archive_track`,
`learning_record_events`, `learning_pull_events`, `confirm_password_reset`, `confirm_email_verification`,
`account_email_status` (016). Any new client RPC must be added to this list in a
migration; everything else is denied by default.

Service-role only (called from Edge Functions, never with the anon key): `handle_razorpay_payment_success` (008),
`request_password_reset` and `request_email_verification` (016, `auth-email`; they return the plaintext code to be
emailed). Internal helpers `account_email_issue_code`, `account_email_check_code`, `account_session_user` (016) are
granted to nobody.

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
- ☐ Rotate the service-role key if it was ever on a customer machine, and the code-signing cert per
  `docs/SECURITY_CLEANUP.md`.
- ☐ Electron hardening and secrets-in-keychain were done in the main-process work stream (Step 3.2);
  re-check them with this list before the first public release.
