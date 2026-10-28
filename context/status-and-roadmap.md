# Status and what is left

Last updated: 28 October 2026. Feature status, test status, the owner's to-do list and code follow-ups.
Feature detail: [`docs/FEATURES.md`](../docs/FEATURES.md).

## Status by feature

Built and merged: F1 shell, F2 accounts + onboarding + password reset/verification + Google sign-in (server side),
F3 feed + matching, F4 apply with review, F5 tracker, F6 profile, F7 Learn v2 (roadmap, day plan, projects), F8 Practice, F9 entitlements
and quotas, F10 data safety, F11 updates/telemetry/help, F12 admin, F14 landing (Lighthouse mobile 97/100/100/100).
F13: Outreach was rebuilt in v1.1.0 (see history.md) and shows in the sidebar as "Soon" with an information screen;
the working module needs `VITE_FEATURES="outreach=on"`. Opportunity Board, Resource Vault and the Assistant stay
hidden; the Assistant still needs rework or removal.

Tests: 1,889 vitest tests pass (147 files, 7 Oct 2026 after the app split; run with `--maxWorkers=2 --testTimeout=30000`
on the owner's laptop, where the default parallelism times out component tests, and the three Chrome DOM suites can time
out closing Chrome in `afterAll`). Typecheck (`npm run typecheck`: root + desktop + mac + web + android), lint (0 errors,
164 warnings) and the builds of all three apps and the web site pass.
The built Electron app has been smoke-tested over CDP (window, live feed via IPC, Learn, Settings, Help, Activity, Admin
screens). The owner has signed in on the packaged v1.0.6 app and run apply up to the review screen on a real Lever form
(4 Oct 2026). **Not yet verified live: Google sign-in end to end, an actual reviewed submission, AI feedback.**

## What is left

Owner actions:
000000. **Release 1.6.0** (28 Oct 2026: role-aware roadmap intake, YouTube/ChatGPT lesson buttons, dates on news and
   jobs, no Tracker tab on Android). Versions in `apps/{desktop,mac,android}/package.json` are 1.6.0; the site still
   points at Windows 1.5.0, Mac 1.4.0, Android 1.5.1 because the 1.6.0 files are not uploaded. Windows: Actions →
   "Build Windows (unsigned)" artifact on `main` (or `npm run package:desktop` on the laptop), then
   `scripts\windows\make-release.ps1` and `gh release create win-v1.6.0 …`. Mac: Release macOS run on `main` (publish
   needs `MAC_RELEASES_TOKEN`; else download the artifact and `gh release create mac-v1.6.0 …`). Android: signed APK
   only on the laptop (signing key), `gh release create android-v1.6.0 …`. After each upload set the matching
   `version` in `packages/config/src/downloads.ts` (and `$Version` in `apps/web/public/install/windows.ps1` for Windows)
   and push; Vercel redeploys the site.
00000. **Android 1.5.1 with Google sign-in** (18 Oct 2026): release `android-v1.5.1` is uploaded (APK SHA-256
   `f2d66965…a1894f`, checked 27 Oct) and the site points at 1.5.1 (27 Oct). Left: upload its checksum file (the site's
   SHA-256 link 404s until then): `gh release upload android-v1.5.1 Nomadic-1.5.1-android-SHA256SUMS.txt --repo
   snipy09/nomadic-releases`, the file holding the one line `f2d66965d5492b832c921346244af687b60b82ad15e11c1b5d0347c8e6a1894f  Nomadic-1.5.1-android.apk`;
   try Google sign-in on a real phone.
0000. (Done 27 Oct 2026) In-app review: 034 applied through the connector. Read results with SQL on `app_reviews`.
000. (Done 18 Oct 2026: folder installed, first dry run's FAILED sources fixed, full dry run passes; see
   `scrapers.md`.) **Scraper folder go-live** (7 Oct 2026): migration 033 is live. On the laptop `git pull` on `main`, double-click `scripts\windows\Install scraper folder.cmd` (builds and installs `Desktop\Nomadic Content\Scraper`,
   removes the old launchers and the old "Nomadic scraper" task), then `Setup.cmd` there (reuses the key in `Desktop\Nomadic\.env`,
   optional Adzuna key, turns on the 30-minute schedule). First run `Test all sources (dry run).cmd` and fix what its
   summaries list as FAILED (news feed URLs `news/feeds.ts`, MLH/Hack2skill parsers `feed/hackathons.ts`, careers boards
   `feed/companies.ts`): none of these sites were reachable from the build container. The first scheduled jobs run expires
   the 146 of 328 live jobs that are older than 30 days (the age rule asked for). Adzuna: their terms want "Jobs by Adzuna"
   credit and a licence for ongoing commercial use.
0000. **Mac download (free, 8 Oct 2026)**: create the public repo `snipy09/nomadic-releases` with a README; optionally
   add the Actions secret `MAC_RELEASES_TOKEN` (fine-grained token, Contents read/write on that repo only); run Actions
   → Release macOS (publish ticked) or upload the artifact by hand; test the DMG on a Mac (MAC_RELEASE.md → "Test");
   then set `MAC_DOWNLOAD.version` in `packages/config/src/downloads.ts`. Also update the site FAQ "Can I download it
   yet?" / "Which operating systems" (`apps/web/src/content.ts`) when it goes live.
00. (Done 7 Oct 2026) 031 and 032 are live. The feed's first dry run is now part of action 000.
0. **Learn v2 go-live** (merged into `main` with 1.1.0): 028, 029, the content seed and the ai-proxy redeploy are
   done (5 Oct 2026). v1.2.0's 624 quiz items are live (5 Oct 2026: 864 practice items, content hash checked against the
   seed). Left: on the laptop run `npm run check-paid-only -w
   @job-automator/learning`, `npm run build-problems`, `npm run check-links -w @job-automator/learning --
   --write-seed` and `npm run build-seed` (the build container could not reach leetcode.com or the resource sites,
   so paid-only flags are a hand list and the 26 new resources stay hidden until link-checked), then regenerate and re-paste `baseline/content_seed.sql` and package the next version.
1. Keep the live data fresh (jobs seeded once on 4 Oct 2026 with 328 active India-open jobs): the Desktop scraper folder
   (action 000) does it on its own; `scrape.yml` can run jobs in the cloud once the GitHub secrets `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are set. Only jobs open to candidates in India are kept by default (`region = all` in settings.ini).
2. ~~Create the admin account~~: done 5 Oct 2026 (owner account has role `admin`, audit-logged).
3. Run the app (`npm run dev:desktop`) and test: sign-up, onboarding → roadmap, lesson, feed, apply with review,
   tracker, password reset, AI feedback.
4. ~~Google OAuth~~: done (Vault, repo secrets, local `.env`). Consent screen published to production 18 Oct 2026
   (Branding: app name Nomadic, home/privacy/terms on nomadicai.vercel.app, authorized domains `nomadicai.vercel.app` +
   `supabase.co`). Not verified by Google, so users see an "unverified app" notice until a custom domain is verified.
5. Verify a sending domain in Resend; store `email_from` in Vault.
6. **UPI direct payments** (18 Oct 2026, no gateway accepted the account): live (035 + 036 applied, UPI ID set, enabled). Left: switch to a business/merchant UPI ID when there is one (the personal handle shows the phone number in UPI apps); Windows 1.5.0 has the UPI screen; Mac 1.4.0 does not (falls back to WhatsApp). Mac 1.5.0 (same shared UPI code) was built and smoke-tested on both chips by Release macOS run 40460220222 (27 Oct); only its publish job failed because the `MAC_RELEASES_TOKEN` secret is not set. Left: `gh run download 40460220222 --repo snipy09/nomadic -n Nomadic-1.5.0-mac -D mac150` then `gh release create mac-v1.5.0 mac150/* --repo snipy09/nomadic-releases --title "Nomadic 1.5.0 for Mac" --notes-file MAC_INSTALL.md` (artifact kept 90 days at most; or add the secret and re-run with publish), then set `MAC_DOWNLOAD.version` to 1.5.0. Android 1.5.0 (signed APK, has the UPI screen) is live on the site (release `android-v1.5.0`, 18 Oct 2026); not yet installed on a real phone. Windows `win-v1.5.0` and Mac `mac-v1.4.0` releases are NOT uploaded yet, so those buttons 404 until the owner runs `gh release create` (files in `Desktop\Nomadic Content\App builds\Nomadic 1.5.0 downloads`; remake the Windows zip with `scripts\windows\make-release.ps1` first so it holds only `Nomadic.exe`). Back up `Desktop\Nomadic Content\Android signing` (losing it means users must uninstall to update). Users pay by QR/UPI link with an order reference and enter the 12-digit UTR; approve or reject in Admin → Payments after checking the bank app. Until enabled, Upgrade falls back to WhatsApp. Razorpay (if it ever approves): Then Payment Pages for Pro/Max →
   `RAZORPAY_CHECKOUT_URL_PRO/MAX`; deploy `razorpay-webhook` with its secret. Not a blocker for other work.
7. Code-signing certificate for releases; Sentry DSN if crash reports are wanted.
8. Lawyer review of the legal text; real `support@` and `grievance@` mailboxes; registered business name.
9. (Done 4 Oct 2026) `require_login_ticket` is on.
10. Review and publish Learn content (all drafts; 69 lessons have no resource yet); run the link checker.
11. Rotate the Resend and Gemini keys (they were shared in a chat) and update Vault.
12. (Done 4 Oct 2026) Migrations 024, 025 and 026 applied.
13. (Done) `GOOGLE_OAUTH_CLIENT_ID/SECRET` repository secrets.
14. Paste in the SQL editor (all three are empty/unused, checked 27 Oct 2026; the connector needs a confirmation for DROP that timed out): `DROP SCHEMA IF EXISTS zz_unused CASCADE; DROP TABLE IF EXISTS public.hr_contacts; DROP FUNCTION IF EXISTS public.billing_upi_create_order_035_retired(uuid, text, text, text);`.
15. (Done 18 Oct 2026) Every branch except `main` deleted, local and remote, `gh-pages` included (GitHub Pages was
    off; the site is on Vercel). The two with commits not in `main` are kept as tags: `archive/sweet-allen-rptho0`
    (17 Oct "repo tidy" that moves files into `deploy/` and `packages/scrapers/`; never merged, would now conflict with
    the scraper fixes) and `archive/gh-pages`.

Done in October 2026: hide job ("Not interested", local migration 5), tracker follow-up reminders (local
migration 6), feed match uses Learn mastery, mid-form cancel in apply (AbortSignal closes the tab), company question
sets gated in main by the server plan, payment history with receipts (025), no Max downgrade on payment (024),
India region filter + laptop runner for the scraper, CI green. The Ashby source skips boards whose
hosted pages are off (e.g. Cursor: the posting API still returns jobs.ashbyhq.com links that render "Page not found"
with HTTP 200), detected by Ashby's `ApiOrganizationFromHostedJobsPageName` query returning `organization: null`. Answers typed during apply review are remembered
locally (by question fingerprint and label, `services/form-answers.ts`, local migration 7 cleared the old store) and
pre-filled on later forms; model-written answers are never stored. They are listed, edited and forgotten on the
Answers page (v1.0.12), which also holds the common application answers drafted during onboarding. "Continue with Google" opens the terms first if
they are not accepted, then continues. Sandbox fallback (`apps/desktop/src/sandbox-fallback.ts`, v1.0.9): when any sandboxed
child (GPU, utility or renderer; `child-process-gone` and `render-process-gone`) exits with STATUS_DLL_NOT_FOUND, the
app writes `%APPDATA%\Nomadic\sandbox-fallback.json` for this app version and restarts without the sandbox; later
launches of that version skip the sandbox at once, and a new version tries it again. The portable build restarts
by starting `PORTABLE_EXECUTABLE_FILE` with TEMP/TMP set to `%TEMP%\NomadicRestart`: its NSIS launcher extracts to
`$TEMP\<fixed name>` and empties that folder before extracting and after exit, so two launchers sharing `%TEMP%`
delete each other's files. `NOMADIC_DISABLE_SANDBOX=true` forces it off. 1.0.7/1.0.8 showed a blank window on such
machines. A saved sign-in is handed back to the main process at launch (`features/auth/useSessionRestore.ts`) and the
user is signed out with a notice only when the server ends the session (heartbeat `ended`), never on a network error;
apply's AI form answers go through `ai-proxy`; the feed treats the column default `'unknown'` as unknown and sorts by
`posted_at`. Hidden jobs and follow-up dates sync to the account (026: `user_hidden_jobs`,
`user_applications.follow_up_at`, RPCs `sync_hide_job`/`sync_unhide_job`/`sync_pull_hidden_jobs`/
`sync_set_application_follow_up`); on pull, hidden jobs are a union and local-only ones are uploaded; for follow-ups
the newer row wins, a cloud date is never dropped by a local row without one.

Code follow-ups: form-engine DOM tests and `npm run bench:forms` need
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to an installed Chrome on this laptop (else they skip/fail to launch);
resume parsing/versions; multi-step form edits in apply; GST tax invoices (need a GSTIN; today receipts only); skill tagging in the
scraper pipeline (the app tags at runtime, so optional); event sync beyond learning; F13 decisions (Outreach launch
checklist in `docs/plans/OUTREACH_PLAN.md` section 11; the Assistant); OS notification for due follow-ups (today an in-app list).

Platform split follow-ups (7 Oct 2026): phone-only screens (`MobileOnboarding.tsx`, the phone shell inside `App.tsx`,
`IS_MOBILE` branches in ~18 files) still live in `packages/app-ui` behind `IS_MOBILE`; move each into `apps/android` (a
slot passed to `mountApp`) the next time it changes. Mac: free website distribution is in place (MAC_RELEASE.md); auto-updates,
Developer ID signing and notarisation stay off by choice (no paid Apple membership); the apply browser's Chrome/Edge/Brave lookup on macOS should be checked on a real Mac.
