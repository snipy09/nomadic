# Nomadic for Android (apps/mobile)

Status: built 7 Oct 2026, version 0.1.0, debug APK from CI (`.github/workflows/android-app.yml`). Not on the Play Store.

## What is in the APK

Everything except Practice, Projects, the apply engine and Outreach:

- Sign in, sign up, password reset, email verification (Google sign-in: not yet, see Limits).
- Onboarding (6 steps: the resume step is desktop only).
- Home (setup checklist, today's learning, applications, best matches).
- Learn (intake, roadmap, path, today, day pages, topics, quizzes, progress). Project pages inside Learn point to the
  desktop.
- Job board: feed, match %, filters, Saved, Hidden. The apply action is **"Auto apply from desktop"**: it saves the
  job to the account and says where to find it on the computer (Job board → Saved → Apply with review).
- Tracker (list as cards by default, board, notes, follow-ups), Application answers, Settings (profile, workspace,
  answers, account, data & privacy), Help, Activity log, Admin (admins), plans and upgrade.

Not in the APK (answered "This works in the Nomadic desktop app"): apply / auto apply, Outreach, Practice,
Projects (repo check, AI project help), resume files and PDF reading, AI answer drafts from a resume, portal
sign-ins, updates, the assistant.

## Save on the phone, continue on the desktop

Saved jobs live in the account (`user_saved_jobs`, `sync_push_saved_job`). Both apps pull the account's saved and
hidden jobs when the Job board opens, when the window or app comes back to the front, and when the Saved tab opens
(at most every 2 minutes, `pullAccountJobs` in `features/feed/useFeed.ts`). Local saves carry an upload marker
(`saved_jobs.synced_at`, local migration 11, `services/saved-jobs-sync.ts`): on a pull, a save the account lacks is
removed if it had been uploaded (unsaved on the other device) and uploaded if it never was.

## How it works

The APK runs the desktop renderer **and the desktop's main-process services** inside the Android WebView:

- `src/host/electron.ts`: `ipcMain` / `ipcRenderer` / `contextBridge` / `shell` / `dialog` / `app` in one JS
  context. The desktop IPC modules (`apps/desktop/src/main/ipc/*`) register as on the desktop, with the same zod
  validation; the desktop preload builds `window.api`. Unregistered channels return a desktop-only result.
- `src/host/db.ts` replaces `main/db.ts`: the same SQLite schema and migrations (`main/local-db/schema.ts`, sql.js)
  stored in IndexedDB. Like the desktop it is a cache and outbox; the server is the source of truth.
- `src/host/device.ts` replaces `main/device.ts`: a random id per install, fingerprint `mobile-<sha256>`, name from
  the WebView user agent ("Pixel 7 (Android 14)").
- `src/host/node/*`: small browser versions of `crypto` (sync SHA-256), `path`, `os`, `fs` (unavailable),
  `http(s)` (fails, so the public-IP lookup falls back). `src/host/stubs/*`: Sentry, updater, unpdf, automation, the
  scrapers (only `computeRelevanceScore` / `extractProfileKeywords` are used, from `scrapers/src/relevance.ts`).
- Registered: auth, profile, feed (saved/hidden), billing, learner (Learn v2 + AI roadmap), admin, data safety, the
  tracker channels, and phone versions of system channels (`src/host/boot.ts`).
- The renderer checks `IS_MOBILE` (`renderer/platform.ts`, `VITE_PLATFORM=android`): hidden tabs, the bottom tab bar
  (`components/shell/MobileShell.tsx`: Home, Learn, Jobs, Tracker, More), the More page, Settings as a grouped list,
  "Auto apply from desktop", no batch selection, list-first tracker, no keyboard-shortcut help.
- CSP: the desktop policy plus `'wasm-unsafe-eval'` (WebAssembly for sql.js; JS eval stays blocked).

## One computer and one phone

Migration 032 (`baseline/apply_032.sql`, owner paste) makes the single-device rule per device class: fingerprints
starting `mobile-` use the phone slot, everything else the computer slot. An account can be active on one computer
and one phone at once; a second computer or a second phone conflicts and can take over as before. The class is chosen
by the client, so the rule limits sharing to one session per class, as the desktop rule did; it is not a security
boundary (sessions stay per-device and session-checked). **Until 032 is pasted, signing in on the phone signs the
desktop out.**

## Build

- Web bundle: `npm run build -w @nomadic/mobile` (Vite, `apps/mobile/vite.config.ts`). Phone-size check in a browser:
  `npx vite preview` in `apps/mobile` and open it at 390×844.
- Android: `cd apps/mobile && npx cap sync android && cd android && ./gradlew assembleDebug` (JDK 21, Android SDK).
  Assistant containers cannot reach dl.google.com: CI builds it.
- CI (`android-app.yml`, on pushes touching the app, or run by hand): builds `app-debug.apk` (artifact
  `nomadic-android-debug-<run>`, 14 days), installs it on an API 34 emulator and fails unless the app logs
  `[Nomadic] host ready` without `start failed` or a crash; logcat, a UI dump and a screenshot are uploaded.
- Version: `apps/mobile/package.json` → `versionName`; `versionCode` is the CI run number.

## Limits and next steps

- Google sign-in: needs an Android OAuth client (package `com.nomadic.career` + signing SHA-1) and a redirect back to
  the app; email + password works (set a password with "Forgot password" if the account was Google-only).
- Release signing: needs an upload keystore (owner); the CI APK is a debug build, installable by sideloading.
- Play Store: Play Billing vs user choice billing for Pro/Max is an open decision (docs/ANDROID_APPLY.md).
- Offline: the app needs a connection to sign in and to load the feed; the local cache keeps the last data.
- Android apply with review (packages/capacitor-apply-browser) is built but not wired into this app (by decision).
