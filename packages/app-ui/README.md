# @nomadic/app-ui

The React UI shared by all three apps: Windows (`apps/desktop`), macOS (`apps/mac`) and Android (`apps/android`).
Each app calls `mountApp()` from `src/mount.tsx` in its own renderer entry and sets `VITE_PLATFORM`.

- `src/App.tsx`: shell and routing by `activeTab`; `src/platform.ts`: `PLATFORM`, `IS_MOBILE`, `IS_MAC`.
- `src/features/<name>/`: one folder per feature (pure logic + hooks + components); `src/components/`: older screens
  and the shell (`components/shell/`).
- `src/store/`: Zustand store; `preferences.ts` is the only file that touches `localStorage`.
- `src/types.ts`: the UI's view of the IPC contract (re-exports `@nomadic/app-core/shared/ipc`).
- `build/electron-renderer.mjs` (Vite config for the Electron apps), `build/tailwind-base.cjs` (Tailwind settings
  every app extends).

Rules: platform-only screens belong in the app's folder; when a shared screen must differ, read `platform.ts`.
Every screen needs loading, empty and error states and keyboard use. Changes here affect every app; CI builds all
three. Tests: `src/__tests__` (vitest project `app-ui`, jsdom).
