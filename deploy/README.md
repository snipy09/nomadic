# Deployments

Every place Nomadic ships to, how it gets there and where its files live. Release guides and build launchers are in
this folder. Two kinds of file stay where their platform reads them: the Vercel configs (`/vercel.json`,
`apps/web/vercel.json`) and the CI workflows (`.github/workflows/`).

```
deploy/
  windows/        Build Nomadic.bat + build-nomadic.ps1 (local build → Downloads), sign-windows.js (Authenticode),
                  Get tester builds.cmd + get-tester-builds.ps1, RELEASE.md (signed releases, update channels)
  mac/            MAC_RELEASE.md (build, validate, publish), MAC_INSTALL.md (user steps, also the release notes),
                  MAC_APP.md (test DMGs, first launch, limits)
  tester-builds/  committed 1.4.0 test builds (Windows .exe, Mac .zip split into <100 MB parts) + READ ME FIRST.txt
```

## Targets

| Target | Where it goes | How | Workflow | Guide |
|---|---|---|---|---|
| Website `apps/web` | Vercel project `nomadic-app`, https://nomadicai.vercel.app | Git push to `main` touching the site | Vercel Git integration (root `vercel.json`) | [`context/build-test-deploy.md`](../context/build-test-deploy.md) → Web deploy |
| Windows app | GitHub Releases (signed) or local `.exe` | Tag `v*.*.*`, or `deploy\windows\Build Nomadic.bat` | `release.yml`, `build-windows.yml` (unsigned) | [`windows/RELEASE.md`](windows/RELEASE.md) |
| macOS app | Public repo `snipy09/nomadic-releases` (DMGs, ad-hoc signed) | `npm run release:mac` on a Mac, or the workflow with "publish" ticked | `release-mac.yml`, `build-mac.yml` | [`mac/MAC_RELEASE.md`](mac/MAC_RELEASE.md) |
| Android app | Debug APK artifact only (no Play Store yet) | Push touching Android or shared packages | `android-app.yml` | [`docs/guides/MOBILE_APP.md`](../docs/guides/MOBILE_APP.md) |
| Supabase (DB) | Project `nomadic` (`grqkiddfwoyicktpgdea`, Mumbai) | `bash packages/supabase/scripts/migrate.sh` | — | [`docs/guides/DATABASE_SETUP.md`](../docs/guides/DATABASE_SETUP.md) |
| Supabase Edge Functions | `ai-proxy`, `send-email-code`, `google-sign-in` (live); `razorpay-webhook` (not deployed) | `supabase functions deploy <name> --project-ref grqkiddfwoyicktpgdea` | — | [`docs/guides/DATABASE_SETUP.md`](../docs/guides/DATABASE_SETUP.md) |
| Scraper folder | Owner's laptop, `Desktop\Nomadic Content\Scraper` | `packages\scrapers\launchers\Install scraper folder.cmd` | `scraper-folder.yml` (artifact) | [`packages/scrapers/SCRAPER_LAPTOP.md`](../packages/scrapers/SCRAPER_LAPTOP.md) |
| Tester builds | `deploy/tester-builds/` or `Desktop\Nomadic Content\Tester builds` | `deploy\windows\Get tester builds.cmd` (needs `gh auth login`) | uses the newest CI artifacts | [`tester-builds/READ ME FIRST.txt`](tester-builds/READ%20ME%20FIRST.txt) |

## Before any release

```
npm run typecheck && npm run lint && npm test
npm run build:desktop && npm run build:mac && npm run build:android && npm run build:web
```

## Known state (17 Oct 2026)

- Every GitHub Actions job since 12 Oct fails in seconds with no runner assigned (account-level minutes or spending
  limit), so no fresh CI artifacts exist until that is fixed in GitHub billing settings.
- Migration 034 (in-app review) is in the repo but not applied; next new migration is 035.
- Vercel has two projects, `nomadic-app` (the live site) and `nomadic` (not referenced anywhere in the repo).
- Signing: Windows releases need the code-signing certificate secrets (`windows/RELEASE.md`); Mac has no Developer
  ID and is not notarized, so users click Open Anyway once (`mac/MAC_INSTALL.md`).
