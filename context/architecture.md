# Architecture

Last updated: 31 October 2026 (Learn v3; split into shared packages + three apps on 7 October).

## The rule that shapes the repo

Three apps, one product. Code that every app uses lives **once** in `packages/`; each app folder holds only what is
specific to its platform. So:

| You want to change… | Edit here | What else it affects |
|---|---|---|
| Windows only (startup flags, sandbox fallback, installer, icon) | `apps/desktop/` | nothing else |
| macOS only (menu, window behaviour, DMG, signing) | `apps/mac/` | nothing else |
| Android only (WebView host, Capacitor, native project, touch sizes) | `apps/android/` | nothing else |
| A screen or UI behaviour on every platform | `packages/app-ui/src/` | all three apps (CI builds all three) |
| A main-process service, IPC channel, local database | `packages/app-core/src/` | Windows + Mac; Android reuses most services |
| Design tokens / components | `packages/ui/` | every app + nothing on the website |
| Prices, limits, flags, legal text | `packages/config/` | every app + website + SQL parity tests |

A screen that differs by platform reads `PLATFORM` / `IS_MOBILE` / `IS_MAC` from `packages/app-ui/src/platform.ts`
(set at build time by each app's `VITE_PLATFORM`). Prefer moving a platform-only screen into its app folder over adding
another branch to shared code.

## Layout

```
apps/
  desktop/     Windows app (Electron). src/main.ts = Windows entry (GPU workarounds, sandbox fallback in
               src/sandbox-fallback.ts) calling startDesktopApp() from app-core; renderer/ = index.html + main.tsx
               (mountApp) + public assets; assets/ (icon.ico, logos); package.json "build" = NSIS + portable;
               update-policy.json (forced-update floor, published with releases). CONTEXT.md.
  mac/         macOS app (Electron). src/main.ts = Mac entry (sandbox + GPU on, keeps running with no window),
               src/menu.ts (macOS menu bar); renderer/ like desktop; build-resources/ (icon.icns, entitlements,
               mac-adhoc-sign.cjs); package.json "build" = DMG (arm64 + x64). CONTEXT.md.
  android/     Android app (Capacitor 8, com.nomadic.career). src/main.tsx boots src/host (Electron/Node stand-ins,
               sql.js in IndexedDB, phone device id "mobile-…", the app-core IPC handlers and preload) then mountApp();
               android/ = native project; vite.config.ts swaps app-core's db.ts/device.ts for the host ones. CONTEXT.md.
  web/         Marketing site (Vite + React, prerendered, /terms /privacy /refunds from @nomadic/config).
packages/
  app-core/    @nomadic/app-core: the Electron main process shared by Windows and Mac.
               src/main/app.ts         startDesktopApp(platform): user data, single instance, deep links, IPC, CSP,
                                       local DB, secrets, updates, window; OS hooks come from the app
               src/main/ipc/*.ts       IPC handlers; every input zod-validated in ipc/schemas.ts
               src/main/services/*.ts  auth, oauth, profile, apply, applications, learning, learn-v2, practice,
                                       billing, entitlements, admin, ai-proxy, email-codes, cloud-sync, news, feed,
                                       outreach-store, updates, telemetry, …
               src/main/db.ts + local-db/  local SQLite (sql.js), versioned migrations (PRAGMA user_version), backups
               src/main/preload.ts     builds window.api (contextBridge)
               src/shared/ipc.ts       the typed IPC contract (IPC_CHANNELS, Channel map, NomadicApi); admin.ts, csp.ts,
                                       applicationAnswers.ts, profileExtras.ts; data/ (job roles, question vault)
               data/practice/          LeetCode company sets (copied next to the main bundle at build)
               tooling/electron-main.mjs shared esbuild build for an app's main process + preload
  app-ui/      @nomadic/app-ui: the React UI shared by all three apps.
               src/mount.tsx (mountApp), App.tsx (shell + routing by activeTab), platform.ts, store/ (Zustand;
               preferences.ts is the ONLY file allowed to touch localStorage), features/<name>/ (logic + hooks +
               components per feature), components/ (older screens), browserApiShim.ts (browser preview mock).
               tooling/electron-renderer.mjs (Vite config for desktop/mac), tooling/tailwind-base.cjs (shared Tailwind).
  ui/          @nomadic/ui design system (tokens, Tailwind preset, AppShell, Button, Dialog, Drawer, Tabs, …).
               Apple design language since 1.4.0; use token classes (bg-surface, text-fg, text-fg-muted, border-line,
               text-body, text-caption, font-strong, bg-fg/[0.06]); never hardcoded slate/zinc colours or dark: variants.
  config/      plans.ts (prices/limits), features.ts (flags), legal.ts (terms/privacy/refunds), tiers.ts
  learning/    @job-automator/learning: v3 role roadmaps (src/v3: schema, normalise, progress, catalogue fallback),
               Learn v1 + v2 engine (catalog, scheduler, roadmap, path, projects, generated project library
               g.<idea>.<stack>.<b|i|a> — never rename keys), seed/bundle.json, content scripts
  form-engine/ form reading, classification, one-call AI answers, writers, verifier; core.ts = fill/verify/submit
               gate over a FormDriver; agent/ = in-page agent for Android; remote/ = Android host side
  automation/  AutoApplyEngine (fill with autoSubmit off, review, submitReviewed), ATS adapters, the user's own
               Chrome/Edge/Brave via Playwright (user-browser.ts)
  capacitor-apply-browser/  Capacitor plugin ApplyBrowser (Android WebView apply), docs/guides/ANDROID_APPLY.md
  scrapers/    job pipeline, sources, feed (companies + hackathons), news, contacts, discover, auto (the Desktop
               scraper folder's scheduler) — see scrapers.md
  supabase/    client wrappers, migrations/ (next free: 036), functions/ (Edge Functions), baseline/ (paste files)
  email-verifier/  MX checks and the SMTP sender used by Outreach
  form-bench/  22 ATS fixtures and the scorer (npm run bench:forms)
context/       this folder: project context (start at README.md)
docs/          decisions, feature list, guides (database, release, scraper laptop, Android, Mac), plans, security
scripts/       scraper-folder/ (the Desktop scraper folder), windows/ (Build Nomadic.bat, Install scraper folder.cmd,
               …), dev/ (one-off scripts), scrape-laptop.*, sign-windows.js
brand/         profile icon and GitHub profile assets (videos and carousels stay outside the repo)
```

## How an app is built

- **Windows / Mac**: `node build-main.mjs` (calls `packages/app-core/tooling/electron-main.mjs` with the app's
  `src/main.ts`) bundles the main process + preload into `out/main`; `vite build` (config from
  `packages/app-ui/tooling/electron-renderer.mjs`, `VITE_PLATFORM=windows|mac`) builds the UI into `out/renderer`;
  electron-builder packages `out/`, `assets/` and production dependencies. `@nomadic/app-core` and `@nomadic/app-ui`
  are devDependencies of the apps: they are compiled in, never shipped as folders.
- **Android**: `vite build` in `apps/android` (aliases replace Electron/Node modules with `src/host`), then
  `cap sync android` and Gradle in CI.

## Key flows

- **Sign-in**: `authenticate_user` returns a single-use `login_ticket`; `register_device_session` registers one
  active device per class (computer, or phone when the fingerprint starts `mobile-`, migration 032) (requires the
  ticket when `app_security.require_login_ticket` is on); heartbeat + `sync_pull`. Google sign-in: PKCE in the
  computer apps, ID token verified by the `google-sign-in` Edge Function, which calls the service-role-only
  `google_sign_in` and returns the same row incl. a ticket.
- **Apply** (computer apps only): `features/apply/useApplyRunner` → `startBatchCoPilot` (fills forms one at a time,
  streams per-field events) → `ApplyRunView` (review, edit, tick) → `submitAllBatchCoPilot(overrides, ids)`; the server
  quota (`consume_apply_quota`) is consumed right before each submission. Nothing is submitted without review.
- **Matching**: `features/feed/match.ts` tags job text and profile skills against the same skill catalogue as Learn;
  mastery is the higher of v1 mastery and Learn v2 progress (`masteryFromProgress`). v3 topic ticks do not feed
  mastery yet (code follow-up in status-and-roadmap.md).
- **Learn v3** (31 Oct 2026, any role): `features/learn/RoleSetup.tsx` (role, level, note; shared with both
  onboardings) → IPC `learn-role-roadmap-generate` → `services/learn-role.ts` `generateRoleRoadmap`: ai-proxy
  `roadmap_plan` with `{ format: 'tree', role, level, note }` (150 s client timeout; the proxy allows 65 s per model
  attempt) → `normaliseRoleRoadmap` (`packages/learning/src/v3/roleRoadmap.ts`: cleans text, drops links and
  placeholders, slug ids, caps counts); if the AI cannot answer, `catalogRoleRoadmap` (`v3/catalogRoadmap.ts`) for
  the 8 built-in role families → saved as the synced `roadmap` document (version 3; no migration) and returned.
  Edits: `learn-role-roadmap-save`. Capstone: `learn-capstone-generate` (`format: 'capstone'`, or a curated
  project's own stages via `catalogCapstone`) and `learn-capstone-help` (`project_help` with `role`). Progress is
  the event log: `task_done` with `topic:<module>/<topic>` or `capstone:<project>/<step>` (latest wins, `undone`
  unticks); `roleProgress` derives counts, the next topic and project readiness. Renderer: `LearnView.tsx` (setup,
  building, roadmap), `RoadmapView.tsx` (Continue card, subject tabs, modules, topic rows, edit mode),
  `ProjectsPanel.tsx` (5 projects, capstone, Ask Nomadic AI), `LearnButtons.tsx` + `learnLinks.ts` (one YouTube search
  and one ChatGPT prompt per topic or step). Home's card (`useLearnSummary`) shows the next topic with its buttons.
  `learning-get-state` returns `roleRoadmap` beside the v2 documents; a pulled `roadmap` document is accepted in
  either format. The v2 engine (scheduler, path, generated projects) and its IPC channels remain but no screen uses
  them; a student with only a v2 roadmap is asked to build it again.
- **AI**: `services/ai-proxy.ts` → `{SUPABASE_URL}/functions/v1/ai-proxy` (anon key as bearer + device session in body)
  → `consume_ai_quota` → Gemini (`gemini-2.5-flash`, JSON schema) → output checks → refund on failure.
- **News**: `services/news.ts` builds items from published rows only: company hiring snapshots, job-board bursts,
  publisher articles (`news_items`, migration 033) and hackathons/contests; every item links to its source.
- **Data freshness**: the Desktop scraper folder (scrapers.md) publishes jobs, news, hackathons, company snapshots and
  contacts on a schedule with the service-role key; the apps only read.

`services/…` paths are under `packages/app-core/src/main/`; `features/…` and `components/…` paths are under
`packages/app-ui/src/`.
