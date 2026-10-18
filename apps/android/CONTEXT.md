# Nomadic for Android (`apps/android`)

Last updated: 7 October 2026 (renamed from `apps/mobile`). Project-wide context:
[`context/README.md`](../../context/README.md). Full guide: [`docs/guides/MOBILE_APP.md`](../../docs/guides/MOBILE_APP.md);
apply on Android (built, not wired into the app yet): [`docs/guides/ANDROID_APPLY.md`](../../docs/guides/ANDROID_APPLY.md).

Status: version 1.5.0, signed release APK sideloaded from the website, not on the Play Store. Package id `com.nomadic.career`.

## What the phone has

Everything except Practice, Projects, the apply engine and Outreach. News is the first tab (Dashboard under More); job
actions say **"Auto apply from desktop"** (saves the job to the account for the computer). Its own onboarding, bottom tab
bar, bottom-sheet drawers and touch-size controls. Saved and hidden jobs sync both ways with the computer apps.

## What this folder owns

Only Android. Changes here cannot affect the Windows or Mac apps.

| Path | What it does |
|---|---|
| `src/main.tsx` | Entry: Android back button, `bootHost()`, then `mountApp()` from `packages/app-ui`; logs `[Nomadic] host ready` (the emulator smoke test waits for it). |
| `src/host/electron.ts` | `ipcMain` / `ipcRenderer` / `contextBridge` / `shell` / `app` inside the WebView; the shared IPC handlers from `packages/app-core/src/main/ipc` register here with the same zod validation. Unregistered channels answer "This works in the Nomadic desktop app". |
| `src/host/boot.ts` | Registers what the phone offers (auth, profile, feed, billing, learner, admin, data safety, tracker, phone versions of system channels), then loads the shared preload that builds `window.api`. **Add a new channel here if the phone should have it.** |
| `src/host/db.ts` | Replaces `packages/app-core/src/main/db.ts`: the same SQLite schema and migrations (sql.js) stored in IndexedDB. |
| `src/host/device.ts` | Replaces `packages/app-core/src/main/device.ts`: per-install id, fingerprint `mobile-<sha256>` (one phone + one computer per account, migration 032). |
| `src/host/node/*`, `src/host/stubs/*` | Browser versions of `crypto`, `path`, `os`, `fs`, `http(s)`; stubs for Sentry, updater, unpdf, automation, scrapers. |
| `vite.config.ts` | `VITE_PLATFORM=android`; aliases Electron/Node modules to `src/host`; a resolve plugin swaps app-core's `db.ts`/`device.ts` for the host ones however they are imported; CSP adds `'wasm-unsafe-eval'` (sql.js). |
| `tailwind.config.cjs` | Shared Tailwind base + touch sizes (`ctl-*` = 40/44/48 px instead of 28/32/36). |
| `src/touch.css` | Phone-only sizing of tab pills, chips and scrolling tab lists. |
| `android/` | Native Capacitor project (Gradle; `versionName` and the default `versionCode` read from `package.json`). |
| `scripts/emulator-smoke.sh` | Installs the APK on an emulator and checks it boots to the sign-in screen. |

Phone-only screens that still live in `packages/app-ui` behind `IS_MOBILE` (`features/onboarding/MobileOnboarding.tsx`,
`components/shell/MobileShell.tsx`, the More page, ~18 files with `IS_MOBILE` branches): move one here (as a slot passed
to `mountApp`) the next time it changes, so phone changes stay in this folder.

## Commands

```
npm run dev:android            # the app in a browser at phone size (Vite on 5175)
npm run build:android          # web bundle in apps/android/dist
cd apps/android; npx cap sync android   # copy the bundle into the native project (needs the Android SDK)
```

CI: `android-app.yml` (vite build → `cap sync` → `gradlew assembleDebug` → emulator smoke test on API 34), artifact
`nomadic-android-debug-<run>`. `ci.yml` also builds the web bundle on every push.

Public release APK (sideloaded from the site, built on the owner's laptop since 18 Oct 2026): the Android SDK lives in
`%LOCALAPPDATA%\Android\Sdk` (`ANDROID_HOME`, gitignored `android/local.properties`), JDK 21. `versionCode` defaults to
major*10000 + minor*100 + patch so each version installs over the last. Release signing reads
`NOMADIC_ANDROID_KEYSTORE` and `NOMADIC_ANDROID_STORE_PASSWORD` (optional `_KEY_ALIAS`, `_KEY_PASSWORD`); the keystore
and its password are in `Desktop\Nomadic Content\Android signing` (README there has the build commands), never in the
repo. Every update must be signed with that same key or phones refuse to install it. Output:
`android/app/build/outputs/apk/release/app-release.apk`, published as `Nomadic-<ver>-android.apk` in
`nomadic-releases` tag `android-v<ver>`; then set `ANDROID_DOWNLOAD.version` in `packages/config/src/downloads.ts`.

Local emulator (18 Oct 2026): AVD `NomadicTest` (Pixel 7, API 35 google_apis x86_64, WHPX). Start it with
`emulator -avd NomadicTest -gpu auto`; `-gpu swiftshader_indirect` draws only half the window on this laptop.
Android back sends a cancelable Escape first: a dialog, the reset-password view or "Create account" handles it
(`preventDefault`), otherwise the app goes back in history or is minimised.

## Limits today

No Google sign-in on the phone yet (email + password), no push notifications, no Play Billing decision yet (Play
Billing vs user-choice billing for Pro/Max).
