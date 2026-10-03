# Feature-wise delivery plan

One feature = one branch/PR, finished to the quality bar in `SAAS_PLAN.md` section 2 before the next starts.
Each feature ships: UI on `@nomadic/ui` (loading, empty, error states), typed IPC + TanStack Query hooks, tests, and old code deleted.

Status: ✅ done · 🟡 partial · ⬜ not started

| # | Feature | Status | Scope to finish | Done when |
|---|---|---|---|---|
| F1 | App shell and navigation | ⬜ | Sidebar, TopBar, CommandPalette on `@nomadic/ui`; flags hide unfinished tabs | Keyboard-only nav works; old shell deleted |
| F2 | Accounts and onboarding | 🟡 | Done: server sign-up, login ticket sent on sign-in and sign-up, auth screen and 4-step onboarding on `@nomadic/ui`. Open: owner enables `require_login_ticket`; password reset and email verification (no backend yet); server-side Google sign-in (SECURITY_CHECKLIST S9) | New user to first value < 3 min |
| F3 | Job feed and matching | 🟡 | Pipeline done; Feed rebuild (virtualised), skill-based match %, missing skills, save/hide | 5k jobs at 60 fps; match tested |
| F4 | Auto-apply | 🟡 | Engine done; apply run view (live progress, needs-you prompts, mandatory review) | Never submits unreviewed; benchmark floor held |
| F5 | Applications tracker | ⬜ | Kanban rebuild, status history, reminders, sync | Survives reinstall; keyboard drag |
| F6 | Profile and resume | 🟡 | Profile/Settings rebuild, resume parse and versions, no invented data | Round-trips through DB only |
| F7 | Learning: My Path and Today | 🟡 | Skill graph seed, planner, lessons, SM-2, streaks | First lesson < 3 min; failed items resurface |
| F8 | Practice and interview prep | ⬜ | One Practice area, runner, rubric AI feedback, weak topics | Limits enforced server side |
| F9 | Billing and plans | 🟡 | Webhook done; in-app checkout, invoices, entitlements service | Plan change reflected < 10 s |
| F10 | Sync, offline and data safety | 🟡 | Event sync, offline lessons, local migrations + backup, export/delete account | Identical progress after reinstall |
| F11 | Updates, telemetry, support | 🟡 | Signed auto-update, Sentry, in-app help/feedback | Tagged release updates a real install |
| F12 | Admin and content tools | ⬜ | Split AdminView, content editing with versions, scraper health, audit log | Every edit versioned |
| F13 | Hidden/optional: Outreach, Opportunity Board, Resource Vault, Assistant | ⬜ | Behind flags until each meets the bar, or cut | Decision per feature |
| F14 | Landing and docs site | 🟡 | Rebuild per decision, single pricing config, Lighthouse >= 95 | Pricing defined once |

## Recommended order
F1 → F6 → F3 → F4 → F5 → F2 → F7 → F8 → F10 → F9 → F11 → F12 → F14 (F13 last or cut).
Reason: F1 and F6 unblock every screen; F3 and F4 are the core value; learning (F7/F8) needs the shared skill IDs from F3.
