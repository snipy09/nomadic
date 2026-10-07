# @nomadic/app-core

The Electron main process shared by the Windows (`apps/desktop`) and Mac (`apps/mac`) apps, and the IPC contract the
UI talks to. The Android app (`apps/android`) runs most of these services inside its WebView host.

- `src/main/app.ts`: `startDesktopApp(platform)`: everything an Electron app needs at startup. OS-specific behaviour
  (Chromium switches, sandbox handling, menus, keep-running-without-windows) is passed in by the app; do not add
  `process.platform` checks here when the behaviour belongs to one app.
- `src/main/ipc/`: IPC handlers, every input validated in `ipc/schemas.ts`.
- `src/main/services/`: auth, profile, apply, learning, practice, billing, admin, news, feed, outreach, updates, ...
- `src/main/db.ts`, `src/main/local-db/`: local SQLite (sql.js) with versioned migrations; never edit a shipped one.
- `src/main/preload.ts`: builds `window.api`.
- `src/shared/`: the typed IPC contract (`ipc.ts`), CSP, shared data (job roles, question vault) used by the UI too.
- `data/practice/`: practice question sets, copied next to the main bundle at build.
- `tooling/electron-main.mjs`: the esbuild build each Electron app calls from its `build-main.mjs`.

Rules: this package never imports `@nomadic/app-ui`. Changes here affect Windows and Mac (and Android where the
service is registered in `apps/android/src/host/boot.ts`); CI builds all three apps. Tests: `src/main/__tests__`
(vitest project `app-core`).
