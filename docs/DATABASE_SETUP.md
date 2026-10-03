# Setting up a new Supabase database

**Live project:** `nomadic` (ref `grqkiddfwoyicktpgdea`, ap-south-1). Set up 2026-10-03 with `baseline/supabase_full_setup.sql`
(001–011, 014, 015, 016) plus 012 and 017; verified: all 15 migrations recorded, RLS on all 32 public tables, anon can execute only the
28 allow-listed RPCs. The app's build defaults point at it (the anon key is public by design). Advisor notes that remain
are by design: deny-all tables (RLS, no policies) and session-checked SECURITY DEFINER RPCs callable by anon.
The Resend key is stored in Vault (`resend_api_key`), readable only by service_role via `private.get_vault_secret`.

Rehearsed on PostgreSQL 16 with Supabase's roles and default grants (`packages/supabase/scripts/local-supabase-shim.sql`):
all migrations 001–011 apply in order, a re-run skips them, and an `anon` smoke test passed
(sign-up, sign-in, single-use login ticket, device registration, application push/pull/delete with session checks,
operator-only functions denied to `anon`; for 011: entitlements with a valid session, bad token / wrong device /
inactive session rejected, daily apply quota counted all-or-nothing and refused when used up, Pro and Max limits after
an upgrade, expired Pro falls back to Free, suspended accounts refused, billing helpers and `usage_counters` denied to `anon`).
`012` (learning track pull) was rehearsed the same way: it applies after 010, and
as `anon` the learning RPCs enforced the session check and the free tier's one active track (archive, then start the new one).

## 1. Create the project (owner)
Supabase dashboard → New project (region: Mumbai `ap-south-1` for Indian users). Save the database password.

## 2. Give the environment the credentials (owner, never paste them into chat)
Environment settings → environment variables:

| Variable | Where in Supabase | Used by |
|---|---|---|
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string (URI, session pooler, port 5432) | `migrate.sh` |
| `SUPABASE_URL` | Project Settings → API → Project URL | desktop build, scrapers |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon public key | desktop build |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key (operator only, never shipped in the app) | scrapers, admin scripts |

Network access must allow `*.supabase.co` and `*.pooler.supabase.com`.

## 3a. Fresh project (one paste)
Open the project's SQL editor, paste `packages/supabase/baseline/supabase_full_setup.sql` (001–011, 015, 016; or `baseline_001_010.sql` for 001–010 only), click Run. It creates the final
schema of migrations 001–010 in one transaction and records them in `schema_migrations`, so `migrate.sh` later only
applies 011+. Verified on a fresh PostgreSQL with Supabase's default grants, plus the `anon` smoke test.

## 3b. Existing project: apply migrations
```
bash packages/supabase/scripts/migrate.sh --dry-run   # list what will run
bash packages/supabase/scripts/migrate.sh             # apply; re-running only applies new files
```
Each file runs in one transaction and is recorded in `public.schema_migrations`.

## 4. Create your admin (owner, SQL editor)
Migration 002 no longer seeds an admin with a placeholder password.
```sql
INSERT INTO public.users_profile (email, full_name, subscription_tier, role, status)
VALUES ('you@example.com', 'Your Name', 'max', 'admin', 'active');
SELECT public.set_user_password('you@example.com', '<strong password>');
```

## 5. After the new desktop build ships
`UPDATE public.app_security SET require_login_ticket = true;` (SECURITY_CHECKLIST S3), after a manual sign-in,
sign-up and device-takeover test against this project.

## 6. Billing (F9)
Deploy `packages/supabase/functions/razorpay-webhook` with `RAZORPAY_WEBHOOK_SECRET` set.

In-app checkout opens a Razorpay **Payment Page** in the browser. Create one page per paid plan (amount ₹249 for Pro,
₹599 for Max, from `packages/config`), with an email field and a hidden custom field named `user_id` (Razorpay puts
custom fields in the payment notes; the webhook reads `notes.user_id`, then the payer email). Then set these build
environment variables for the desktop build (public URLs, not secrets):

| Variable | Value |
|---|---|
| `RAZORPAY_CHECKOUT_URL_PRO` | the Pro payment page URL (`https://pages.razorpay.com/...` or `https://rzp.io/...`) |
| `RAZORPAY_CHECKOUT_URL_MAX` | the Max payment page URL |

The app appends `?email=...&user_id=...` to pre-fill them and only opens https Razorpay hosts. Without these
variables the upgrade dialog offers the manual WhatsApp route instead. The plan is always derived from the amount paid
(`handle_razorpay_payment_success`), never from the page.

Plan limits live in `packages/config/src/plans.ts`. After changing a limit, update the `plan_limits` rows in a new
migration; `packages/supabase/src/__tests__/entitlements-parity.test.ts` fails until SQL and config agree.

## 7. Google sign-in (SECURITY_CHECKLIST S9)
Desktop Google sign-in uses the installed-app flow (authorization code + PKCE on the loopback redirect
`http://127.0.0.1:42813/callback`). The desktop sends the Google ID token to the `google-sign-in` Edge Function, which
verifies it (signature via Google's JWKS, issuer, audience = the client id below, expiry, verified email) and calls
`google_sign_in` (migration `021`, service_role only). That returns the same row as `authenticate_user`, including the
single-use login ticket, so the device registers exactly like password sign-in.

`021` was rehearsed on PostgreSQL 16 (shim + `baseline/supabase_full_setup.sql` + 012, 017, 018, 021, stub Vault):
new Google user created with a ticket; ticket registers a device once with `require_login_ticket` on; returning user
found by `google_sub`; existing password user with the same email linked (password sign-in still works); a different
Google account for a linked email refused; suspended refused; expired plan still signs in; `anon`/`authenticated`
get permission denied on `google_sign_in`.

Owner steps, in order:
1. **Google Cloud Console → APIs & Services → OAuth consent screen**: user type External, app name "Nomadic",
   support email, scopes `openid`, `email`, `profile`. Publish the app (in "Testing" only listed test users can sign in).
2. **Credentials → Create credentials → OAuth client ID → Application type "Desktop app"**. Desktop clients accept
   any `http://127.0.0.1:<port>` loopback redirect, so there is no redirect URI to register. (If you use a
   "Web application" client instead, add the authorized redirect URI `http://127.0.0.1:42813/callback` exactly.)
   Google still issues a client secret for Desktop clients and requires it at the token endpoint; Google documents it
   as not confidential for installed apps (PKCE protects the code). Keep it out of the repo anyway.
3. **Vault** (SQL editor): the function reads the client id as the token audience.
   ```sql
   select vault.create_secret('<client id>.apps.googleusercontent.com', 'google_oauth_client_id',
                              'Google OAuth desktop client id (ID token audience)');
   ```
4. **Apply `021`**: `bash packages/supabase/scripts/migrate.sh` (018 must already be applied; it provides `server_secret`).
5. **Deploy the function**: `supabase functions deploy google-sign-in --project-ref grqkiddfwoyicktpgdea`
   (keep JWT verification on; the desktop sends the anon key as bearer). It needs no extra secrets:
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.
6. **Desktop build environment** (CI secrets / local `.env`, never committed): `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET` from step 2. Without the client id the app shows "Google sign-in is not configured".
7. Test with a new Google account and with a Google account whose email already has a password account (it is linked,
   keeps its plan and role). Then `require_login_ticket` (step 5) can be turned on without breaking Google sign-in.
