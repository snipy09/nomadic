# Status and what is left

Last updated: 7 October 2026. Feature status, test status, the owner's to-do list and code follow-ups.
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
000. **Scraper folder go-live** (7 Oct 2026): migration 033 is live. On the laptop `git pull` on `main`, double-click `scripts\windows\Install scraper folder.cmd` (builds and installs `Desktop\Nomadic Content\Scraper`,
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
4. Google OAuth: done (Vault, repo secrets, local `.env`). If the consent screen is in "Testing", add testers or
   publish it, or only listed Google accounts can sign in.
5. Verify a sending domain in Resend; store `email_from` in Vault.
6. Razorpay: account under verification (4 Oct 2026); owner adds it once approved. Then Payment Pages for Pro/Max →
   `RAZORPAY_CHECKOUT_URL_PRO/MAX`; deploy `razorpay-webhook` with its secret. Not a blocker for other work.
7. Code-signing certificate for releases; Sentry DSN if crash reports are wanted.
8. Lawyer review of the legal text; real `support@` and `grievance@` mailboxes; registered business name.
9. (Done 4 Oct 2026) `require_login_ticket` is on.
10. Review and publish Learn content (all drafts; 69 lessons have no resource yet); run the link checker.
11. Rotate the Resend and Gemini keys (they were shared in a chat) and update Vault.
12. (Done 4 Oct 2026) Migrations 024, 025 and 026 applied.
13. (Done) `GOOGLE_OAUTH_CLIENT_ID/SECRET` repository secrets.
14. Paste in the SQL editor: `DROP SCHEMA IF EXISTS zz_unused CASCADE; DROP TABLE IF EXISTS public.hr_contacts;`.
15. Delete the old remote branches in the GitHub UI (keep `main` and `gh-pages`). Every branch with work was merged into
    `main` on 7 Oct 2026; the 28 older ones (`revamp/*`, `marketing/*`, `claude/launch-fixes`, `dev/auto-apply-resilience`, ...)
    come from before the history rewrite, share no history with `main`, and their content is already in it.

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
