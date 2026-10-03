# Security cleanup: purge history and rotate credentials

Step 0.2 of `REVAMP_PLAN.md` removed two files from the working tree. They are
**still in git history**, and so is every credential that was ever committed.
This runbook lists the exact commands to purge history and the credentials to
rotate. **None of these commands have been run.** Rewriting history is
destructive and needs a coordinated force-push, so the repo owner runs them.

## 1. What is in history

| Path | Introduced in | Why it matters |
|---|---|---|
| `apps/desktop/nomadic-dev.pfx` | `cd37f63` (build(win): configure Authenticode ...) | Code-signing certificate **with its private key**. Anyone with a clone can sign binaries as "Nomadic". |
| `apps/web/public/Nomadic-Setup-1.0.0.exe` | `69d022f` (feat(auto-apply): ...) | 92 MB installer. Not a secret, but it bloats every clone. Installers belong in GitHub Releases. |

Credentials also present in tracked files (current tree and history):

| Credential | Where | Severity |
|---|---|---|
| Google OAuth client secret (`GOCSPX-...`, split into parts) | `apps/desktop/build-main.mjs` | High: rotate |
| Two Gemini API keys (base64-encoded `AQ.` keys) | `apps/desktop/build-main.mjs` (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2` fallbacks) | High: rotate |
| Password of `nomadic-dev.pfx` | wherever it was shared (not found in the repo) | High: treat as known |
| Supabase **anon** key + project URL (project `jympejesevicwleptfzq`) | `build-nomadic.ps1` / `build-jobmaxxer.ps1` (history only, removed in this step), `apps/desktop/build-main.mjs`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/renderer/browserApiShim.ts`, `packages/scrapers/src/env-helper.ts`, `scripts/test-query.mjs`, `packages/supabase/scripts/purge-stale-data.ts`, `apps/web/src/supabase.ts` (URL only) | Low: public by design (see below) |
| Seeded admin password placeholder `CHANGE-ME-strong-pass` | `packages/supabase/migrations/002_secure_rls.sql` | Check the production admin password was changed |

A scan of the full history (all branches, every patch) found **no Supabase
`service_role` key**, no private keys other than the `.pfx`, and no Groq,
SendGrid, OpenAI or live Razorpay secrets. The only Razorpay value is the test
fixture `rzp_test_secret_123`.

## 2. Rotate first

Rotate before (or at the same time as) the history rewrite. Purging history
does not un-leak anything that was already cloned, forked, cached or shipped
inside a built installer.

1. **Code-signing certificate (`nomadic-dev.pfx`)**
   - CA-issued: ask the CA to **revoke** it (key compromise) and issue a new one.
   - Self-signed dev cert: stop using it. Remove it from every machine's
     certificate store where it was trusted (`certmgr.msc` -> Trusted Root /
     Trusted Publishers), then generate a new one that never goes in the repo.
   - Change the `.pfx` password anywhere it was reused.
   - Keep the new cert outside the repo and pass it at build time with
     `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (see `scripts/sign-windows.js`). In
     CI, store it as a base64 GitHub Actions secret.
2. **Google OAuth client secret**: Google Cloud Console -> APIs & Services ->
   Credentials -> the OAuth 2.0 client `762160653751-...` -> **Reset secret**.
   Then set the new value only through the `GOOGLE_CLIENT_SECRET` env var or a
   CI secret, and delete the hard-coded fallback in `apps/desktop/build-main.mjs`.
3. **Gemini API keys (x2)**: Google AI Studio / Cloud Console -> API keys ->
   delete both keys and create new ones with API and quota restrictions. They
   were compiled into earlier desktop builds. Since 017 the desktop compiles no
   Gemini key and calls the `ai-proxy` Edge Function; set the new key only as a
   Supabase secret (`GEMINI_API_KEY`).
4. **Supabase anon key**: anon keys are meant to ship in client apps, and
   access is enforced by Row Level Security. Rotating means rotating the
   project's JWT secret, which also invalidates the `service_role` key and
   every user session and breaks all installed builds. **Do not rotate** unless
   the RLS review (Phase 5) finds a table that the anon role can abuse. Do
   remove the hard-coded fallbacks so the project can be switched by env var.
5. **Supabase admin password**: confirm the admin account seeded by migration
   002 no longer uses `CHANGE-ME-strong-pass`.
6. **Optional, privacy**: `README.md` lists personal admin emails and a WhatsApp
   number. They are not credentials, but they are in history permanently unless
   added to the replace-text step below.

## 3. Purge history (git filter-repo)

Do this **after all open branches (including the `revamp/*` work) are merged**.
Every branch that is not rewritten will bring the files back, and every
collaborator must re-clone afterwards.

```bash
# 0. Install git-filter-repo (once)
pip install --user git-filter-repo        # or: brew install git-filter-repo / scoop install git-filter-repo

# 1. Work in a fresh mirror clone, and keep an untouched backup
git clone --mirror https://github.com/snipy09/nomadic.git nomadic-backup.git
git clone --mirror https://github.com/snipy09/nomadic.git nomadic-clean.git
cd nomadic-clean.git

# 2. Remove the two files from every commit on every branch and tag
git filter-repo --invert-paths \
  --path apps/desktop/nomadic-dev.pfx \
  --path apps/web/public/Nomadic-Setup-1.0.0.exe

# 3. (Recommended) Also scrub the committed secrets from file contents.
#    Create replacements.txt OUTSIDE the repo, one line per literal secret,
#    copied from the current files listed in section 1, e.g.:
#        <google-client-secret-part>==>REDACTED
#        <gemini-key-1-base64>==>REDACTED
#        <gemini-key-2-base64>==>REDACTED
#    The OAuth secret is split into three string parts in build-main.mjs, so
#    add each part as its own line. Then:
git filter-repo --replace-text ../replacements.txt

# 4. Verify nothing is left
git log --all --oneline -- apps/desktop/nomadic-dev.pfx apps/web/public/Nomadic-Setup-1.0.0.exe   # expect no output
git rev-list --objects --all | grep -Ei '\.pfx$|Nomadic-Setup.*\.exe$'                            # expect no output
git grep -nF '<one-of-the-scrubbed-literals>' $(git rev-list --all) | head                           # expect no output
git count-objects -vH                                                                              # size-pack should drop by about 90 MB

# 5. filter-repo removes the 'origin' remote on purpose; add it back and force-push
git remote add origin https://github.com/snipy09/nomadic.git
git push --force --mirror origin
```

After the push:

- **GitHub keeps old objects reachable from pull-request refs** (`refs/pull/*`),
  which cannot be force-pushed. Contact GitHub Support and ask them to remove
  cached views and run garbage collection for the repository (mention the
  file paths and the rotated credentials).
- Turn on GitHub **secret scanning** and **push protection** (Settings -> Code
  security) so new secrets are blocked at push time.
- Everyone with a clone (including other machines and git worktrees) must
  **delete it and re-clone**. Do not merge old local branches back in; that
  re-introduces the purged objects.
- Forks keep the old history. Ask fork owners to delete them, or file a GitHub
  DMCA/sensitive-data request for public forks.
- Redeploy the web app on Vercel so no cached build serves the old `.exe`.

## 4. What changed in the repo to prevent a repeat

- `.gitignore` ignores `*.pfx`, `*.p12`, `*.key`, `*.pem`, `*.cer`, `*.crt`,
  `.env` and `.env.*` (except `.env.example`), and release binaries (`*.exe`,
  `*.msi`, `*.dmg`, `*.AppImage`).
- `scripts/sign-windows.js` and `build-nomadic.ps1` read the certificate and its
  password only from `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (or
  `WIN_CERT_THUMBPRINT`) and build unsigned when they are absent.
  `WIN_SIGN_REQUIRED=1` makes a missing certificate fail the build (use it in
  release CI).
- `build-nomadic.ps1` no longer carries a baked-in Supabase URL or key; it reads
  them from the environment or `.env`.
- Installers are published to GitHub Releases (`apps/web/public/install.ps1`
  already downloads from there), not committed to `apps/web/public`.

Still to do (outside this step's scope): remove the hard-coded OAuth secret and
Gemini key fallbacks from `apps/desktop/build-main.mjs`, and the anon-key
fallbacks from the other files listed in section 1.
