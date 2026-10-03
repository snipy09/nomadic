# Setting up a new Supabase database

Rehearsed on PostgreSQL 16 with Supabase's roles and default grants (`packages/supabase/scripts/local-supabase-shim.sql`):
all migrations 001–011 apply in order, a re-run skips them, and an `anon` smoke test passed
(sign-up, sign-in, single-use login ticket, device registration, application push/pull/delete with session checks,
operator-only functions denied to `anon`; for 011: entitlements with a valid session, bad token / wrong device /
inactive session rejected, daily apply quota counted all-or-nothing and refused when used up, Pro and Max limits after
an upgrade, expired Pro falls back to Free, suspended accounts refused, billing helpers and `usage_counters` denied to `anon`).

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

## 3. Apply migrations
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
