# Nomadic for macOS (`apps/mac`)

Last updated: 7 October 2026 (separated from the Windows app). Project-wide context:
[`context/README.md`](../../context/README.md). Install guide for testers: [`docs/guides/MAC_APP.md`](../../docs/guides/MAC_APP.md).

Status: **test builds only**. Not signed with an Apple Developer ID and not notarised, so not for public download;
the product decision stays "Windows first, macOS after beta".

## What this folder owns

Only what is specific to macOS. Changes here cannot affect the Windows or Android apps.

| File | What it does |
|---|---|
| `src/main.ts` | Mac entry: Chromium sandbox on and the GPU used (the Windows GPU workarounds and sandbox fallback do not apply), the app keeps running when the last window closes (Dock click opens a new one), then `startDesktopApp({ id: 'mac', … })`. |
| `src/menu.ts` | The macOS menu bar (app menu with About/Hide/Quit, Edit for Cmd+C/V, View, Window, Help). Tested in `src/__tests__/menu.test.ts`. |
| `renderer/` | `index.html`, `main.tsx` (`mountApp()` from `packages/app-ui`), `public/assets`. Mac-only screens go here. |
| `vite.config.ts` | Shared renderer config with `VITE_PLATFORM=mac` (`IS_MAC` in the UI), dev port 5176. |
| `build-main.mjs` | Bundles `src/main.ts` + the shared preload. |
| `package.json` → `build` | electron-builder DMG (`Nomadic-<ver>-<arch>.dmg`, arm64 + x64), hardened runtime + entitlements ready for a future signed build, `afterPack` ad-hoc signing. No update feed (see below). |
| `build-resources/` | `icon.icns`, `entitlements.mac.plist`, `mac-adhoc-sign.cjs` (ad-hoc signs so Apple Silicon runs it; skipped when `CSC_LINK`/`CSC_NAME` is set). |
| `scripts/smoke-cdp.mjs` | Read-only CDP smoke test used by `build-mac.yml`. |

Screens, services, IPC and the database come from `packages/app-ui` and `packages/app-core` (shared with Windows;
Android reuses the UI and most services).

## Commands

```
npm run build:mac              # out/main + out/renderer (works on any OS)
npm run dev:mac                # on a Mac: Vite (5176) + Electron
cd apps/mac; npm run package:mac -- --arm64   # on a Mac (or --x64); output in dist-electron/
```

CI: `ci.yml` builds it on every push; Actions → "Build macOS (unsigned)" (`build-mac.yml`, also on pushes touching
`apps/mac/`) builds both DMGs on `macos-15` / `macos-15-intel`, installs, launches and reads the first screen.

## Runtime facts

- User data: `~/Library/Application Support/Nomadic`. Secrets in the macOS Keychain via `safeStorage`.
- Updates are off on Mac: Squirrel.Mac installs only signed updates, so Settings → Updates says to install a newer DMG
  (`packages/app-core/src/main/services/updates-runtime.ts`). Turning them on needs a Developer ID + notarisation.
- Apply opens the user's Chrome/Edge/Brave from `/Applications` with Nomadic's own profile; check it on a real Mac
  before calling apply supported there.
- Fonts: SF Pro from the system (the `@nomadic/ui` preset), bundled Inter elsewhere.

## Next steps for a public Mac release

Apple Developer Program → signing identity (`CSC_LINK`/`CSC_NAME`) → notarisation in `build-mac.yml` → a `publish`
feed in `package.json` → enable updates on darwin. Also test apply end to end on a Mac.
