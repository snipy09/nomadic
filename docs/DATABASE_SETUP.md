# Setting up a new Supabase database

**Live project:** `nomadic` (ref `grqkiddfwoyicktpgdea`, ap-south-1). Set up 2026-10-03 with `baseline/supabase_full_setup.sql`
(001–011, 014, 015, 016) plus 012 and 017; verified: all 15 migrations recorded, RLS on all 32 public tables, anon can execute only the
28 allow-listed RPCs. 018 was applied afterwards. **019 (email codes) is not applied yet**: it adds 2 tables and 3 anon
RPCs (31 in total; see step 7). The app's build defaults point at it (the anon key is public by design). Advisor notes that remain
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

## 7. Password reset and email verification (019 + Edge Function)
1. Apply `migrations/019_email_codes.sql` (`migrate.sh`, or paste it in the SQL editor). Rehearsed on PostgreSQL 16:
   ```
   # after shim + baseline + 012, 017, 018, 019 on a scratch database (never on the real project):
   psql -v ON_ERROR_STOP=1 -X -q -d <scratch db> -f packages/supabase/scripts/rehearse-019.sql   # ends with "ALL 019 CHECKS PASSED"
   ```
   Plain PostgreSQL has no Vault: create a stub `vault.decrypted_secrets` view (name, decrypted_secret) before 015/018.
2. Deploy the function (JWT verification stays on; the desktop sends the anon key, which is a JWT, as the bearer):
   ```
   supabase functions deploy send-email-code --project-ref grqkiddfwoyicktpgdea
   ```
   It needs no environment variables of its own: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the
   runtime, the Resend key is read from Vault (`resend_api_key`, already stored) through `server_secret`. If the project
   ever switches to the new `sb_publishable_...` keys (not JWTs), deploy with `--no-verify-jwt`; the function does its
   own checks (session for verify, neutral answer for reset).
3. Sender: until a domain is verified in Resend, the function sends from `Nomadic <onboarding@resend.dev>`, which only
   delivers to the Resend account owner's address. Verify a domain in Resend, then store the sender in Vault:
   ```sql
   select vault.create_secret('Nomadic <no-reply@yourdomain>', 'email_from', 'Sender for send-email-code');
   ```
4. Smoke test after deploying (Resend account owner's address while on the test sender): desktop sign-in screen →
   "Forgot password?" → code arrives → new password → sign in. Then Settings > Account → "Verify email".

What unverified accounts can do: everything. Verification only records `users_profile.email_verified_at`; the app
offers it after sign-up and shows a reminder in Settings > Account. A completed password reset also marks the email
verified.
