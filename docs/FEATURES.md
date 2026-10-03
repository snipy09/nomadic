# Feature-wise delivery plan

One feature = one branch/PR, finished to the quality bar in `SAAS_PLAN.md` section 2 before the next starts.
Each feature ships: UI on `@nomadic/ui` (loading, empty, error states), typed IPC + TanStack Query hooks, tests, and old code deleted.

Status: ✅ done · 🟡 partial · ⬜ not started

| # | Feature | Status | Scope to finish | Done when |
|---|---|---|---|---|
| F1 | App shell and navigation | 🟡 | Built on `@nomadic/ui` (AppShell, Sidebar, TopBar, CommandPalette, theme, flags). Left: visual pass at 1024 px, keyboard-only manual pass | Keyboard-only nav works; old shell deleted |
| F2 | Accounts and onboarding | 🟡 | Done: server sign-up, login ticket sent on sign-in and sign-up, auth screen and 4-step onboarding on `@nomadic/ui`. Open: owner enables `require_login_ticket`; password reset and email verification (no backend yet); server-side Google sign-in (SECURITY_CHECKLIST S9) | New user to first value < 3 min |
| F3 | Job feed and matching | 🟡 | Built: feature folder, skill-id match % and missing skills, save, filters, states. Left: hide job (needs backend), skill tagging in the scraper pipeline | 5k jobs at 60 fps; match tested |
| F4 | Auto-apply | 🟡 | Built: real fill-then-review flow (onReadyForReview + submitReviewed), apply run view with per-field review and per-application tick. Left: multi-step form edits, live portal testing | Never submits unreviewed; benchmark floor held |
| F5 | Applications tracker | 🟡 | Built: kanban + list, keyboard moves, history, notes, sync of status/notes/delete, migration 010. Left: reminders, apply 010 in production | Survives reinstall; keyboard drag |
| F6 | Profile and resume | 🟡 | Built: feature folder, no invented data, validation, real resume management. Left: resume parsing and versions | Round-trips through DB only |
| F7 | Learning: My Path and Today | 🟡 | Skill graph seed, planner, lessons, SM-2, streaks | First lesson < 3 min; failed items resurface |
| F8 | Practice and interview prep | 🟡 | Built: Practice area (filters, detail, self/quiz grading, timed mock, weak topics), attempts via 007 RPCs with server daily limit, 1.2 MB dataset out of the renderer bundle. Left: AI rubric feedback endpoint, publish quiz items, server-side company-set gating | Limits enforced server side |
| F9 | Billing and plans | 🟡 | Built: migration 011 (get_entitlements, consume_apply_quota, plan_limits parity-tested against packages/config), quota checked before every submission (review flow and autonomous), getEntitlements IPC cached 5 s, features/billing (hook, Upgrade dialog from config with Razorpay Payment Page checkout and 4 s polling, plan status in Settings > Account), server limit on the feed. Left: apply 011 in production, Razorpay payment pages + build env, invoices/receipts list, grace period, free-plan login after trial (see DECISIONS) | Plan change reflected < 10 s |
| F10 | Sync, offline and data safety | 🟡 | Event sync, offline lessons, local migrations + backup, export/delete account | Identical progress after reinstall |
| F11 | Updates, telemetry, support | 🟡 | Signed auto-update, Sentry, in-app help/feedback | Tagged release updates a real install |
| F12 | Admin and content tools | 🟡 | Built: `features/admin` (Users with plan/status changes behind confirmation + reason, Audit log, Scraper health from `scrape_runs`, Content list + lesson text and resource status edits with version bump and history), all via session-checked admin RPCs (migration 014, append-only audit log, no service-role key in the app). Left: apply 014 in production; practice item and skill editing; review assignment (second reviewer) for publishing | Every edit versioned |
| F13 | Hidden/optional: Outreach, Opportunity Board, Resource Vault, Assistant | ⬜ | Behind flags until each meets the bar, or cut | Decision per feature |
| F14 | Landing and docs site | 🟡 | Rebuild per decision, single pricing config, Lighthouse >= 95 | Pricing defined once |

## Recommended order
F1 → F6 → F3 → F4 → F5 → F2 → F7 → F8 → F10 → F9 → F11 → F12 → F14 (F13 last or cut).
Reason: F1 and F6 unblock every screen; F3 and F4 are the core value; learning (F7/F8) needs the shared skill IDs from F3.
