# History and handoff notes

Last updated: 8 October 2026. What was built when, with the files involved. Newest work is at the end. Paths are current (after the
7 Oct 2026 split: shared UI in `packages/app-ui/src`, shared main process in `packages/app-core/src`).

- Branch `main` (remote github.com/snipy09/nomadic) holds everything. On 7 Oct 2026 every branch with unmerged work was merged (macOS DMG builds, News on the desktop, first-run tour, account-menu fix, scraper folder) and the repo was split into shared packages + three apps (see architecture.md).
  v1.2.0 (Learn path, Projects page with ~4,100 projects, AI project help) was fast-forwarded into `main` on 5 Oct 2026.
- **v1.1.0 Outreach** (`docs/plans/OUTREACH_PLAN.md`): targets everyone who can refer (recruiter/HR, hiring manager,
  founder, employee, alumni, team inbox). Contacts scraper `packages/scrapers/src/contacts/` (public pages only, no
  LinkedIn scraping or guessed emails, MX check; `npm run scrape:contacts -- --publish` with the service key) writes
  `outreach_contacts` (027, service role only), read via `outreach_list_contacts` / `outreach_report_contact`.
  Desktop: local people/messages store `main/services/outreach-store.ts` (review gate: placeholders, LinkedIn 300
  chars, edits reset review, sent is locked), SMTP send via nodemailer (`packages/email-verifier/src/sender.ts`,
  password stored locally via `writeSecret`, never uploaded, 20/day, a minute apart), Gmail/mailto/LinkedIn open, tracker entry on send; AI drafts
  via ai-proxy kind `outreach_email` (deployed) with per-plan limits `aiOutreachDraftsPerDay`. Renderer
  `features/outreach/` (OutreachView, Composer, PersonForm, DirectoryPanel, SmtpPanel, OutreachComingSoon). The old
  HR scraper, `hr_contacts` reads and Chrome outreach were deleted.
- Videos, reel/brag renders and carousels never go in the repo (`.gitignore` blocks `brag-output*/`, `reel*/`,
  `showreel/`, `instagram-carousel/`, `marketing/` and video/audio files); they live in `Desktop\Nomadic Content`.
  `.claude/` is untracked on purpose, never stage it (local assistant settings and `launch.json`; its notes are folded into build-test-deploy.md).
- Delivered build: `Nomadic-v1.2.0-portable.exe` (v1.2.0 as below; before it 1.1.0) in `C:\Users\sajal\Downloads` and `Desktop\Nomadic Content\App builds\`
  (built from `apps/desktop/dist-electron/Nomadic.1.1.0.exe`; 1.1.0: Outreach as above, shown as "Soon"; 1.0.13: a listing that names no skills is scored
  against the core skills (weight ≥ 0.8) of the role family in its title and shown as an estimate (`~N%`, "est.
  match"; `JobMatch.estimated`, `features/feed/match.ts`); `inferRole` matches whole stemmed words; the Internshala
  scraper no longer writes filler descriptions (empty instead); the Internshala adapter waits for the
  `/application/form/` page and apply reads the form once more before "No Application Form Found". 1.0.12 adds the AI onboarding (seven steps: about →
  links → resume → target → answers → workspace → roadmap; resume/LinkedIn PDF text read locally by
  `services/document-text.ts` with unpdf, external in `build-main.mjs`; drafts for common application questions via
  `services/profile-drafts.ts` → ai-proxy `form_answers`, never auto-saved), the **Answers** page (sidebar tab
  `answers`, `packages/app-ui/src/features/answers/`: common questions from `shared/applicationAnswers.ts` stored in
  `customAnswers` under `__app_<id>` keys, the user's own Q&A, and remembered apply answers that can be edited,
  forgotten or cleared), 5 IPC channels (`readDocumentText`, `draftProfileAnswers`, `listRememberedAnswers`,
  `updateRememberedAnswer`, `clearRememberedAnswers`), the Learn activity heatmap, the job board redesign, the logo
  inside the collapsible sidebar, and apply polish; 1.0.11 fixes new Greenhouse boards (phantom
  "Unlabelled field" inputs behind react-select, preferred name, country questions, yes/no questions no longer read as
  profile facts, upload groups named by their group label, uploads that swap the input for the file name), saves
  Location/Country/Preferred name/Portfolio/Years in `custom_answers_json` under reserved `__profile_*` keys
  (`shared/profileExtras.ts`, no schema change), and clears the previous account's local data when a different account
  signs in on the same computer so onboarding shows (`services/local-owner.ts`, local migration 8 `local_meta`);
  1.0.10 opens apply in the user's real browser; 1.0.9
  fixed the blank window of 1.0.7/1.0.8 via the sandbox fallback; 1.0.8 added hidden-job and follow-up account sync).
  Bump `apps/desktop/package.json` `version` for the next one.
- Apply browser (`packages/automation/src/user-browser.ts`, v1.0.10): apply opens the user's installed Chrome (else
  Edge, else Brave; a default of Chrome/Brave wins, Edge as the Windows default does not beat installed Chrome) via
  Playwright `launchPersistentContext` with `executablePath`, the sandbox on and Playwright's test flags removed
  (extensions, sync, Safe Browsing and the password manager work; no automation banner; `navigator.webdriver` false).
  Chrome 136+ refuses automation of the user's main profile, so it uses its own profile `%APPDATA%\Nomadic\browser_session`
  (`browser_session_edge`/`_brave` for others), kept between runs. Settings → Portal sign-ins opens pages in that same
  window (IPC `open-in-apply-browser` → `AutoApplyEngine.openInBrowser`), so sign-ins carry into applications. One
  session per app run; closing the window clears it and the next apply relaunches. Nothing is downloaded (Chrome for
  Testing / Playwright Chromium are no longer used for apply). (`components/DependenciesView.tsx` was removed 7 Oct 2026.)
  App icon (`apps/desktop/assets/icon.ico`, `logo-icon.png`, `logo.png`) is the site mark from `apps/web/public/logo-icon.svg`.
- Google sign-in: client id/secret are baked into the build from `apps/desktop/.env`; the app opens Google with PKCE
  and a loopback listener on `http://127.0.0.1:42813/callback`; Google accepts the client. If users see "Access
  blocked", the OAuth consent screen is still in Testing (owner action 4 in status-and-roadmap.md). Errors from the callback are shown on the
  sign-in screen as "Google sign-in did not finish: …".
- Apply review: answers the user types are remembered in local SQLite `cached_form_answers` (fingerprint `q_<16 hex>`
  and label keys; `services/form-answers.ts`; matched in `packages/form-engine/src/answerer.ts` `lookupUserAnswer`).
  Messages such as "* Please try again." in the review list come from the portal's own page, not from Nomadic.
- **Learn v2: built** (4 Oct 2026, branch `claude/learn-v2-handoff-046pu4`, version 1.0.14, not packaged: the
  build ran in a Linux container). Plan `docs/plans/LEARN_V2_PLAN.md`; what was built and what is left:
  `docs/plans/LEARN_V2_HANDOFF.md` ("Status"). Engine `packages/learning/src/v2`; main `services/learn-v2.ts`,
  `services/github-check.ts`, local migration 9 (`learn_state`, widened `learning_events`); renderer
  `features/learn/` (LearnView router, IntakeFields, ReviewScreen + AdjustPanel, Today, Week, Roadmap, Topic,
  Progress, `learnModel.ts`, `quizLogic.ts`, `catalog.ts`) and `features/projects/`. v1 PathScreen, GoalSetup,
  GoalFields, LessonScreen and learnLogic are deleted; the v1 goal RPCs (007/012) are unused but still deployed.
  Go-live steps: owner action 0 in status-and-roadmap.md.
- **v1.2.0 Learn path + Projects** (5 Oct 2026, built on `claude/relaxed-bell-eendal` and merged into `main`;
  packaged on the laptop 5 Oct 2026 as `Nomadic-v1.2.0-portable.exe`, smoke-tested over CDP): intake is one question per page (`features/learn/IntakeWizard.tsx`, `intakeSteps.ts`; onboarding's
  roadmap step uses the same pages via `IntakePage`); Learn tabs are Path / Today / Progress (`PathScreen.tsx` from
  engine `buildPath`, `DayScreen.tsx`, `DayTaskList.tsx` with the per-part "What to learn" list via `partSlice`);
  Week and Roadmap-tree screens and `IntakeFields` were deleted; the Topic page shows no resources. Review shows the
  plan week by week. Projects page = sidebar tab `learner-projects` (`features/projects/ProjectsView.tsx`,
  `ProjectLibrary.tsx`, `projectsLogic.ts`); main `services/learn-v2.ts` `projectFor` resolves generated ids for
  saves and repo checks. Generated kinds live in `packages/learning/src/v2/gen/kinds/` (frontend, backend, fullstack,
  mobile, cli, devops, data, ml), listed in `gen/index.ts`; `test/v2-gen.test.ts` builds every project in strict
  mode. AI help per stage: renderer `features/projects/projectHelp.ts` + `ProjectHelpPanel.tsx`, IPC
  `learn-project-help`, main `askProjectHelp` → ai-proxy `project_help`, plan limit `aiProjectHelpPerDay`.
- **v1.2.1 UI declutter** (6 Oct 2026, on `main`, not packaged yet): one sidebar (`components/Sidebar.tsx`: `getNavSections(workspaceMode)`
  = Learn + Jobs groups, `getFooterItems(isAdmin)` = Settings, Help, Admin; plan + Upgrade link in the footer), no Learn/Seek
  switch and no Upgrade button in the top bar (search field on the left, account menu with "Activity log" on the right);
  `PageHeader` and `FilterBar` in `@nomadic/ui` (`components/PageHeader.tsx`) are the page title and the one-row filter bar
  (selects keep their content width): use them on new screens. Job board: no stat cards, tabs All/Jobs/Internships/Best
  matches/Saved/Hidden, simpler cards (source moved to the drawer). Projects: no hero banner, empty type chips hidden.
  Practice: weak-topics column only when there are weak topics. Learn path: today card first, one combined progress card.
- **v1.3.0 Home + modern shell** (6 Oct 2026, on `main`, not packaged yet): **Home** (`features/home/`: `HomeView`,
  `homeLogic.ts` setup checklist by workspace mode, `useLearnSummary.ts` read-only Learn summary) is the landing page after
  sign-in/onboarding and the fallback route; "Get set up" checklist (profile, roadmap, resume, common answers, first
  application; hide stored by `prefs.setHomeChecklistHidden`), today's learning, applications + due follow-ups, best
  matches. No top bar any more (`components/TopBar.tsx` deleted): the sidebar holds logo + collapse, search (Ctrl+K), Home,
  the groups, Settings/Help/Admin and the account menu at the bottom (`UserMenu variant="sidebar"|"compact"`, opens
  upwards, has Activity log and Upgrade plan). Deep links: `handleNavigate(tab, intent)` sets store `tabIntent`
  (`LearnView initialTab`, `ProfileView initialSection`). Keyboard: G then H/L/P/R/J/A/W/S jumps to a page, `[` toggles
  the sidebar (`components/shell/shortcuts.ts`, ignored while typing or with a dialog open); the command palette groups
  results, shows shortcuts and has theme/sidebar/upgrade/sign-out actions. Global focus outline uses the `--nm-focus` token.
- **v1.4.0 Apple design language** (6 Oct 2026, on `main`; built unsigned by Actions run 37414936151, artifact
  `Nomadic-1.4.0-windows-unsigned` with `Nomadic.Setup.1.4.0.exe` and portable `Nomadic.1.4.0.exe`, kept until 20 Oct 2026): new palette in `packages/ui/src/tokens.ts`
  + `styles.css` (kept in sync by `tokens.test.ts`, contrast AA checked), Apple type ramp (15/22/26/34 px, `font-bold`
  for large titles), preset `borderRadius` 6/8/12/16/20, Inter variable with optical sizes (`@fontsource-variable/inter`,
  imported in `packages/app-ui/src/index.css`, served from the app so CSP `font-src 'self'` covers it), macOS source-list sidebar
  (accent glyphs, grey selection, no indicator bar), Apple segmented control and capsule filter tabs, floating inset
  drawers, coloured icon tiles in Settings, soft focus halo, theme follows the system by default. The website keeps
  its own Archivo/4px brand styles (it does not use the preset).
- **Android apply with review** (6 Oct 2026, branch `claude/android-auto-apply`): the Android app will be Capacitor
  (reuses the React renderer); its apply path is built and tested ahead of the app shell (`apps/android` does not exist
  yet). Design, API and limits: `docs/guides/ANDROID_APPLY.md`. Checks: `npm run bench:forms -- --engine=agent` (196/196, Pixel 7,
  CSP without unsafe-eval, no Playwright input), `agent.test.ts`, and `.github/workflows/android-apply.yml` (emulator API
  34/35 fills all 22 fixtures through ApplyBrowserController: 196/196 on Android 14 and 15, 6 Oct 2026). Android code cannot be compiled in assistant containers
  (dl.google.com is blocked): rely on that workflow. Open product decisions for Android: one-device rule
  (`register_device_session` deactivates other devices), Play Billing vs user choice billing for Pro/Max.
- **Android app** (7 Oct 2026, on `main`, `apps/android`, v0.1.0): see docs/guides/MOBILE_APP.md. Saved jobs sync both ways
  (pull on Job board open/focus/Saved tab, throttled 2 min; local migration 11 `saved_jobs.synced_at`). Owner: paste
  032 (applied 7 Oct 2026), then install the CI debug APK.
  On the phone the first tab is **News** (`features/news/`, IPC `get-news`, main `services/news.ts`: company hiring
  snapshots + job-board bursts + hackathons, all sourced) and the old Home dashboard is "Dashboard" under More (tab
  `dashboard`); on the desktop Home stays the dashboard (owner's choice) and News is a secondary page at the end of the Jobs group
  (tab `news`, same `NewsView`; hidden on the phone via `MOBILE_HIDDEN_TABS`). The phone has its own onboarding
  (`MobileOnboarding.tsx`: welcome → about → goal → roadmap), a Tracker button on Jobs, bottom-sheet drawers and
  touch-size controls (mobile Tailwind `ctl-*` = 40/44/48 px). Desktop changes stay out unless the owner asks.
- **Company logos** (7 Oct 2026, desktop + Android, shared renderer): `features/feed/CompanyLogo.tsx` (white plate over the
  monogram; monogram stays when there is no logo, a <32 px placeholder or an error; failed domains are not retried in the
  session) and `features/feed/companyLogoDomain.ts` (domain = curated name → domain list covering every feed company, parity-tested
  against `packages/scrapers/src/feed/companies.ts`, else the base domain of the posting URL unless it is a job board/ATS/form;
  never guessed). Images come from Google's favicon service (`www.google.com/s2/favicons`, no referrer), disclosed in the
  Privacy Policy (LEGAL_VERSION 2026-10-07). Used on job cards and drawer, Home, News, tracker (board, list, drawer,
  follow-ups) and the apply review. Add new hirers to `KNOWN_DOMAINS` there.
- **Desktop scraper folder** (7 Oct 2026, merged into `main`): one folder
  `Desktop\Nomadic Content\Scraper` with every scraper bundled (Node 22 only), `Setup.cmd`, `Start/Stop auto scraping.cmd`
  (scheduled task "Nomadic scrapers": every 30 min + at sign-in, current user, hidden via `bin\run-scheduled.vbs`), `Run ... now.cmd`,
  `Test all sources (dry run).cmd`, `Check status.cmd`; per-scraper intervals in `settings.ini` (news 3 h, jobs 6 h, hackathons
  and companies 12 h, contacts 24 h, discover weekly), state/lock/backoff in `packages/scrapers/src/auto/`, reports per scraper,
  monthly logs. New sources: careers sites + Unstop + Adzuna + discovered ATS boards on the job board, wider Internshala crawl
  (45 listings × 5 pages), 1,000 new jobs per run, 30-day job age; hiring news (`news_items`, News tab "Company news" +
  hiring plans under Hiring, `services/news.ts` `updatesFromArticles`); Hack2skill, MLH and Codeforces contests (badge
  "Contest"). Owner's ask behind it: "top 1000 companies' latest updates (e.g. Google hiring Sept–Dec for these roles)":
  covered by news articles (any company; ~430 named companies get a company tag) plus snapshots for every company with a
  readable or discovered board; there is no single source for hiring windows of 1,000 companies. Live checks: owner action 000.
- **First-run tour** (6 Oct 2026, merged 7 Oct, desktop only, not packaged): after sign-in/onboarding a
  spotlight walkthrough (`features/tour/ProductTour.tsx`, steps by workspace mode in `tourLogic.ts`) points at sidebar
  items marked `data-tour="<tab id>"` (plus `search`). Shown once per account on this computer (`prefs.getTourSeen(email)`);
  What's New waits until it closes. Replay: Help → "Take the tour", or "Take the tour" in the command palette.
- Next most useful work: owner action 000 (scraper folder) and 0 (Learn v2 go-live), then the owner actions in status-and-roadmap.md (consent screen, Resend domain, key rotation),
  then a live end-to-end pass (Google sign-in, reviewed submit, AI feedback), then the code follow-ups there.
- **App split** (7 Oct 2026): `apps/desktop` (Windows), `apps/mac` (new), `apps/android` (was `apps/mobile`) on top of
  `packages/app-core` (Electron main process, IPC contract) and `packages/app-ui` (React screens). Windows-only startup
  (GPU workarounds, sandbox fallback, NSIS/portable) moved into `apps/desktop`; the Mac app has its own entry (sandbox +
  GPU on, macOS menu, keeps running when the last window closes) and DMG packaging. CI builds all three apps on every push.
  Shared build helpers: `packages/app-core/tooling/electron-main.mjs`, `packages/app-ui/tooling/` (first named `build/`,
  which the root `.gitignore` ignores; CI was red on `main` for one push until they were renamed).
  Dead code removed: `ai-pilot-engine`, `semantic-dom-extractor`, `form-command-interpreter`, `question-classifier`,
  `standalone-tester`, `ai-url-auditor`, `test-conn`, `DependenciesView`, the web's unused `src/supabase.ts`; `animejs` dropped.

- 2026-10-08: Website legal owner set to Sajal Kumar Mishra (operating as Nomadic) with contact email/phone in `packages/config/src/legal.ts` (footer, legal pages, terms/refunds) for payment-gateway approval; LEGAL_VERSION bumped to 2026-10-08. Business address still missing.
- 2026-10-08: Removed unowned support@/grievance@nomadic.app everywhere (website, legal text, in-app support, JSON-LD); all point to the owner email until a domain mailbox exists. JSON-LD org name no longer "Nomadic Technologies".
- 2026-10-08: Added website /contact page (operator, email, phone from config), footer link, prerender + sitemap entry.
- 2026-10-08: Zero-cost Mac distribution (no Apple Developer Program): `npm run release:mac` (`apps/mac/scripts/release-mac.mjs` + `validate-mac.mjs` + `mac-release-lib.mjs`) builds ad-hoc signed universal/arm64/x64 DMGs (`Nomadic-<ver>-mac-<arch>.dmg`, ULFO, Applications link) and validates them with macOS tools; the afterPack ad-hoc hook skips the per-arch temp apps of a universal build. `release-mac.yml` builds, smoke-tests on Apple Silicon + Intel and optionally publishes to the public `snipy09/nomadic-releases`. Website: `MAC_DOWNLOAD` in `packages/config/src/downloads.ts` (null = coming soon), Download page Mac section (`components/MacDownload.tsx`, chip detection `mac-download.ts`), `/downloads/*` redirect in `apps/web/vercel.json`. Docs: `MAC_RELEASE.md`, `MAC_INSTALL.md`.
