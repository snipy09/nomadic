# Release, signing and crash reporting

## Signed releases (`.github/workflows/release.yml`)

1. Bump `version` in `apps/desktop/package.json`, commit, then tag: `git tag v1.0.7 && git push origin v1.0.7`.
2. The workflow runs typecheck, lint and tests, then builds on `windows-latest` with
   `npm run package:win -- --publish never`, verifies every `.exe` has a **Valid** Authenticode
   signature, writes `SHA256SUMS.txt`, and publishes a GitHub release with the installers,
   blockmaps and `latest.yml` (the file `electron-updater` reads).
3. Manual runs (*Actions → Release → Run workflow*) create a draft release by default.

Required repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `WIN_CSC_LINK` | Base64 of the code-signing `.pfx` (`base64 -w0 cert.pfx`), or an https URL to it |
| `WIN_CSC_KEY_PASSWORD` | The `.pfx` password |
| `SENTRY_DSN` | Optional; injected as `VITE_SENTRY_DSN` at build time |

The build fails if the signing secrets are missing (`WIN_SIGN_REQUIRED=1`) or if the tag does not
match the app version. The certificate is never committed (see `docs/SECURITY_CLEANUP.md`).

**Auto-update** still needs: `build.publish: [{ provider: 'github', owner: 'snipy09', repo: 'nomadic' }]`
in `apps/desktop/package.json` and an `electron-updater` `autoUpdater.checkForUpdatesAndNotify()` call
in the main process (owned by the main-process work stream).

## Nightly benchmarks (`.github/workflows/nightly-bench.yml`)

- **Forms:** `npm run bench:forms -- --engine=new --llm=mock --out=nightly` against the 22 offline
  fixtures; the scoreboard goes to the run summary and an artifact. Live-page runs are a stub until
  test URLs are approved.
- **Scrapers:** `scrape bench` against live sources, no database writes; report as an artifact.

## Sentry (setup notes; not wired in yet)

Crash and error reporting is **opt-in** and off by default.

1. Create a Sentry project (platform: Electron). Put the DSN in the `SENTRY_DSN` secret.
2. `npm install @sentry/electron --workspace @nomadic/desktop`.
3. Main process, first lines of `apps/desktop/src/main/index.ts`:
   ```ts
   import * as Sentry from '@sentry/electron/main';
   if (settings.telemetryOptIn && process.env.VITE_SENTRY_DSN) {
     Sentry.init({
       dsn: process.env.VITE_SENTRY_DSN,
       release: `nomadic@${app.getVersion()}`,
       sendDefaultPii: false,
       beforeSend: scrubEvent,
     });
   }
   ```
4. Renderer entry (`apps/desktop/src/renderer/main.tsx`):
   ```ts
   import * as Sentry from '@sentry/electron/renderer';
   import { init as reactInit } from '@sentry/react';
   Sentry.init({ sendDefaultPii: false }, reactInit);
   ```
5. `scrubEvent` must drop request bodies, breadcrumbs with form values, resume text, emails and
   file paths under the user's home directory. Never send profile fields or AI prompts.
6. Upload source maps in `release.yml` after the build with `@sentry/cli sourcemaps upload`
   (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` secrets).
7. Add a Settings toggle: "Send anonymous crash reports" (default off), stored in local settings, and
   mention it in the privacy section of the website.

Anonymous apply-success telemetry (REVAMP_PLAN 5) should go through the same opt-in flag and only
send counts (filled / needs-user / failed per ATS), never field values.
