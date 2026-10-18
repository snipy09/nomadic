# Running the job scraper on your laptop

The scraper fetches jobs from the sources in `packages/scrapers/src/sources/registry.ts`, cleans and de-duplicates
them, checks links, keeps the ones open to candidates in India, and writes them to the live `jobs` table. Jobs a source
no longer lists are expired, and a row per source goes to `scrape_runs` (Admin → Scraper health).

## One-time setup (Windows)

1. Install **Node.js 22 LTS** (nodejs.org) and **Git**, then clone the repo:
   `git clone https://github.com/snipy09/nomadic.git` and `cd nomadic`.
2. Copy `.env.example` to `.env` and set:
   - `SUPABASE_URL=https://grqkiddfwoyicktpgdea.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=` the **service_role / secret** key from Supabase → Project Settings → API keys.
   This key bypasses every security rule: keep it only in this `.env` (it is git-ignored), never in chat, a commit or
   the app.
3. Try a dry run first (nothing is written): `npx tsx packages/scrapers/src/cli.ts run` after `npm ci --ignore-scripts`.

## The Desktop scraper folder (all scrapers, auto schedule)

`Desktop\Nomadic Content\Scraper` is one self-contained folder with every scraper: they are bundled into
`bin\nomadic-scrapers.mjs`, so it needs only Node.js 22 (no repo checkout, no `npm ci`). Source: `scripts/scraper-folder`
(launchers, `settings.ini`, `bin\*.ps1/.vbs/.cmd`) + `npm run build:scraper-folder` (`packages/scrapers/scripts/build-folder.mjs`
→ `dist\scraper-folder\Scraper`). Install or update it with `scripts\windows\Install scraper folder.cmd` (builds, copies to
the Desktop folder, keeps `.env`, `settings.ini`, `reports`, `logs`, `state`, removes the old launchers and their
"Nomadic scraper" task), or download the `Nomadic-Scraper-folder` artifact of the `scraper-folder.yml` workflow.

- `Setup.cmd`: checks Node.js 22 (offers `winget install OpenJS.NodeJS.LTS`), stores the service key in the folder's
  `.env` (hidden input, or reuses `Desktop\Nomadic\.env`; the file is then readable only by this user), optionally an
  Adzuna app id/key, registers the schedule and starts the first run.
- Auto scraping: a scheduled task "Nomadic scrapers" (current user, no admin, `bin\run-scheduled.vbs` so no window)
  starts `auto` every 30 minutes and at sign-in; each start runs only the scrapers whose interval in `settings.ini`
  `[schedule]` has passed (defaults: news 3 h, jobs 6 h, hackathons 12 h, companies 12 h, contacts 24 h, discover 168 h;
  0 = off), one after another, then exits. Missed runs start after sleep (StartWhenAvailable); a lock file stops
  overlaps; a failed scraper retries after 1 h, doubling up to its interval. `Start auto scraping.cmd` /
  `Stop auto scraping.cmd` turn it on and off; `Check status.cmd` prints last run, result and next run per scraper.
- Run now: `Run everything now.cmd`, `Run jobs now.cmd`, `Run news now.cmd`, `Run hackathons now.cmd`,
  `Run company snapshots now.cmd`, `Run contacts now.cmd`, `Find company boards now.cmd`, and
  `Test all sources (dry run).cmd` (writes nothing). Each opens its summary in Notepad.
- Output: `reports\<scraper>\latest-*.txt` (+ dated copies), `reports\history.csv` (one line per run), `logs\auto-<yyyy-mm>.log`
  (everything printed), `state\auto-state.json`, `state\boards.json` (discovered boards), `state\jobs-report.json`.
- CLI equivalents: `npx tsx packages/scrapers/src/cli.ts auto --home <folder> [--force jobs,news|all] [--dry-run]` and
  `... status --home <folder>`.

### What each scraper reads

- **jobs** (`run`): Greenhouse, Lever and Ashby boards (built-in lists + the 66 feed companies on those ATSs + every
  board in `state\boards.json`), company careers sites (`careers`: Workday, SmartRecruiters, Eightfold, Oracle,
  amazon.jobs, Google), Internshala (45 listing pages × `internshala_pages`, 1 s apart, a listing stops at a page that is mostly postings already read, city from the slug), Unstop
  jobs and internships (`unstop_pages`, closed ones skipped, no salary), Remotive, Jobicy, Arbeitnow, RSS, and Adzuna
  India when `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` are in `.env` (2.6 s apart, `max_calls_per_run`, estimated salaries
  dropped; terms: "Jobs by Adzuna" credit, licence for ongoing commercial use). `max_new_per_run` (5000) new jobs per
  run; jobs the source dates more than `max_age_days` (30) ago are skipped, and migration 033 expires stored ones 30
  days after posting (or first seen).
- **discover**: probes ~370 India-hiring companies (`packages/scrapers/src/sources/india-companies.ts`, plus famous
  companies without a readable listing) on the Greenhouse, Lever, Ashby and SmartRecruiters posting APIs and keeps
  boards with at least one India-open job. Those boards feed **jobs** and **companies** (so News gets snapshots for them).
- **companies** (`feed --sources companies`): openings and a daily hiring snapshot per company (66 famous + discovered).
- **hackathons** (`feed --sources hackathons`): Devfolio, Unstop, Devpost, HackerEarth, Hack2skill and MLH (schema.org
  Event markup on their listing pages), Codeforces contests (official API, next 30 days, `kind = 'contest'`).
- **news**: Indian publishers' RSS (`packages/scrapers/src/news/feeds.ts`: ET, ET Tech, Inc42, YourStory, Entrackr,
  Mint, BusinessLine, TOI, HT). Kept: hiring plans, campus drives, layoffs, and funding/expansion of known companies
  (government, police and exam recruitment, single executive hires and deal stories are dropped); a feed whose items
  are all older than the window is reported as STALE; company, roles, headcount, period ("September to
  December" → dates; "FY27" → Apr 2026–Mar 2027) and cities are read from the headline and feed summary only.
  `feeds_off` in settings.ini skips feeds. Google News RSS is not used (its terms allow personal, non-commercial use only).
- **contacts**: as below.
- Needs migration 033 (news_items, hackathon kind/sources, 30-day job age). Without it, news and contest writes fail.

### First live check

These sources could not be reached when they were written (the build container's network blocks them): every news
feed URL, MLH and Hack2skill markup, Unstop's jobs/internships fields, Internshala category slugs, Adzuna, and the
discovery probes. Run `Test all sources (dry run).cmd` once and read `reports\*\latest-*.txt`; fix what is FAILED in
the repo (feed URLs in `news/feeds.ts`, page parsers in `feed/hackathons.ts`) or turn it off (`feeds_off`).

Contacts (`contacts`, CLI `contacts --publish`): recruiters/HR, hiring managers, founders, employees and team
inboxes from public pages only (HN "Who is hiring", job pages, company team/contact pages; no LinkedIn scraping, no
guessed emails, MX-checked) into `outreach_contacts`, which the app's Outreach directory reads. Options:
`--sources hn,jobs,pages`, `--region all`, `--months N`, `--max-pages N`.

Feed (`feed --publish`, needs migration 031): the Home feed's sources (`packages/scrapers/src/feed`, plan in
`docs/plans/HOME_FEED_PLAN.md`).
- Companies: 66 famous companies (`feed/companies.ts`: big tech, Indian product, fintech, finance, semiconductors,
  IT services) plus discovered boards. Those with a public listing are read for India-open roles, full time and
  internships, into `company_openings`, plus one `company_hiring_snapshots` row per company per IST day (open,
  internships, entry level, new since last run; the first run is a `baseline`). The others (TCS, Infosys, Apple,
  Meta, ...) are stored in `companies` for follows; their hiring windows come from the news scraper or Admin.
- robots.txt is obeyed per host (agent `NomadicFeedBot`), 1 s between requests to a host, `--max-pages` per listing
  (default 10). A failing company or source is reported (`FAILED (robots.txt)` or the HTTP error) and its stored rows
  are left alone; a listing cut off by `--max-pages` closes nothing.
- Options: `--sources companies,hackathons`, `--companies google,amazon`, `--hackathon-sources devfolio,unstop,mlh`,
  `--region all`, `--max-pages N`.
- Board ids, Workday tenants and Oracle site numbers were written without network access to those sites: fix or null
  (`careers: null`) every company the dry run lists as FAILED in `feed/companies.ts`.

Jobs (`run`): at most `--max-new` jobs that are not in Supabase yet are added (best score first, the rest next run),
jobs already there are refreshed (so expiry works as before), and a job another source already published (same
company + title + location, or same apply URL) is skipped as a duplicate.

## Run it

- Double-click `scripts\scrape-laptop.cmd`, or run it from a terminal. It installs dependencies the first time,
  publishes, and prints the last lines of `scrape-output\scrape.log`. The full report is `scrape-output\report.json`.
- Options go after the script name:
  - `--sources internshala,lever` only these sources (`npx tsx packages/scrapers/src/cli.ts sources` lists them)
  - `--include-tier3` also Naukri, Indeed and the other opt-in scrapers (they break more often and their terms
    restrict scraping; use with care)
  - `--region all` keep jobs outside India too
  - `--no-link-check` faster, skips the HTTP check of apply links
- macOS/Linux: `bash scripts/scrape-laptop.sh` with the same options.

## Run it automatically

Use the Desktop scraper folder above (`Start auto scraping.cmd`). The GitHub Actions workflow
(`.github/workflows/scrape.yml`) runs the job scraper in the cloud once the repository secrets `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set; running both is safe (upserts are idempotent).

## Reading the output

Each source prints `fetched / valid / outside-region`, then a table with duplicates, failed links, upserted and
expired. Warnings name the board that failed (for example a company that moved off Greenhouse). `zero_results` or
`source_error` on a source means its site changed or blocked the request; the other sources still publish, and that
source's existing jobs are not expired on a failed run.
