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
