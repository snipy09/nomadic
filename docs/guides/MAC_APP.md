# Nomadic for Mac (test builds)

The Mac app (`apps/mac`, its own folder since 7 Oct 2026; context in `apps/mac/CONTEXT.md`) builds as a `.dmg` for Apple Silicon and Intel Macs. Builds are **not signed with an
Apple Developer ID and not notarized** (that needs the Apple Developer Program, $99 a year), so they
are for testing, not for public download. The product decision stays: Windows first, macOS after beta.

## Build

- GitHub → Actions → **Build macOS (unsigned)** → Run workflow (`.github/workflows/build-mac.yml`). It
  also runs on any push that changes the workflow or `apps/mac/`.
- Two jobs: `arm64` on `macos-15` and `x64` on `macos-15-intel`. Each builds
  `Nomadic-<version>-mac-<arch>.dmg`, installs the app from it, checks the signature and architecture,
  launches it and reads the first screen over CDP (`apps/mac/scripts/smoke-cdp.mjs`, read only).
- Artifacts (14 days): `Nomadic-<version>-mac-arm64` and `Nomadic-<version>-mac-x64`, each with the
  DMG and its SHA-256.
- On a Mac: `npm run release:mac` (universal + arm64 + x64, validated), or `cd apps/mac && npm run package:mac -- --arm64`
  for a quick single-arch build; output in `dist-electron/` as `Nomadic-<version>-mac-<arch>.dmg`.

## Which file

- Apple menu → About This Mac. **Chip: Apple M1/M2/M3/M4…** → `arm64`. **Processor: Intel** → `x64`.
- macOS 11 Big Sur or later (Electron 31).

## Install and first launch

1. Open the DMG, drag **Nomadic** onto **Applications**.
2. Open Nomadic from Applications. macOS says it cannot verify the app. Click **Done** (not Move to Bin).
3. System Settings → Privacy & Security → scroll to Security → "Nomadic was blocked…" → **Open Anyway**,
   confirm with your password. Later launches open normally.
4. If macOS says the app "is damaged", the file is incomplete or the build is broken: download again and check
   the SHA-256; if it persists, rebuild. Users are never asked to run Terminal commands.

Public (free) distribution from the website: `MAC_RELEASE.md` (build, validate, publish) and `MAC_INSTALL.md`
(user steps) at the repo root. One command on a Mac: `npm run release:mac`; without a Mac: Actions → **Release macOS**.

## How it differs from Windows

- Signing: `build-resources/mac-adhoc-sign.cjs` (electron-builder `afterPack`) ad-hoc signs the app,
  because Apple Silicon will not run an app whose signature is broken. It is skipped when a real
  identity is set (`CSC_LINK`/`CSC_NAME`); the `mac` config already has hardened runtime and
  entitlements for a future signed and notarized build.
- Updates: off. Squirrel.Mac installs only signed updates, so Settings → Updates says "On Mac, install
  a new version from its DMG." Install a newer DMG over the old app; data is kept in
  `~/Library/Application Support/Nomadic`.
- Apply opens Google Chrome, Microsoft Edge or Brave from `/Applications`
  (`packages/automation/src/user-browser.ts`), with its own Nomadic profile like on Windows.
- Secrets are stored with Electron `safeStorage` (macOS Keychain); the first use may ask for Keychain access.
- Icon: `build-resources/icon.icns` (Apple's 824 px body on a 1024 px canvas, from the site mark).

## For a public Mac release (later)

Apple Developer ID Application certificate as `CSC_LINK`/`CSC_KEY_PASSWORD`, notarization with
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (electron-builder `mac.notarize`), a `zip`
target next to `dmg` for electron-updater, and then remove the Mac exception in
`packages/app-core/src/main/services/updates-runtime.ts`.
