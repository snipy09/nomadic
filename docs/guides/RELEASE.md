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

**Auto-update** (`electron-updater`, wired in `apps/desktop/src/main/services/updater.ts`):
- `build.publish` points at GitHub (`snipy09/nomadic`) and `generateUpdatesFilesForAllChannels` writes
  `latest.yml` and `beta.yml`. A version with a pre-release part (`1.2.0-beta.1`) is published as a GitHub
  pre-release and only reaches users on the **Beta** channel (Settings → Updates); **Stable** users get full releases.
- The app checks at start and every 6 hours, never downloads without the user, installs on restart or quit, and
  refuses downgrades. electron-updater verifies the installer signature against `build.win.publisherName`.
- **Forced-update floor:** `apps/desktop/update-policy.json` is uploaded with every release. A version below its
  `minimumVersion` shows a blocking "Update required" screen (with `message`). Raise it only for security fixes,
  in the release that contains the fix. The last policy seen is cached, so the floor holds offline; a missing or
  malformed policy never blocks.
- The app reads the policy from `releases/latest/download/update-policy.json` (override with `UPDATE_POLICY_URL`
  at build time).

## Nightly benchmarks (`.github/workflows/nightly-bench.yml`)

- **Forms:** `npm run bench:forms -- --engine=new --llm=mock --out=nightly` against the 22 offline
  fixtures; the scoreboard goes to the run summary and an artifact. Live-page runs are a stub until
  test URLs are approved.
- **Scrapers:** `scrape bench` against live sources, no database writes; report as an artifact.

## Sentry (opt-in crash reports)

Wired in `apps/desktop/src/main/services/telemetry.ts` (main) and `renderer/features/help/crashReporting.ts`
(renderer), using `@sentry/electron`. Off by default; the user turns it on in Settings → Data & privacy.

- `SENTRY_DSN` (repository secret) is injected at build time into the main process. A DSN only allows sending
  events, it is not a credential. Without it the toggle shows "Not available in this build".
- Main starts only with consent; the renderer SDK starts on the next launch after consent and only forwards to main.
- Every event goes through `scrubEvent`: no user, request, server name, extra data, input or console breadcrumbs,
  stack-frame variables, emails, tokens or home-directory paths. `dataCollection` turns off user info, cookies,
  headers, bodies and query parameters. Turning consent off drops events immediately.
- Feedback from Help → "Send feedback" goes to Sentry as user feedback (diagnostics attached) when crash reports
  are on; otherwise it opens an email to support with the diagnostics.
- Still to do: upload source maps in `release.yml` with `@sentry/cli` (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`), and describe crash reports in the website's privacy section.

Anonymous apply-success telemetry (REVAMP_PLAN 5) should go through the same opt-in flag and only
send counts (filled / needs-user / failed per ATS), never field values.
