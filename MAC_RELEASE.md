# Releasing Nomadic for Mac (zero cost)

No Apple Developer Program, no paid certificate, no notarization, no paid CI. The app is **ad-hoc signed** (a
self-made signature that keeps the bundle valid and lets Apple Silicon run it). It is **not Developer ID signed and not
notarized**, so macOS asks each user to allow it once (`MAC_INSTALL.md`). Nothing here tries to get around Gatekeeper.

## What gets built

| File | Runs on | Size (1.4.0) |
|---|---|---|
| `Nomadic-<version>-mac-arm64.dmg` | Apple Silicon (M1 and later) | ~146 MB |
| `Nomadic-<version>-mac-x64.dmg` | Intel | ~153 MB |
| `Nomadic-<version>-mac-SHA256SUMS.txt` | | Checksums of both DMGs |

**Why two files, not one universal file:** a universal DMG (~225 MB) builds and passes every validation check, but in
testing (8 Oct 2026, `release-mac.yml` on GitHub's Apple Silicon and Intel runners) the universal app hung during
start-up on both chips, while the arm64 and x64 apps from the same build opened to the sign-in screen. Until that is
fixed, the release ships one DMG per chip and the website chooses between them. `--arch universal` still builds it for
investigation; do not upload it.

macOS 11 Big Sur or later (Electron 31). Bundle id `com.nomadic.career.os`, name Nomadic, version from
`apps/mac/package.json`, icon `apps/mac/build-resources/icon.icns`. Each DMG has the app and an Applications
shortcut (drag to install), compressed with LZFSE (ULFO).

## Build

### On a Mac

```
npm ci
npm run release:mac                          # arm64 + x64 DMGs
npm run release:mac -- --arch arm64          # one of them
npm run release:mac -- --launch              # also start each installed copy for 15 s
```

Output: `apps/mac/dist-electron/`. The command cleans `out/` and `dist-electron/`, builds the production main
process and renderer (`NODE_ENV=production`: minified, no source maps, no dev server), packages the DMGs with
electron-builder, ad-hoc signs (`build-resources/mac-adhoc-sign.cjs`), validates each DMG and prints the paths.

Validate a DMG on its own: `node apps/mac/scripts/validate-mac.mjs apps/mac/dist-electron/<file>.dmg`.

### Without a Mac (free GitHub Actions)

GitHub → Actions → **Release macOS** → Run workflow (`.github/workflows/release-mac.yml`). It runs the same
`npm run release:mac` on a macOS runner, then installs the arm64 DMG on an Apple Silicon runner and the x64 DMG on
an Intel runner, launches each and reads the sign-in screen. Download the DMGs from the run's artifact `Nomadic-<version>-mac`.

Cost: this repo is private. GitHub Free includes 2,000 Actions minutes a month and macOS minutes count 10×, so a
release run (about 25–35 macOS minutes) uses roughly 250–350 of them. It stays free while under the quota; Actions
stops (it does not bill) when the quota is used up unless a spending limit is set.

## What the validation checks

All with tools that come with macOS: `hdiutil verify` (image checksum), DMG layout (app + `/Applications` link),
Info.plist (`PlistBuddy`, `plutil -lint`: bundle id, name, version, executable, minimum macOS, icon),
`codesign --verify --deep --strict` (every nested binary sealed), `lipo -archs` on every Mach-O (arm64 or x86_64 as
expected), `otool -L` (no library from Homebrew, `/usr/local` or a build machine), file permissions, no
`com.apple.quarantine` in the build, app.asar contents (no `.env`, keys, app source maps, `/Users/…` paths or the
dev server URL), and `spctl --assess` for information only: it says **rejected**, which is expected without
notarization.

## Publish (website download)

The website serves stable, versioned URLs and redirects them to the files:

```
https://<site>/downloads/Nomadic-<version>-mac-arm64.dmg
https://<site>/downloads/Nomadic-<version>-mac-x64.dmg
https://<site>/downloads/Nomadic-<version>-mac-SHA256SUMS.txt
```

`apps/web/vercel.json` redirects (302) these to
`https://github.com/snipy09/nomadic-releases/releases/download/mac-v<version>/<same file name>`.

Why not put the DMGs in the website itself: GitHub rejects files over 100 MB in git, and this repo is private, so its
own Releases are not downloadable by the public. A separate **public** repository used only for release files is free,
has no bandwidth charge and allows 2 GB per file.

One-time setup:

1. Create a public GitHub repository `snipy09/nomadic-releases` with a README (a release needs at least one commit).
   Another name works: set the Actions variable `MAC_RELEASES_REPO` and change the destination in
   `apps/web/vercel.json`.
2. Optional, for one-click publishing: create a fine-grained personal access token with access to that repository only,
   permission Contents: Read and write. Save it in this repo as the Actions secret `MAC_RELEASES_TOKEN`.

Each release:

1. Bump `version` in `apps/mac/package.json` (for example 1.4.0 → 1.4.1). Each version is a new release.
2. Build (Actions → Release macOS, or `npm run release:mac` on a Mac).
3. Upload: either run **Release macOS** with **publish** ticked (creates release `mac-v<version>` with the three
   files and `MAC_INSTALL.md` as notes), or by hand: in `nomadic-releases` → Releases → Draft a new release → tag
   `mac-v<version>` → attach the two DMGs and the SHA256SUMS file → Publish.
4. Turn on the website download: set `MAC_DOWNLOAD.version` in `packages/config/src/downloads.ts` to the same
   version, push, and let Vercel deploy. While it is `null` the Download page keeps saying "coming soon".
5. Check: open `https://<site>/downloads/Nomadic-<version>-mac-arm64.dmg`; it should start the download.

The Download page (`apps/web/src/pages/Download.tsx`, `components/MacDownload.tsx`, `mac-download.ts`): when the
browser reveals the chip (Chrome, Edge, Brave via client hints, or a WebGL GPU name such as "Apple M2" / "Intel Iris")
that DMG is the main button with a "Not right?" link to the other; otherwise (Safari usually, Firefox) both are shown
as equal buttons with the About This Mac hint. No library was added for this.

## Install steps for users

See `MAC_INSTALL.md` (also on the Download page). In short: open the DMG → drag Nomadic to Applications → open it →
if blocked, **System Settings → Privacy & Security → Open Anyway** → confirm **Open Anyway** with the Mac password.
Later launches open normally.

## Test the DMG on another Mac

Use a Mac that has never run Nomadic, and download through a browser (that adds the quarantine flag, like a real user;
copying with AirDrop or USB may not):

1. Download the DMG from the website URL, not from the build folder.
2. Verify: `shasum -a 256 ~/Downloads/Nomadic-<version>-mac-arm64.dmg` (or x64) matches the SHA256SUMS file.
3. Open the DMG, check the window shows Nomadic and Applications, drag to install.
4. Open from Applications. Expect "Nomadic Not Opened" (macOS 15) or "cannot be opened because Apple cannot check
   it" (macOS 13–14). Follow `MAC_INSTALL.md` → Open Anyway.
5. Check the app opens, the sign-in screen appears, quit (Cmd+Q) and open again: no prompt the second time.
6. Repeat on the other chip (Apple Silicon and Intel), ideally on macOS 15 and one older version.
7. Activity Monitor → CPU → Kind column: "Apple" on Apple Silicon means it runs natively (not under Rosetta).

## Common problems

| Problem | Cause and fix |
|---|---|
| `npm run release:mac` says it needs macOS | DMGs can only be made on macOS. Use the Release macOS workflow. |
| "Nomadic is damaged and can't be opened" | The signature is broken or the file is incomplete. Re-download and check the SHA-256. If a fresh download still says it, the build is wrong: rebuild and make sure validation passed. Do not ask users to run Terminal commands. |
| No Open Anyway button | It shows for about an hour after a blocked launch. Open the app again, then look again. |
| Universal app hangs at start-up | Known (see above); ship arm64 + x64. To investigate: `--arch universal`, launch with `--remote-debugging-port`, `sample <pid>`. |
| Validation: "links /opt/homebrew/…" | A native module was compiled against Homebrew. Rebuild it without, or bundle the library. (Today the app has no native Node modules: SQLite is sql.js/WebAssembly.) |
| Validation: missing x86_64/arm64 in a binary | A dependency shipped a single-arch binary. Use a universal or per-arch build of it. |
| Download page still says coming soon | `MAC_DOWNLOAD.version` is `null`, or Vercel has not deployed yet. |
| `/downloads/...` returns 404 on GitHub | The release tag or file name does not match `mac-v<version>` / `Nomadic-<version>-mac-<arch>.dmg`, or the releases repo is private. |
| Apple Silicon Mac downloaded the Intel file | It runs under Rosetta 2 (macOS offers to install it), slower. Send them the arm64 file. |

## What not having the Apple Developer Program means

- Every user sees the Gatekeeper prompt once and must click Open Anyway in System Settings (since macOS 15 the old
  right-click → Open shortcut no longer skips this).
- `spctl` rejects the app; no notarization ticket; some company-managed Macs block apps that are not notarized.
- No automatic updates on Mac: Squirrel.Mac (electron-updater) installs only Developer ID signed updates. Settings →
  Updates tells users to install the new DMG (`packages/app-core/src/main/services/updates-runtime.ts`).
- The ad-hoc signature changes with every build, so macOS may ask to allow a new version once, and the Keychain may
  ask again for access to Nomadic's saved sign-in after an update.
- Hardened runtime and entitlements in `apps/mac/package.json` are only used if a real identity is configured later;
  the ad-hoc build does not apply them.
