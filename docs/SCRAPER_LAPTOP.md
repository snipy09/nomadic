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

## Desktop launchers (jobs, contacts and feed, summary after every run)

`Desktop\Nomadic Content\Scraper` (finds the repo at `Desktop\Nomadic`; source copies in `scripts\desktop-scraper\`) holds
double-click launchers for `scripts\scrape-desktop.ps1`: `Run job scraper.cmd`, `Run contact scraper.cmd`,
`Run feed scraper.cmd`, `Schedule every 6 hours.cmd` (runs jobs, then contacts, then feed) and `Remove schedule.cmd`. Add `-DryRun` to scrape and report
without writing to Supabase.

Contacts (`-Mode contacts`, CLI `contacts --publish`): recruiters/HR, hiring managers, founders, employees and team
inboxes from public pages only (HN "Who is hiring", job pages, company team/contact pages; no LinkedIn scraping, no
guessed emails, MX-checked) into `outreach_contacts`, which the app's Outreach directory reads. Summaries:
`latest-contacts.txt` and `contacts-<time>.txt`. Options: `--sources hn,jobs,pages`, `--region all`, `--months N`,
`--max-pages N`.

Feed (`-Mode feed`, CLI `feed --publish`, needs migration 031): the Home feed's sources
(`packages/scrapers/src/feed`, plan in `docs/HOME_FEED_PLAN.md`).
- Companies: 66 famous companies (`feed/companies.ts`: big tech, Indian product, fintech, finance, semiconductors,
  IT services). Those with a public listing (their own careers API or ATS: Greenhouse, Lever, Ashby, Workday,
  SmartRecruiters, Eightfold, Oracle Recruiting Cloud, amazon.jobs, Google careers) are read for India-open roles,
  full time and internships, into `company_openings`, plus one `company_hiring_snapshots` row per company per IST
  day (open, internships, entry level, new since last run; the first run is a `baseline`). The others (TCS, Infosys,
  Flipkart, Apple, Meta, ...) are stored in `companies` for follows; their hiring windows are curated in Admin.
- Hackathons: Devfolio, Unstop, Devpost and HackerEarth, open or upcoming, online or in India, into `hackathons`
  (the same event on two sites is kept once).
- robots.txt is obeyed per host (agent `NomadicFeedBot`), 1 s between requests to a host, `--max-pages` per listing
  (default 10). A failing company or source is reported (`FAILED (robots.txt)` or the HTTP error) and its stored rows
  are left alone; a listing cut off by `--max-pages` closes nothing.
- Options: `--sources companies,hackathons`, `--companies google,amazon`, `--hackathon-sources devfolio,unstop`,
  `--region all`, `--max-pages N`. Summaries: `latest-feed.txt`, `feed-<time>.txt`.
- First run: `"Run feed scraper.cmd" -DryRun`, then fix or null (`careers: null`) every company the summary lists as
  FAILED in `feed/companies.ts`. Board ids, Workday tenants and Oracle site numbers were written without network
  access to those sites and are unverified until that run.

Jobs (`-Mode jobs`, the default): each run publishes with `--max-new 100`: at most 100 jobs that are not in Supabase yet are added (best score first, the rest
next run), jobs already there are refreshed (so expiry works as before), and a job another source already published
(same company + title + location, or same apply URL) is skipped as a duplicate. The first interactive run asks for
the service role key (hidden input) and saves it to `.env`. Summaries go to `reports\` (`latest-summary.txt`,
`scrape-<time>.txt`, `history.csv`, `errors.log`); the CLI flags are `--max-new N` and `--summary-dir DIR`.

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

## Run it automatically every 6 hours

In a terminal opened in the repo folder (adjust the path):

```
schtasks /Create /TN "Nomadic scraper" /SC HOURLY /MO 6 /TR "\"%CD%\scripts\scrape-laptop.cmd\"" /F
```

Remove it with `schtasks /Delete /TN "Nomadic scraper" /F`. The task only runs while the laptop is on and signed in.
The GitHub Actions workflow (`.github/workflows/scrape.yml`) does the same in the cloud once the repository secrets
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; running both is safe (upserts are idempotent).

## Reading the output

Each source prints `fetched / valid / outside-region`, then a table with duplicates, failed links, upserted and
expired. Warnings name the board that failed (for example a company that moved off Greenhouse). `zero_results` or
`source_error` on a source means its site changed or blocked the request; the other sources still publish, and that
source's existing jobs are not expired on a failed run.
