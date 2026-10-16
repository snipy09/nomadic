# Build, package, test and deploy

Last updated: 7 October 2026.

## Everyday commands (repo root)

| Task | Command |
|---|---|
| Install | `npm ci --ignore-scripts` (Node 22, see `.nvmrc`) |
| Typecheck everything | `npm run typecheck` |
| Tests | `npm test` (laptop: `npx vitest run --maxWorkers=2 --testTimeout=30000`) |
| Lint | `npm run lint` (must exit 0) |
| Windows app | `npm run dev:desktop` · `npm run build:desktop` · `npm run package:desktop` (on Windows) |
| Mac app | `npm run dev:mac` · `npm run build:mac` · `npm run package:mac` (on a Mac) |
| Android app | `npm run dev:android` · `npm run build:android` (APK only in CI) |
| Website | `npm run dev:web` · `npm run build:web` |
| Scraper folder | `npm run build:scraper-folder` · `scripts\windows\Install scraper folder.cmd` |
| Tester builds | `scripts\windows\Get tester builds.cmd` (needs `gh auth login`): newest successful Windows/Mac/Android artifacts on `main` → `Desktop\Nomadic Content\Tester builds` + `Nomadic tester builds.zip`, with `READ ME FIRST.txt` install steps |
| Tester builds in the repo | `tester-builds/` (plain git; the cloud proxy blocks `lfs.github.com`, so Mac zips are split into <100 MB `.partNNN` files joined by `Join Mac zips.cmd`): 1.4.0 Windows installer + portable (cross-built on Linux with wine), Mac arm64/x64 `.app` zips (`electron-builder --mac dir`, ad-hoc signed with `rcodesign`, no DMG off macOS); built without the Google OAuth secrets, so email sign-in only. No Android APK: the cloud container cannot reach `dl.google.com` |

## CI workflows (`.github/workflows`)

- `ci.yml` (every push/PR): typecheck, lint, tests, and a build of each app (desktop, mac, android).
- `build-windows.yml` (manual): unsigned NSIS installer + portable exe artifact. `release.yml` (tags `v*.*.*`): signed
  release with `update-policy.json` (needs the code-signing certificate).
- `build-mac.yml` (manual, or pushes touching `apps/mac/`): arm64 + x64 DMGs, launched once and smoke-tested over CDP.
- `android-app.yml` (pushes touching `apps/android`, `packages/app-core`, `packages/app-ui`, shared packages): debug
  APK + emulator smoke test. `android-apply.yml`: the Android apply agent on emulators.
- `scrape.yml` (cloud job scraper, needs repo secrets), `scraper-folder.yml` (builds the Desktop scraper folder),
  `nightly-bench.yml` (form bench).

## Details

- Scraper folder: `npm run build:scraper-folder` → `dist/scraper-folder/Scraper` (esbuild bundle `bin/nomadic-scrapers.mjs`, 1.8 MB,
  needs only Node 22; Windows files rewritten with CRLF); `scripts\windows\Install scraper folder.cmd` installs it on the
  laptop; `scraper-folder.yml` uploads it as artifact `Nomadic-Scraper-folder`. Keep `scripts/scraper-folder` files ASCII
  (PowerShell 5.1 reads UTF-8 without BOM as ANSI). Try the runner without Windows: `node <bundle> auto --home <dir> --force news --dry-run`.
- Android: `npm run build:android` (web bundle); `npm run dev:android` to try it in a browser at phone size. The APK is built only in CI (`android-app.yml`: assembleDebug + emulator smoke test, artifact
  `nomadic-android-debug-<run>`); details in `docs/guides/MOBILE_APP.md`.
- Windows dev: `npm run dev:desktop` (Vite on 5173 + Electron). Mac dev (on a Mac): `npm run dev:mac` (Vite on 5176).
  Package Windows: `cd apps/desktop; npm run package:win` (about 10 minutes;
  outputs `dist-electron/Nomadic.<ver>.exe` portable, `Nomadic.Setup.<ver>.exe`, and `win-unpacked/NomadicOS.exe`).
  Kill running `NomadicOS` processes first or the files stay locked.
- Smoke test the packaged app without a person: start `win-unpacked/NomadicOS.exe --remote-debugging-port=9333` with
  env `NOMADIC_DISABLE_SANDBOX=true`, then `chromium.connectOverCDP('http://127.0.0.1:9333')` from the repo's
  `playwright-core`, find the page whose URL contains `index.html`, read `document.body.innerText`, subscribe to
  `window.api.onLog` for main-process logs. It uses the owner's real local profile and session: read only, do not sign
  in, sign up or submit applications from scripts.
- Marketing site `apps/web` (Vite 5, React 18, Tailwind 3.4): dev `npm run dev --workspace apps/web -- --port 5174`;
  check `npx tsc --noEmit` and `npm run build` in `apps/web` (client build + SSR build + `scripts/prerender.mjs`, which
  writes `dist/{index,download,terms,privacy,404}.html` and `sitemap.xml`; never add a `public/sitemap.xml`).
  Copy and sample data live in `src/content.ts` (fictional companies only; India locations; the Learn sample is a
  week-by-week path like the app's); titles/indexing in `src/seo.ts` (must not import `src/jsonld.ts`). Product claims
  must match the app: no unattended/autonomous submission, Windows first then macOS, Outreach not advertised while it
  is "Soon"; `site.test.ts` "product claims match the app" guards this for the site and the plan copy in
  `packages/config/src/plans.ts` (shown on Pricing and in the app's upgrade dialog). A new page needs a `PAGES` entry, a route in `src/App.tsx`, and prerender coverage.
  Design: Archivo variable font, ultramarine `#2338E0`, ink `#0A0F2C`, fog, marigold; no pills, no blur, 4px radius.
  Downloads are NOT public: every download CTA is `ComingSoon`; do not reintroduce a registration or alpha flow.
  Launch email list: `components/EmailSignup.tsx` → RPC `join_waitlist` (`src/waitlist.ts`, migration 023); read
  signups with SQL in the Supabase dashboard.
  Motion: `Reveal`/`CountUp`/`anim-*`, gated by `html.js`, off under `prefers-reduced-motion`; the preloader is inline
  in `index.html` (once per session). Logo: `components/Logo.tsx`, SVG sources in `public/logo*.svg`.
- Web deploy (Vercel project `nomadic-app`, live at https://nomadicai.vercel.app): the Vercel Git integration deploys
  every push to `main` that touches the site (`apps/web`, `packages/config`, root `package.json`/lockfile or
  `vercel.json` since the last successful deploy, `VERCEL_GIT_PREVIOUS_SHA`; other pushes are skipped by `ignoreCommand`). It builds from the repo root using the root
  `vercel.json` (install without scripts, `npm run build --workspace @nomadic/web`, output `apps/web/dist`, same headers
  as `apps/web/vercel.json`); before 6 Oct 2026 there was no root config and every Git deploy failed. Check a push with
  `gh api repos/snipy09/nomadic/commits/<sha>/status` (context `Vercel`). Manual fallback: the Vercel MCP
  `create_deployment` from git source (ref main, rootDirectory `apps/web`, buildCommand `npm run build`, outputDirectory
  `dist`, `forceNew: "1"`, no `teamId`). Assistant cloud containers cannot reach `*.vercel.app` (proxy 403). Smoke test:
  `/`, `/download`, `/terms`, `/privacy` → 200, unknown path → 404, `/sitemap.xml` and `/robots.txt` served.
- Mac build (7 Oct 2026, test builds only): Actions → "Build macOS (unsigned)" (`.github/workflows/build-mac.yml`,
  workflow_dispatch, also on pushes touching it or `apps/mac/`) builds `Nomadic-<ver>-arm64.dmg`
  (`macos-15`) and `-x64.dmg` (`macos-15-intel`), installs, launches and reads the first screen over CDP
  (`apps/mac/scripts/smoke-cdp.mjs`), artifacts kept 14 days. No Developer ID: `apps/mac/build-resources/mac-adhoc-sign.cjs`
  (afterPack) ad-hoc signs; users click Open Anyway once. Updates report "unsupported" on darwin
  (`packages/app-core/src/main/services/updates-runtime.ts`). Locally on a Mac: `cd apps/mac; npm run package:mac -- --arm64`. Guide: `docs/guides/MAC_APP.md`.
- Windows build without the laptop: Actions → "Build Windows (unsigned)" (`.github/workflows/build-windows.yml`,
  workflow_dispatch) builds the installer and portable exe on `windows-latest` with the Google OAuth secrets and uploads
  them as an artifact for 14 days (unsigned: SmartScreen warns). Signed releases: `release.yml` (needs the certificate).
- Leftovers cleaned 4 Oct 2026 (old installer, `install.ps1`, old `logo.png` removed). The 92 MB installer is still
  in git history (`docs/security/SECURITY_CLEANUP.md` has the rewrite steps). Flag new leftovers; do not delete unasked.
