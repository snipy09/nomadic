# Setting up a new Supabase database

Rehearsed on PostgreSQL 16 with Supabase's roles and default grants (`packages/supabase/scripts/local-supabase-shim.sql`):
all migrations 001–010 apply in order, a re-run skips them, and an `anon` smoke test passed
(sign-up, sign-in, single-use login ticket, device registration, application push/pull/delete with session checks,
operator-only functions denied to `anon`).
`015` (Google sign-in) rehearsed the same way: `google_signin` denied to `anon`/`authenticated`, its ticket registers a
device once and only for its own user, and an email already linked to another Google account is refused.

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

## 6. Edge functions
- `packages/supabase/functions/razorpay-webhook` with `RAZORPAY_WEBHOOK_SECRET` set (billing, F9).
- `packages/supabase/functions/google-signin` (needs migration `015`), deployed with `--no-verify-jwt`, with
  `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` set as Supabase secrets (SECURITY_CHECKLIST S9).
  The desktop build gets only `GOOGLE_OAUTH_CLIENT_ID`.
