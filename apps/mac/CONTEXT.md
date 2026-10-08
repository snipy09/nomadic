# Nomadic for macOS (`apps/mac`)

Last updated: 7 October 2026 (separated from the Windows app). Project-wide context:
[`context/README.md`](../../context/README.md). Install guide for testers: [`docs/guides/MAC_APP.md`](../../docs/guides/MAC_APP.md).

Status: ready for **free public distribution from the website** (no Apple Developer Program): ad-hoc signed, not
Developer ID signed, not notarised, so users allow it once with Open Anyway. Release process: `MAC_RELEASE.md`; user
steps: `MAC_INSTALL.md`. The site keeps "coming soon" until `MAC_DOWNLOAD.version` is set in `packages/config`.

## What this folder owns

Only what is specific to macOS. Changes here cannot affect the Windows or Android apps.

| File | What it does |
|---|---|
| `src/main.ts` | Mac entry: Chromium sandbox on and the GPU used (the Windows GPU workarounds and sandbox fallback do not apply), the app keeps running when the last window closes (Dock click opens a new one), then `startDesktopApp({ id: 'mac', … })`. |
| `src/menu.ts` | The macOS menu bar (app menu with About/Hide/Quit, Edit for Cmd+C/V, View, Window, Help). Tested in `src/__tests__/menu.test.ts`. |
| `renderer/` | `index.html`, `main.tsx` (`mountApp()` from `packages/app-ui`), `public/assets`. Mac-only screens go here. |
| `vite.config.ts` | Shared renderer config with `VITE_PLATFORM=mac` (`IS_MAC` in the UI), dev port 5176. |
| `build-main.mjs` | Bundles `src/main.ts` + the shared preload. |
| `package.json` → `build` | electron-builder DMG (`Nomadic-<ver>-mac-<arch>.dmg`, universal / arm64 / x64, ULFO, app + Applications link), hardened runtime + entitlements only used with a real identity, `afterPack` ad-hoc signing. No update feed (see below). |
| `build-resources/` | `icon.icns`, `entitlements.mac.plist`, `mac-adhoc-sign.cjs` (ad-hoc signs so Apple Silicon runs it; skips the per-arch temp apps of a universal build; skipped when `CSC_LINK`/`CSC_NAME` is set). |
| `scripts/release-mac.mjs` | `npm run release:mac`: clean → production build → DMGs → validate → SHA256SUMS → print paths. macOS only. |
| `scripts/validate-mac.mjs` | DMG checks with macOS tools (hdiutil, codesign, lipo, otool, PlistBuddy, spctl, xattr); helpers in `mac-release-lib.mjs` (tested in `src/__tests__/release-lib.test.ts`). |
| `scripts/smoke-cdp.mjs` | Read-only CDP smoke test used by `build-mac.yml` and `release-mac.yml`. |

Screens, services, IPC and the database come from `packages/app-ui` and `packages/app-core` (shared with Windows;
Android reuses the UI and most services).

## Commands

```
npm run build:mac              # out/main + out/renderer (works on any OS)
npm run dev:mac                # on a Mac: Vite (5176) + Electron
npm run release:mac            # on a Mac: universal + arm64 + x64 DMGs, validated (--arch universal for one)
cd apps/mac; npm run package:mac -- --arm64   # on a Mac, quick single-arch build; output in dist-electron/
```

CI: `ci.yml` builds it on every push; Actions → "Build macOS (unsigned)" (`build-mac.yml`, also on pushes touching
`apps/mac/`) builds both DMGs on `macos-15` / `macos-15-intel`, installs, launches and reads the first screen. Actions → "Release macOS" (`release-mac.yml`) runs `npm run release:mac`,
smoke-tests universal + single-arch on Apple Silicon and Intel, and with "publish" ticked creates release
`mac-v<version>` in the public repo `snipy09/nomadic-releases` (token `MAC_RELEASES_TOKEN`). The site's
`/downloads/Nomadic-<ver>-mac-<arch>.dmg` redirects there (`apps/web/vercel.json`).

## Runtime facts

- User data: `~/Library/Application Support/Nomadic`. Secrets in the macOS Keychain via `safeStorage`.
- Updates are off on Mac: Squirrel.Mac installs only signed updates, so Settings → Updates says to install a newer DMG
  (`packages/app-core/src/main/services/updates-runtime.ts`). Turning them on needs a Developer ID + notarisation.
- Apply opens the user's Chrome/Edge/Brave from `/Applications` with Nomadic's own profile; check it on a real Mac
  before calling apply supported there.
- Fonts: SF Pro from the system (the `@nomadic/ui` preset), bundled Inter elsewhere.

## Next steps

Free path (chosen): create the public `nomadic-releases` repo, run Release macOS, set `MAC_DOWNLOAD.version`
(MAC_RELEASE.md). Test apply end to end on a Mac. Paid path, only if ever wanted: Apple Developer Program → signing
identity (`CSC_LINK`/`CSC_NAME`) → notarisation → a `publish` feed → enable updates on darwin.
