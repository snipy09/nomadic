# Nomadic for Windows (`apps/desktop`)

Last updated: 7 October 2026. Project-wide context: [`context/README.md`](../../context/README.md).

## What this folder owns

Only what is specific to Windows. Changes here cannot affect the Mac or Android apps.

| File | What it does |
|---|---|
| `src/main.ts` | Windows entry: hardware acceleration and GPU compositing off (some Windows GPUs/drivers showed a blank or flickering window), sandbox on, then `startDesktopApp({ id: 'windows', … })` from `packages/app-core`. Quits when the last window closes. |
| `src/sandbox-fallback.ts` | When a sandboxed child exits with STATUS_DLL_NOT_FOUND, writes `%APPDATA%\Nomadic\sandbox-fallback.json` for this version and restarts once without the sandbox (the portable build restarts through its NSIS launcher with TEMP set to `%TEMP%\NomadicRestart`). `NOMADIC_DISABLE_SANDBOX=true` forces it off. Tests in `src/__tests__/`. |
| `renderer/` | `index.html`, `main.tsx` (calls `mountApp()` from `packages/app-ui`), `public/assets` (logos). Windows-only screens would go here. |
| `vite.config.ts` | Shared renderer config with `VITE_PLATFORM=windows`, dev port 5173. |
| `build-main.mjs` | Bundles `src/main.ts` + the shared preload (shared rules in `packages/app-core/tooling/electron-main.mjs`). |
| `package.json` → `build` | electron-builder: NSIS installer (`Nomadic.Setup.<ver>.exe`) + portable (`Nomadic.<ver>.exe`), `executableName` NomadicOS, `icon.ico`, GitHub releases as the update feed (Stable/Beta channels). |
| `assets/` | `icon.ico`, `logo-icon.png`, `logo.png` (the site mark from `apps/web/public/logo-icon.svg`). |
| `update-policy.json` | Forced-update floor published with each release (`release.yml`). |
| `scripts/smoke-cdp.mjs` | Read-only smoke test of a packaged build over CDP. |
| `.env` (gitignored) | `GOOGLE_OAUTH_CLIENT_ID/SECRET` etc. for local builds; real env vars win. |

Everything else the app runs (screens, services, IPC, database) comes from `packages/app-ui` and `packages/app-core`;
changing those affects all apps (CI builds all three).

## Commands

```
npm run dev:desktop            # Vite + Electron with reload
npm run build:desktop          # out/main + out/renderer
cd apps/desktop; npm run package:win   # on Windows: dist-electron\*.exe (about 10 min; close NomadicOS first)
```

CI: `ci.yml` builds it on every push; Actions → "Build Windows (unsigned)" packages it; `release.yml` (tag `v*.*.*`)
makes a signed release (needs the certificate). Bump `version` in `package.json` for each release.

## Runtime facts

- User data: `%APPDATA%\Nomadic` (local SQLite, settings, sandbox marker). Secrets in the Windows credential store via
  `safeStorage`.
- Apply opens the user's installed Chrome (else Edge, else Brave) with its own profile `%APPDATA%\Nomadic\browser_session`.
- Google sign-in: PKCE + loopback `http://127.0.0.1:42813/callback`.
- Smoke test without a person: start `win-unpacked\NomadicOS.exe --remote-debugging-port=9333` with
  `NOMADIC_DISABLE_SANDBOX=true`, then `node apps/desktop/scripts/smoke-cdp.mjs 9333`. It uses the owner's real
  profile: read only, never sign in, sign up or submit from scripts.
- Delivered builds go to `Downloads` and `Desktop\Nomadic Content\App builds`.
