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
| S3 | `register_device_session` accepted any `p_user_id` with no proof of login: anyone with a user's UUID could mint a session, kick the real device (`p_force_takeover`) and **read that user's synced profile, resumes and applications** via `sync_pull_user_data`. | ⚠️ | `008`: requires a one-time `login_ticket` (issued by `authenticate_user`, 10 min, single use) **or**, for current desktop builds, a successful login for that user in the last 10 minutes. A session token can't be moved between users. **Follow-up:** desktop passes `p_login_ticket` from the login result, then `update app_security set require_login_ticket = true;`. |
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
| S2d | Login error messages revealed whether an email has an account. | ✅ | One message: "Incorrect email or password." |
| S4 | `hr_contacts` (recruiter names and emails) readable by anyone with the anon key. | ✅ | `008` drops the policy. Outreach is hidden behind a feature flag; re-enabling it needs a session-checked RPC (`apps/desktop/src/main/services/outreach.ts` reads the table with the anon key today). |
| S7 | `match_jobs_for_user(p_user_id)` (SECURITY DEFINER, no `search_path`) callable by anon for any user. | ✅ | Removed from anon by the `008` allow-list (no client calls it). |
| S8 | `jobs` readable by anon. | ✅ by design | Only `is_active = TRUE` rows; writes service-role only (`002`). Expired jobs are hidden via the `006` status trigger. |

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
`sync_push_resume`, `sync_delete_resume`, `learning_start_track`, `learning_archive_track`,
`learning_record_events`, `learning_pull_events`. Any new client RPC must be added to this list in a
migration; everything else is denied by default.

## Owner actions

- ☐ Apply `006`, `007`, `008` to the production project, in order. `008` changes `authenticate_user`'s
  result (adds `login_ticket`); the desktop reads columns by name, so existing builds keep working.
- ☐ Desktop main process: send `p_login_ticket` to `register_device_session`, ship, then set
  `require_login_ticket = true` (closes the 10-minute compatibility window in S3).
- ☐ Rotate the service-role key if it was ever on a customer machine, and the code-signing cert per
  `docs/SECURITY_CLEANUP.md`.
- ☐ Electron hardening and secrets-in-keychain were done in the main-process work stream (Step 3.2);
  re-check them with this list before the first public release.
