# Setting up a new Supabase database

Rehearsed on PostgreSQL 16 with Supabase's roles and default grants (`packages/supabase/scripts/local-supabase-shim.sql`):
all migrations 001–010 apply in order, a re-run skips them, and an `anon` smoke test passed
(sign-up, sign-in, single-use login ticket, device registration, application push/pull/delete with session checks,
operator-only functions denied to `anon`).

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
Open the project's SQL editor, paste `packages/supabase/baseline/baseline_001_010.sql`, click Run. It creates the final
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

## 6. Edge function
Deploy `packages/supabase/functions/razorpay-webhook` with `RAZORPAY_WEBHOOK_SECRET` set (billing, F9).
