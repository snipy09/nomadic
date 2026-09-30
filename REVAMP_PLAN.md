# Nomadic Revamp Plan

Basis: README, file structure, git history (201 commits), import graph, and a test run. The app was not run against live ATS forms, so Phase 0 exists to measure real failures before anything is rewritten.

## Diagnosis (what the code shows)

**Form filling is seven overlapping layers, not one engine.**
`auto-apply-engine.ts` (1,601 lines) imports and chains `fast-batch-filler`, `deterministic-form-solver`, `form-filler`, `omni-form-solver`, `ai-pilot-engine`, `navigator` and `submitter`. The four bots (Ashby/Greenhouse/Lever/Internshala) bypass it and use `OmniFormSolver` directly. `MasterProfile` is defined inside `auto-apply-engine.ts` and imported by everything, so nothing can be replaced cleanly. Fixes were added one failure at a time (see commits `e57d80a`, `446f3f4`, `c5586ad`), so behaviour depends on which layer wins. The ">95% accuracy" claim has no benchmark behind it.

**Scrapers have too many sources and no quality gate.**
`index.ts` fans out to 9 scrapers (ATS APIs, RSS, direct DOM, web search, niche boards, Internshala, Naukri, Indeed, recruiters). Naukri/Indeed/DOM/web-search scraping is fragile and needs upkeep. Sources are different shapes merged late. There's one dedup hash (company+title+url) but no freshness, closed-job detection, location/salary normalisation or per-source health tracking. Three publisher entry points exist (`publish-all`, `publish-jobs`, `cron-publisher`).

**Desktop app structure.**
`main/index.ts` is 3,846 lines with 64 IPC handlers in one file. `AdminView` (1,798 lines), `LearnerView`, `FeedView` and `ProfileView` (1,100 to 1,260 lines each) are monoliths. `browserApiShim.ts` is 1,051 lines duplicating desktop APIs for the web. There are no shared design tokens or component library, which is why it doesn't feel premium.

**Landing page.**
`apps/web/src/pages/Home.tsx` is a single 1,294-line file. Its copy, pricing and download messaging have been rewritten repeatedly (alpha, 4 tiers, 3 tiers, INR 99). It's Vite + React with no SSR, so SEO relies on meta tags.

**Health and hygiene.**
- Tests: 214 pass, 1 fails, 3 test files fail to load. The failure is `job-roles-dataset.test.ts` importing `react` from the wrong workspace.
- 101 uses of `TODO` / `as any` / `@ts-ignore` across 38 files.
- No CI config.
- `apps/desktop/nomadic-dev.pfx` (a signing cert) is committed. Remove it from history and rotate it.
- The README is stale (references missing `Scrape_All_Jobs.bat`, `dev:web` and `scrape:all`).
- Mojibake in the README and `.env.example` (encoding bug).

## Principles
1. Measure first. Build a benchmark before rewriting, so "better" is a number.
2. One pipeline per concern: one form engine, one scraper pipeline, one design system.
3. Fewer sources, higher quality. Drop what can't be kept reliable.
4. Ship in phases; the app stays working throughout.

## Phase 0: Baseline and hygiene (2-3 days)
- Fix the 4 broken test files; add GitHub Actions running typecheck, lint and tests on every push.
- Remove the `.pfx` from the repo and history, rotate the cert, and add it to `.gitignore`.
- Fix file encoding (UTF-8) and rewrite the README so every command in it works.
- **Form benchmark:** save 40 to 60 real application pages (Ashby, Greenhouse, Lever, Internshala, plus some Workday) as Playwright HAR/HTML fixtures, each with a ground-truth answer key. Report fill accuracy, wrong-answer rate and time per form.
- **Scraper benchmark:** per source, record jobs returned, % with a valid apply link, % duplicates, % stale or closed, and run time.
- Output: a baseline scoreboard. Every later phase has to beat it.

## Phase 1: Form engine rewrite (2-3 weeks), highest impact
Target architecture (new package `packages/form-engine`):
```
Profile (typed, own module)  ->  FormReader  ->  FieldClassifier  ->  Answerer  ->  FieldWriter  ->  Verifier
                                (DOM+a11y tree)  (rules, then LLM)   (profile/cache/LLM)  (per-input-type)  (re-read, check errors)
```
1. **Extract `MasterProfile`** into its own module and own its schema with zod. Nothing imports from the engine.
2. **FormReader:** normalise any page into a list of fields (label, type, options, required, group) using the accessibility tree, including iframes and shadow DOM. One code path for every ATS.
3. **FieldClassifier:** deterministic rules and the alias dictionary first; LLM only for unknown questions, in batches, with the answers cached by question fingerprint (`cached_form_answers` already exists).
4. **FieldWriter:** one writer per input type (text, textarea, select, combobox, radio, checkbox, date, file, rich text). The React setter trick, label-click for hidden checkboxes and the PDF injector move here as tested units.
5. **Verifier (the missing piece):** after filling, re-read the form, confirm each value stuck, detect validation errors, and retry only the failed fields. Never submit with unresolved required fields; surface them to the user.
6. **ATS adapters** shrink to small config and quirk files (Ashby `_systemfield_` mapping, Internshala modal) on top of the shared engine.
7. **Workday:** accept semi-automatic. Fill what it can, pause at walls (login, captcha, email verification) and hand control to the user with clear state.
8. **Delete** `fast-batch-filler`, `form-filler`, `deterministic-form-solver`, `omni-form-solver`, `ai-fallback` and the chained fallbacks in `auto-apply-engine` once the benchmark shows parity or better.
- **Exit criteria:** measured accuracy at or above 90% on the benchmark with a wrong-answer rate under 2%, and every failure reported to the user with a reason.

## Phase 2: Scraper pipeline rebuild (1-2 weeks)
1. **Tier the sources.**
   - Tier 1 (keep, invest): official public ATS APIs (Greenhouse, Lever, Ashby, plus Workable/SmartRecruiters if useful), Remotive and Internshala.
   - Tier 2 (keep if the benchmark shows they work): RSS and niche boards.
   - Tier 3 (drop or opt-in): Naukri, Indeed, web-search and generic DOM scraping.
2. **One normalised `Job` schema** (title, company, location, remote flag, salary range, employment type, posted date, apply URL, source, source job id), validated with zod at the boundary.
3. **Pipeline stages:** fetch, normalise, dedupe (company+title+location, plus canonical URL), validate link (HEAD check, closed-job phrases), classify (role family, seniority, internship or full-time), score, upsert. Reuse `canonical-link-guard` and `form-link-resolver`.
4. **Freshness:** upsert by `source + source_id`, track `first_seen` and `last_seen`, and auto-expire jobs that disappear or fail the link check.
5. **Observability:** a `scrape_runs` table with per-source counts, errors and duration; an alert when a source returns 0 or drops by more than 50%. Show it in the admin view.
6. **One entry point** (`scrape run --sources ... --publish`) replaces `publish-all`, `publish-jobs` and `cron-publisher`; run it on a schedule (GitHub Actions cron or Supabase cron).
7. Move the feed query to a proper Postgres index and view (status, posted_at, type) so the 18/36/54 pagination stays fast at scale.

## Phase 3: Design system and desktop UI (3-4 weeks)
1. **Design direction:** choose a single visual language (one accent colour, a two-weight type scale, 4/8pt spacing, consistent radii and elevation) and encode it as Tailwind tokens. Dark and light from the same tokens.
2. **Shared UI package** (`packages/ui`): Button, Input, Select, Card, Badge, Table, Dialog, Drawer, Toast, Tabs, Skeleton, EmptyState. Use it in both the desktop app and the web.
3. **Break up the monoliths:**
   - `main/index.ts` into `ipc/{auth,profile,feed,apply,outreach,admin,settings}.ts` with typed channels.
   - `AdminView`, `LearnerView`, `FeedView` and `ProfileView` into feature folders with small components and hooks.
   - Replace ad-hoc state with one store (Zustand) plus a typed data layer (TanStack Query) for the Supabase calls.
4. **Core flows, redesigned:**
   - First run: a 3-step onboarding that ends with a working profile, resume and one test application.
   - Feed: fast list with clear match reasons, saved and applied states, and keyboard navigation.
   - Apply: a live run view (what's being filled, what needs you) instead of a silent background job. Keep the batch co-pilot review drawer, rebuilt on the new form engine.
   - Applications tracker: a kanban board (draft / applied / interviewing / offer / rejected).
5. **Polish:** loading skeletons, empty states, error messages with recovery actions, motion tokens, reduced-motion support, and keyboard shortcuts (the command palette exists; extend it).
6. **Drop or hide** unfinished areas until they are good (resource vault, opportunity board, outreach) rather than shipping them half-done.
7. Remove `browserApiShim.ts` if the web portal stays marketing-only.

## Phase 3B: Learning module rebuild ("Learn" as a full product) (4-6 weeks)

### What the code shows today
- **Two sources of truth for progress.** `LearnerView.tsx` keeps the roadmap and completed concepts in `localStorage` (`nomadic_cached_roadmap`, `nomadic_completed_concepts`, `nomadic_user_deleted_all_roadmaps`) while main also saves progress to SQLite (`get/save-learner-progress`, `custom_roadmaps`). They can drift, and the streak heatmap can disagree with the checklist.
- **Roadmaps are generated by one LLM prompt in `main/index.ts`** (`generate-custom-roadmap`, onboarding synthesis) that returns the whole curriculum, including resource URLs, as raw JSON. URLs from a model are often wrong or dead, and on failure the user gets a generic fallback roadmap.
- **Content is bundled into the renderer**: `roadmaps.ts`, `jobRolesDataset.ts`, `resourceVault.ts` and a 1.2 MB `leetcodeCompaniesDataset.json`. It can't be updated without shipping a new build, can't be gated per tier, and can't be measured.
- **"Learning" is a checklist.** Completion is a manual toggle. There is no assessment, no practice, no spaced review and no link between what you learn and the jobs you apply to. `calculateReadinessScore` counts ticked boxes.
- **The vault is static reading material** (questions, textbooks, cheat sheets), with a `solutionCode` field but no runner, and the "Premium/paid" flags are cosmetic.
- `LearnerView.tsx` is 1,262 lines, `ResourceVaultView.tsx` about 38 KB, `OpportunityBoardView.tsx` a stub (about 3 KB).

### Product shape: a learning loop, not a checklist
```
Goal + level  ->  Skill graph  ->  Weekly plan  ->  Lesson + practice  ->  Check  ->  Review later  ->  Readiness  ->  Matching jobs
```

1. **Skills as data, not prose.** A maintained skill graph (skill, prerequisites, level 1-5, estimated hours) per role family, stored in Supabase and cached locally. A role is a weighted set of skills. The same skill tags are used on jobs, so "readiness for this job" is computable.
2. **Curriculum = graph + AI planning, not AI inventing content.** The model only orders and paces skills for the user's horizon and daily time (and explains why). It picks from a curated resource library. Output is validated with zod; on failure it falls back to a deterministic plan built from the graph, never a generic template.
3. **Curated, verified resource library** (table `learning_resources`): title, provider, type, duration, skill tags, level, quality score, `last_checked`, `status`. A weekly job link-checks every URL and hides dead ones. The app never shows a resource that isn't in this table, so there are no hallucinated links.
4. **Lessons and practice inside the app.**
   - Each skill node has a short lesson page (markdown, embedded video links, notes) and 5-10 practice items: quizzes (MCQ, fill-in, ordering) and coding problems.
   - Coding problems run in a sandboxed runner (Judge0 API or in-browser via Pyodide / a sandboxed iframe for JS) against hidden tests, so the `solutionCode` and test cases in the vault become real exercises.
   - Completion is earned by passing a check, with a manual "I already know this" option that triggers a short placement quiz instead of a bare toggle.
5. **Spaced repetition.** Missed or shaky questions come back on an SM-2 style schedule. A daily "Today" queue: review cards first, then the next lesson. This is the main habit driver.
6. **Real progress model.** One event table (`learning_events`: lesson_viewed, quiz_passed, problem_solved, review_done, with time spent). Streaks, the heatmap, weekly summaries and skill mastery are all derived from it.
7. **Readiness tied to jobs.** Replace the tick-count score with skill mastery vs a target role's weights, and show "you match 62% of this job; the top 3 missing skills are X, Y, Z, start now" on every card in the Feed. Finishing a skill can surface newly matching jobs. This is the feature that links Learn and Apply into one product.
8. **Interview prep as a mode of Learn.** Merge `InterviewPrepView`, the LeetCode company sets and the question bank into one "Practice" area: filter by company, role, difficulty and topic; timed mock mode; AI feedback on written answers (behavioral and system design) with a rubric; track weak topics feeding back into the review queue.
9. **Single source of truth and sync.** SQLite is the local store, Supabase the cloud store, with a simple last-write-wins sync per event (events are append-only, so merging is safe). Delete the `localStorage` keys and migrate existing users' data on first launch.
10. **Content pipeline and ops.** Content lives in Supabase (with an admin editor in `AdminView` or a simple markdown repo), versioned and cacheable offline. The 1.2 MB dataset moves out of the renderer bundle and is fetched and cached. Each lesson and problem has a thumbs up/down and a "report issue" button.
11. **Gating that makes sense.** Free: one active track, core lessons, limited daily practice. Paid: unlimited tracks, AI coach and feedback, mock interviews, company sets, offline packs. Enforce server-side (the tier gate already exists).

### Screens (all built on the Phase 3 design system)
- **Today:** review queue, next lesson, streak, weekly goal ring.
- **My Path:** visual skill graph/timeline with locked, in-progress and mastered states; change goal or pace without losing progress.
- **Lesson:** content, resources, practice, and a "mark complete" that is gated by the check.
- **Practice:** question bank, company sets, mock interviews, history.
- **Progress:** mastery by skill, time invested, readiness per target role, weekly report.
- **Explore:** roles, salary ranges and opportunities (fellowships, hackathons), each linked to the skills it needs. Build this properly or hide it.

### Build order inside this phase
1. Data model and migration (events, skills, resources); one-time import of existing `localStorage`/SQLite progress.
2. Skill graph and resource library for the top 8 to 10 role families (seed from the existing `roadmaps.ts` and `jobRolesDataset.ts`, then clean up), plus the link checker.
3. Planner (deterministic first, LLM second) and the Path screen.
4. Lesson, quiz and code-runner flow; Today queue and spaced repetition.
5. Readiness score and the Feed integration.
6. Merge interview prep into Practice; AI feedback.
7. Sync, offline caching, admin content tools, analytics.

### Exit criteria
Zero dead links in shown resources; progress identical across restart, reinstall (via cloud sync) and devices; a new user reaches a first completed lesson in under 3 minutes; day-7 learner retention and lessons-per-week are tracked from day one.

## Phase 4: Landing page and brand (1-2 weeks)
1. **Move to Next.js or Astro** for real SEO and performance; split `Home.tsx` into section components.
2. **Structure:** hero with a short product demo video or loop, a three-step "how it works", the core benefit (apply to more jobs with less typing), social proof once available, pricing (one canonical table), FAQ, and a single primary call to action (download, or join the waitlist during alpha).
3. **Trust:** a real privacy and data-handling section (what stays local, what goes to Supabase, what the AI sees). Auto-apply tools live or die on this.
4. **Pick one pricing story** and keep the web, app and admin in sync from a single config file.
5. Performance budget: Lighthouse 95+ on mobile; proper OG images; a sitemap generated at build.

## Phase 5: Reliability and release (ongoing)
- Crash and error reporting (Sentry) in the desktop app; anonymous opt-in telemetry for apply success rate.
- Auto-update channel with signed builds (the CI job builds and signs with a cert stored in secrets).
- Nightly job that re-runs the form benchmark against live pages and posts the score.
- Security pass: Electron hardening (contextIsolation, sandbox, CSP, remove any remaining bypasses), RLS review of every Supabase table, and secret storage via the OS keychain rather than SQLite for the Groq and SMTP keys.

## Suggested order and rough effort
| Order | Phase | Effort | Why this order |
|---|---|---|---|
| 1 | 0 Baseline | 2-3 days | Makes the rest measurable |
| 2 | 1 Form engine | 2-3 weeks | Your biggest pain and the core product |
| 3 | 2 Scrapers | 1-2 weeks | Feeds the product; smaller than the form engine |
| 4 | 3 Design system and UI | 3-4 weeks | Biggest "premium" lift; can start in parallel after Phase 0 |
| 5 | 3B Learning module | 4-6 weeks | Needs the design system; data model work can start in Phase 2 |
| 6 | 4 Landing page | 1-2 weeks | Best done once the product story is settled |
| 7 | 5 Release hardening | ongoing | |

About 13-18 weeks for one developer, roughly 8-11 with two people (form engine and scrapers in parallel with design system and learning). The landing page should show the finished product, so it goes last.

Product story after the revamp: **Learn the skills, see which jobs you match, apply automatically.** Learn, Feed and Apply share one skill model, which is what makes it a single SaaS instead of several tools.

## Decisions needed from you
1. **Scope of scraping:** India-focused (Internshala, Naukri) or global ATS-first?
2. **Platform:** stay Windows-only for now, or also macOS?
3. **Landing page:** stay on Vite, or move to Next.js/Astro?
4. **Monetisation:** confirm the final tiers and prices (code shows both INR 99 alpha and Free/Pro/Max at 249/599).
5. **Which features to cut** until they are good (outreach, vault, opportunity board).
6. **Learning content:** which 8 to 10 role families first, and who writes or curates lessons (you, AI-drafted and reviewed, or curated links only at launch)?
7. **Code practice:** hosted runner (Judge0, small recurring cost) or in-browser only (JS and Python, free but limited)?

---

# Step-by-step execution prompts for Claude

How to use: give Claude **one step at a time**, in order. Each prompt is self-contained. Start every step in a fresh session on its own git branch, and do not start the next step until the "Done when" checks pass and the work is merged. Every step ends with: typecheck, lint and tests green, then a short summary of what changed. Read `REVAMP_PLAN.md` first in every session.

Shared rules to paste at the top of each session:
> Repo: `C:\Users\sajal\OneDrive\Desktop\Nomadic` (Electron desktop app, React/Vite web app, packages for automation, scrapers, email-verifier, supabase). Read `REVAMP_PLAN.md`. Work on branch `revamp/<step-name>`. Make small commits. Do not change behaviour outside this step's scope. Do not delete old code until the replacement passes its tests/benchmark. Run `npx tsc --noEmit` and `npm test` before finishing. Never commit secrets or certificates.

## Step 0.1: Fix tests and add CI
> Fix the 4 failing test files (e.g. `apps/desktop/src/main/__tests__/job-roles-dataset.test.ts` fails with "Cannot find package 'react'"). Use a vitest workspace/projects config so renderer tests run with the desktop app's dependencies (jsdom environment where needed). Add `.github/workflows/ci.yml` running install, typecheck, lint and tests on push and PR. Add ESLint and Prettier if missing, with a lenient baseline so CI passes today.
> Done when: `npm test` is fully green locally and CI passes on the branch.

## Step 0.2: Security and hygiene cleanup
> Remove `apps/desktop/nomadic-dev.pfx` from the repo (add `*.pfx`, `.env*` except `.env.example` to `.gitignore`), update `scripts/sign-windows.js` to read the cert path/password from environment variables, and tell me the exact commands to purge it from git history and which credentials to rotate. Fix the mojibake (re-save README.md and `.env.example` as UTF-8). Rewrite README so every command is real: map `Scrape_All_Jobs.bat`, `dev:web`, `scrape:all` to actual scripts, adding the scripts to root `package.json` where missing. Do not rewrite marketing copy yet.
> Done when: every command in the README runs; no secrets in the working tree.

## Step 0.3: Form-filling benchmark
> Create `packages/form-bench`. Build a fixture system: save real application pages (Ashby, Greenhouse, Lever, Internshala, plus 5 Workday/other) as static HTML snapshots with a script to capture new ones via Playwright (I will supply URLs; leave placeholders). For each fixture add `expected.json` (field label -> expected value for a sample candidate profile). Write a runner that loads a fixture in Playwright, runs the **current** engine (`packages/automation`), and reports per-form: fields found, fields filled, correct, wrong, skipped, and time. Output a JSON and a markdown scoreboard in `packages/form-bench/results/baseline.md`.
> Done when: `npm run bench:forms` produces the baseline scoreboard for at least 20 fixtures.

## Step 0.4: Scraper benchmark
> Add a metrics mode to `packages/scrapers`: run each source and record jobs returned, % with a reachable apply URL (HEAD/GET), % duplicates across sources, % showing closed/expired signals, and run time and errors. Write `packages/scrapers/results/baseline.md`. No refactoring yet.
> Done when: `npm run scrapers:bench` outputs one row per source.

## Step 1.1: Extract the profile and define the form-engine contracts
> Create `packages/form-engine`. Move `MasterProfile` out of `packages/automation/src/auto-apply-engine.ts` into `packages/form-engine/src/profile.ts` with a zod schema, and re-export from the old location so nothing breaks. Define the interfaces only (no logic): `FormField`, `FieldKind` (text, textarea, select, combobox, radio, checkbox, date, file, richtext), `FormReader`, `FieldClassifier`, `Answerer`, `FieldWriter`, `Verifier`, and `FillReport`. Add unit tests for profile validation.
> Done when: the old code compiles unchanged, the new package builds, and the benchmark still matches the baseline.

## Step 1.2: FormReader
> Implement `FormReader` using Playwright: walk the page (including iframes and open shadow DOM) and return normalized `FormField[]` with label (aria-label, `<label for>`, wrapping label, legend, nearby text), type, options, required, group, and a stable selector. Test it against every fixture in `form-bench` and report field-detection recall against the answer keys.
> Done when: at least 95% of fields in the answer keys are detected.

## Step 1.3: FieldWriter (one writer per input type)
> Implement a writer per `FieldKind`, moving the proven tricks out of `omni-form-solver.ts` into small tested units: the React value-setter override with `input/change/blur` events, label-click for hidden (opacity 0) checkboxes and radios, combobox/custom dropdown selection, date inputs, and resume upload (including the PDF injector). Each writer must read the value back and return success or failure. Add tests per writer against small local HTML pages.
> Done when: writer tests pass and each returns a verifiable result.

## Step 1.4: FieldClassifier and Answerer
> Implement the classifier: map each `FormField` to a profile key or question type using the alias dictionary and rules first (`alias-dictionary.ts`, `question-classifier.ts`). Implement the answerer: profile value, then `cached_form_answers`, then LLM (Groq) in **one batched call** for the remaining fields, with answers cached by question fingerprint. Legal/consent/arbitration and EEO questions follow explicit policy in a config file (I will review it), not model output. Never invent facts about the candidate: return "needs user" when the profile has no answer.
> Done when: unit tests cover each branch and the LLM is called at most once per form.

## Step 1.5: Verifier and the new engine
> Implement the `Verifier`: after filling, re-read the form, confirm values stuck, detect validation errors and required-but-empty fields, and retry only those fields (max 2 retries). Wire reader, classifier, answerer, writers and verifier into `FormEngine.fill(page, profile) -> FillReport`. The engine must never click submit; submission is a separate explicit step, blocked if required fields are unresolved. Add a `--engine=new|old` flag to the benchmark.
> Done when: the benchmark shows the new engine at or above the old one on accuracy, with a wrong-answer rate under 2%, and every unresolved field reported with a reason.

## Step 1.6: Migrate the bots and the apply flow
> Reduce `ashby-bot`, `greenhouse-bot`, `lever-bot` and `internshala-bot` to thin adapters (navigation, quirks, submit button detection) on top of `FormEngine`. Replace the chain in `auto-apply-engine.ts` with: navigate, `FormEngine.fill`, review state, submit. Emit structured progress events (`field_filled`, `needs_user`, `error`) for the UI. For Workday or login walls: fill what is possible, then pause and emit `needs_user`. Keep the old engine behind a feature flag until Step 1.7.
> Done when: the apply flow works end to end on the benchmark fixtures and on 3 live test applications that I approve.

## Step 1.7: Delete the legacy solvers
> After the benchmark confirms parity or better, delete `fast-batch-filler.ts`, `form-filler.ts`, `deterministic-form-solver.ts`, `omni-form-solver.ts`, `ai-fallback.ts`, and dead code in `auto-apply-engine.ts`, along with their tests. Update imports and docs. Run the full test suite and benchmark.
> Done when: no references remain, tests and benchmark are green, and the diff is mostly deletions.

## Step 2.1: Normalized job schema and source tiers
> In `packages/scrapers`, define a zod `Job` schema (title, company, location, remote, salary min/max/currency, employment type, posted date, apply URL, source, source job id, raw) and adapters that normalize each existing scraper to it. Mark sources as tier 1 (official ATS APIs, Remotive, Internshala), tier 2 (RSS, niche boards) or tier 3 (Naukri, Indeed, web search, direct DOM). Make tier 3 opt-in via config. Keep behaviour for tier 1 and 2 otherwise.
> Done when: all sources emit the normalized schema and invalid records are logged and dropped.

## Step 2.2: Pipeline stages and freshness
> Build the pipeline: fetch, normalize, dedupe (company + title + location and canonical URL), link validation (reuse `canonical-link-guard` and `form-link-resolver`, detect closed-job phrases), classify (role family, seniority, internship vs full-time), score, upsert by `source + source_id` with `first_seen`, `last_seen`, `status`. Mark jobs as expired when they disappear or fail validation. Add a Supabase migration for the new columns and an index for the feed query (status, posted_at, type).
> Done when: re-running twice creates no duplicates and expired jobs are hidden from the feed.

## Step 2.3: Single entry point and observability
> Replace `publish-all`, `publish-jobs` and `cron-publisher` with one CLI (`scrape run --sources ... --publish`). Add a `scrape_runs` table (per-source counts, errors, duration) and an alert when a source returns 0 or drops more than 50% versus its last run. Show the runs in the admin view. Add a scheduled GitHub Actions workflow for it.
> Done when: one command runs the whole pipeline, and the benchmark shows improvement over the baseline in valid-link rate and duplicates.

## Step 3.1: Design system
> Create `packages/ui` with Tailwind design tokens (colour, type scale, 4/8pt spacing, radii, elevation, motion durations, light and dark) and these components: Button, IconButton (with tooltip), Input, Select, Checkbox, Switch, Tabs, Card, Badge, Table, Dialog, Drawer, Toast, Skeleton, EmptyState, ProgressRing, Kbd. Add a small Storybook or a `/design` page that shows all of them. Follow the UX skills available in this environment (spacing, typography, colour, anti-slop, keyboard, empty states, loaders). Do not migrate screens yet.
> Done when: every component has keyboard support, focus rings, and reduced-motion handling, and the showcase page renders both themes.

## Step 3.2: Split the main process
> Split `apps/desktop/src/main/index.ts` (3,800+ lines, 64 IPC handlers) into `main/ipc/{auth,profile,feed,apply,outreach,learner,admin,settings,assistant}.ts` and a typed channel map shared with `preload.ts`. Move business logic out of handlers into services. No behaviour change.
> Done when: `index.ts` is under 400 lines, all IPC calls are typed end to end, and tests pass.

## Step 3.3: State and data layer
> Introduce a single store (Zustand) and typed data hooks (TanStack Query) in the renderer. Move `App.tsx` state into it. Remove scattered `localStorage` usage for app data (keep only UI preferences). No visual changes.
> Done when: no app data lives in `localStorage` outside the preferences module.

## Step 3.4: Migrate the shell and core screens
> Rebuild, one PR each, on `packages/ui`: app shell (Sidebar, TopBar, CommandPalette), Onboarding, Feed, Applications (kanban), Profile and Settings, and the apply run view (live progress of what is being filled and what needs the user, using the events from Step 1.6). Break `FeedView`, `ProfileView` and `AdminView` into feature folders with small components. Include loading skeletons, empty states, and error states with a recovery action. Hide unfinished features (outreach, opportunity board) behind a flag until they are good.
> Done when: each screen works at 1024 px and larger, passes keyboard-only use, and the old components are deleted.

## Step 3B.1: Learning data model and migration
> Add SQLite and Supabase migrations for `skills`, `skill_prerequisites`, `role_skills` (weights), `learning_resources` (url, provider, type, duration, skill tags, level, status, last_checked), `lessons`, `practice_items`, and an append-only `learning_events` table. Write a one-time migration that imports existing progress from `localStorage` (`nomadic_cached_roadmap`, `nomadic_completed_concepts`) and `custom_roadmaps`/learner progress into events. Keep the old tables until the new UI ships.
> Done when: migration runs idempotently and existing users' progress is preserved (test with fixtures).

## Step 3B.2: Skill graph and resource library
> Seed the skill graph and resource library for the top role families (I will name them; default: frontend, backend, full stack, data analyst, data/ML, product manager, design, DevOps) from `roadmaps.ts` and `jobRolesDataset.ts`, cleaned and deduplicated. Write a link checker (scheduled job) that verifies every resource URL, records status, and hides dead ones. Move bundled datasets (including the 1.2 MB LeetCode JSON) to the backend with local caching.
> Done when: every shown resource passes the link check and the renderer bundle no longer includes the large datasets.

## Step 3B.3: Planner and My Path
> Replace the LLM "generate whole roadmap" prompts with: a deterministic planner that orders skills by prerequisites and fits them to the user's horizon and daily time, plus an optional LLM step that only explains and adjusts the plan, validated with zod. No URLs are ever generated by the model. Build the My Path screen (timeline or graph with locked, in-progress and mastered states) and allow changing goal or pace without losing progress.
> Done when: generation always returns a valid plan (no generic fallback), with tests for several roles and time budgets.

## Step 3B.4: Lessons, practice, and the Today queue
> Build the Lesson screen (content, resources, practice) and the practice engine: quizzes (MCQ, fill-in, ordering) and coding problems with a sandboxed runner (use the option I pick: hosted Judge0 or in-browser). Completion requires passing a check, with an "I already know this" placement quiz. Implement SM-2 spaced repetition and the Today screen (reviews first, then the next lesson, streak, weekly goal). All progress is written as `learning_events`; streaks, heatmap and mastery are derived from them.
> Done when: a new user can finish a first lesson in under 3 minutes, and failed questions reappear on schedule (covered by tests).

## Step 3B.5: Readiness and job matching
> Replace `calculateReadinessScore` with skill mastery against target role weights. Tag jobs with skills in the scraper pipeline, and show "% match and top missing skills" on Feed cards with a "start learning" action that opens the right lesson. Notify the user when a finished skill unlocks newly matching jobs.
> Done when: the match score is computed from the same skill IDs on both sides and is covered by tests.

## Step 3B.6: Practice area and interview prep
> Merge `InterviewPrepView`, the question bank and company sets into one Practice area: filters (company, role, difficulty, topic), timed mock mode, AI feedback on written answers using a rubric (the model must quote the answer and score each rubric item), and weak-topic tracking that feeds the review queue. Enforce free vs paid limits server-side.
> Done when: weak topics appear in the Today queue and limits are enforced by the server, not the client.

## Step 3B.7: Sync, offline, admin content tools
> Add event-based sync between SQLite and Supabase (append-only, merge by event ID), offline caching of lessons, an admin screen to edit skills, lessons, resources and practice items with versioning, and thumbs/report buttons on content. Remove the old learner tables and code paths once everything is verified.
> Done when: progress is identical after reinstall and sign-in, and the old `localStorage` and table code is deleted.

## Step 4.1: Landing page rebuild
> Rebuild `apps/web` on Next.js (or Astro, per my decision) with `packages/ui` tokens. Split `Home.tsx` into sections: hero with a short product demo, how it works (Learn, Match, Apply), features, privacy and data handling (what stays local, what goes to Supabase, what the AI sees), pricing (rendered from one shared config also used by the desktop app and admin), FAQ, and a single primary call to action. Generate OG images and the sitemap at build; add JSON-LD. Keep the legal pages.
> Done when: Lighthouse mobile is 95 or higher for performance, SEO and accessibility, and pricing is defined in exactly one place.

## Step 5.1: Release hardening
> Add Sentry (desktop main and renderer, opt-in telemetry), a signed build and auto-update pipeline in CI using secrets, a nightly workflow that runs the form benchmark and posts the score, Electron hardening (contextIsolation, sandbox, CSP, remove devtools shortcuts in production, validate all IPC inputs), an RLS review of every Supabase table with tests, and moving the Groq and SMTP keys from SQLite to the OS keychain.
> Done when: a tagged release builds, signs and publishes from CI, and the security checklist is in the repo with each item marked.

## Final check (run after Step 5.1)
> Run the full benchmark suite, the complete test suite and a manual end-to-end pass: new user onboarding, complete a lesson, see job matches, apply to a real posting with review, and check the landing page. Write `docs/REVAMP_RESULTS.md` comparing the baseline scoreboards to the current ones, and list what remains.
