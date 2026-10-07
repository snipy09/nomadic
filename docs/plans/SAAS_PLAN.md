# Nomadic: path to a SaaS-grade desktop app

Builds on `docs/plans/REVAMP_PLAN.md` (which stays the execution script for Phases 3 to 5). This document adds what that plan
does not cover: the quality bar, the missing SaaS pillars, the order, and how we know we are done.

## 1. Where we are

| Area | State |
|---|---|
| Form engine, benchmark, scraper pipeline, CI, release workflow, RLS hardening (008) | Done |
| Design system `@nomadic/ui`, main-process split, typed IPC | Done |
| State layer (Zustand store + single preferences module) | Done (3.3) |
| Screens on the design system (shell, Feed, Applications, Profile, Onboarding, apply run view) | **Not started** (3.4) |
| Learning: data model, 007 migration, `packages/learning` core | Core only; no planner, lessons, practice, UI |
| Auth: server-side account creation | Done; login-ticket enforcement still open |
| Billing: Razorpay webhook + server-derived plan | Done server side; no in-app billing UX |
| Auto-update, crash reporting, telemetry, support | Workflow exists; unverified end to end |
| Landing page | Redesigned; Lighthouse and single-config pricing unverified |

## 2. The quality bar ("flawless" made measurable)

A release is shippable only if every line is true. These become CI gates where possible.

1. **Reliability:** crash-free sessions >= 99.5%; apply flow never submits without the user's review; no data loss on kill -9 or power cut (SQLite WAL + event log).
2. **Performance:** cold start < 3 s on a mid laptop; feed first paint < 1 s from cache; 60 fps scrolling at 5k jobs (virtualised); renderer bundle < 2 MB gzip, no datasets bundled.
3. **Correctness:** form benchmark >= agreed score on 22 fixtures (never regress); scraper dead-link rate < 3%; match score unit-tested.
4. **Security:** every item in `docs/security/SECURITY_CHECKLIST.md` closed; secrets only in OS keychain; IPC inputs zod-validated; dependency audit clean in CI.
5. **UX:** every screen has loading, empty, error-with-recovery states; keyboard-only usable; WCAG AA contrast; works at 1024 px and up; light and dark.
6. **Trust:** privacy section matches real data flows; one-click export and delete account; AI never invents links, salaries or profile data.
7. **Operability:** every user-visible failure has a Sentry event, a log line, and an in-app message saying what to do next.

## 3. Workstreams

### A. Product core (finish the revamp)
Order matters; each item is one PR.
1. **3.4 Shell and screens:** Sidebar, TopBar, CommandPalette, then Onboarding, Feed, Applications kanban, Profile and Settings, apply run view. Break `FeedView` (1352), `ProfileView` (1186), `AdminView` (1944), `LearnerView` (1379) into feature folders. Add TanStack Query hooks (`useJobs`, `useApplications`, `useProfile`) over the typed IPC. Feature-flag Outreach and Opportunity Board off. Delete old components when replaced.
2. **3B.2 Skill graph and resources:** seed 8 role families, link checker job, move datasets (incl. 1.2 MB LeetCode JSON) to the backend with local cache.
3. **3B.3 Planner and My Path:** deterministic planner; LLM only explains and adjusts, zod-validated, never emits URLs.
4. **3B.4 Lessons, practice, Today queue:** SM-2, placement quiz, sandboxed runner.
5. **3B.5 Readiness and job matching:** shared skill IDs between jobs and learners; "% match, top missing skills, start learning" on Feed cards.
6. **3B.6 Practice and interview prep:** one Practice area, rubric-based AI feedback, weak topics feed the queue.
7. **3B.7 Sync, offline, admin tools:** event sync by ID, offline lessons, admin editing with versioning, delete legacy learner code (`LearnerView` localStorage, old tables). This also finishes Step 3.3's last `localStorage` use.

### B. SaaS plumbing (not in the revamp plan; required for "SaaS grade")
1. **Accounts and sessions:** enforce `login_ticket` (set `require_login_ticket = true`), refresh and expiry handling, device list with remote sign-out, password reset and email verification flows, account deletion and data export (GDPR/DPDP).
2. **Billing UX:** single pricing config (already in `packages/config`) drives the upgrade modal, landing and admin; Razorpay checkout in-app, receipt and invoice list, plan status refreshed from server, grace period on failure, cancel and downgrade path. Free vs paid limits enforced server side only.
3. **Entitlements service:** one `getEntitlements()` RPC that the app caches; feature flags and limits from the server (kill switch per feature, staged rollout by percentage).
4. **Auto-update:** signed Windows installer, `electron-updater` with staged rollout, update channel (stable/beta), forced-update floor for security fixes, rollback plan; macOS later (decision pending).
5. **Observability:** Sentry in main and renderer (opt-in), release tagging with source maps, structured logs with a "Copy diagnostics" button, anonymous opt-in product analytics (activation, first lesson, first apply, retention) with an events dictionary.
6. **Support loop:** in-app Help (docs, shortcuts), feedback and bug report with attached diagnostics, status page link, changelog shown after update.
7. **Data safety:** DB migration framework with versioned, tested, reversible local SQLite migrations; automatic backup before migrating; integrity check on start.
8. **Admin:** role-gated admin with audit log, content versioning, user lookup (support only), scraper health dashboard fed by `scrape_runs`.

### C. Quality engineering
1. **Test pyramid:** unit (existing 524), IPC contract tests, component tests per screen, Playwright-for-Electron smoke e2e (onboard, lesson, match, apply with mock ATS), visual regression on the showcase.
2. **Gates in CI:** typecheck, lint with zero warnings budget trending down, tests, form-benchmark floor, bundle-size budget, `npm audit`, secret scan, Lighthouse for web.
3. **Fixture-driven AI evals:** profile generation, answerer and rubric feedback each get a golden set; failures block release (the model must quote and score, never invent).
4. **Cleanup debt:** remove the remaining `TODO`/`as any`/`@ts-ignore` (track count to 0 in non-test code); delete `resourceVault.ts` placeholders or finish them.
5. **Accessibility and i18n readiness:** audit with axe, focus management in dialogs, all strings through one catalogue (English now, structure ready for Hindi).

### D. Go-to-market surface
1. Landing rebuild (4.1) after pricing is final; privacy page matches data flows; docs site with getting started and ATS support matrix.
2. Onboarding to first value in < 3 minutes: sign up, pick role, see matches and a first lesson.
3. Closed alpha to private beta with waitlist, referral, and a feedback cadence; define pricing experiment (INR 99 alpha vs 249/599 tiers).

## 4. Sequencing

| Stage | Contents | Exit gate |
|---|---|---|
| S1 Foundations (1-2 wks) | B7 migrations/backups, B1 login-ticket, C2 CI gates, C4 debt, 3.3 leftovers prep | Gates green; `require_login_ticket` on |
| S2 Core screens (3-4 wks) | A1 (3.4) + B3 entitlements + B6 help/feedback | Every screen at quality bar 5; old components deleted |
| S3 Learning product (5-6 wks) | A2 to A7, C3 evals | New user finishes first lesson < 3 min; sync identical after reinstall |
| S4 Money and ops (2 wks, overlaps S3) | B2 billing UX, B4 updater, B5 observability, B8 admin | Tagged release builds, signs, publishes, updates a real install |
| S5 Launch (2 wks) | D, Final check, `docs/REVAMP_RESULTS.md`, beta | All of section 2 true on release candidate |

Total is roughly 13-17 weeks of focused work; S3 and S4 can run in parallel.

## 5. Risks and mitigations

- **Scope creep in learning:** ship curated links plus planner first; AI lesson drafting only behind review.
- **ATS changes break form filling:** nightly benchmark plus fixture capture script; per-portal kill switch from entitlements service.
- **Scraper blocking and legal exposure:** respect robots and rate limits, prefer official feeds and ATS public APIs, store minimal data, honour takedown.
- **Single-developer bus factor:** every step has a "done when"; keep `docs/` current; runbooks for release, rotation, incident.
- **Windows-only reach:** decide macOS early because signing, updater and keychain code differ.

## 6. Decisions needed before S1 ends

1. India-focused scraping or global ATS-first.
2. Windows only, or add macOS (and when).
3. Final tiers and prices; keep INR 99 alpha?
4. Features to cut or hide at launch (outreach, vault, opportunity board).
5. Role families for learning v1 and who curates content.
6. Code practice runner: hosted Judge0 or in-browser only.
7. Landing: stay on Vite or move to Next.js/Astro.
8. Analytics stance: opt-in only, or opt-out with clear notice.
