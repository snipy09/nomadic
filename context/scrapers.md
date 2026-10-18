# Scrapers and the Desktop scraper folder

Last updated: 7 October 2026. Operator guide with every option: [`docs/guides/SCRAPER_LAPTOP.md`](../docs/guides/SCRAPER_LAPTOP.md).

## What fills the database

All scrapers are in `packages/scrapers` and run from the owner's laptop (service-role key in the folder's `.env`). The
apps only read what they publish. robots.txt is obeyed; requests to one site are at least 1 s apart.

| Scraper | Writes | Sources |
|---|---|---|
| jobs (`run`) | `jobs` | Internshala (45 listing pages × 5), Unstop jobs + internships, company careers sites (Workday, SmartRecruiters, Eightfold v2/pcsx, Oracle, amazon.jobs), Greenhouse/Lever/Ashby boards (built-in + feed companies + discovered), Remotive, Jobicy, Arbeitnow, RSS, Adzuna India (needs a key). Naukri/Indeed opt-in. ≤ 1,000 new jobs per run; jobs older than 30 days are skipped and expire (migration 033). |
| discover | `state/boards.json` | ~370 India-hiring companies (`sources/india-companies.ts`) probed on the Greenhouse, Lever, Ashby and SmartRecruiters APIs; boards with ≥ 1 India-open job are kept and feed jobs + companies. |
| companies (`feed --sources companies`) | `companies`, `company_openings`, `company_hiring_snapshots` | 66 famous companies (`feed/companies.ts`) + discovered boards; one snapshot per company per IST day. |
| hackathons (`feed --sources hackathons`) | `hackathons` | Devfolio, Unstop, Devpost, HackerEarth, Hack2skill, MLH (schema.org markup), Codeforces contests (official API). |
| news | `news_items` | Indian publishers' RSS (`news/feeds.ts`): hiring plans, campus drives, layoffs, funding/expansion of known companies; company, roles, headcount, period and cities read from the headline + summary only. Google News RSS is not used (non-commercial terms). |
| contacts | `outreach_contacts` | HN "Who is hiring", public job pages, company team/contact pages; no LinkedIn scraping, no guessed emails, MX-checked. |

## The Desktop scraper folder

`Desktop\Nomadic Content\Scraper`: every scraper bundled into `bin\nomadic-scrapers.mjs` (Node 22 only), built from
`scripts/scraper-folder` by `npm run build:scraper-folder` and installed/updated by
`scripts\windows\Install scraper folder.cmd` (keeps `.env`, `settings.ini`, `reports`, `logs`, `state`).
  Never run the launchers in `scripts/scraper-folder` itself (no bundle there): they now just run that installer.
  The installer also removes a "Nomadic scrapers" task registered from another copy.

- `Setup.cmd`: Node check, service key (reuses `Desktop\Nomadic\.env`), optional Adzuna key, turns on auto scraping.
- Auto scraping: scheduled task "Nomadic scrapers" (current user, no admin, hidden via `bin\run-scheduled.vbs`) runs
  `auto` every 30 min and at sign-in; it runs the scrapers whose interval in `settings.ini` has passed (news 3 h, jobs
  6 h, hackathons and companies 12 h, contacts 24 h, discover weekly). State, lock and retry backoff:
  `packages/scrapers/src/auto/`. Reports per scraper in `reports\<name>\`, monthly logs in `logs\`.
- `Run … now.cmd`, `Test all sources (dry run).cmd` (writes nothing), `Check status.cmd`, `Stop auto scraping.cmd`.

## Live status (18 Oct 2026)

Migration 033 is live. A full dry run on the laptop (18 Oct 2026) passes with no source FAILED: jobs ~3,900 unique
live (Greenhouse, Lever, Ashby, Remotive, Internshala, careers sites, Unstop, Jobspresso RSS, Arbeitnow, Jobicy),
companies 51 read and 0 failed, hackathons 190 (HackerEarth lists 0 right now), all 13 news feeds read.
What was changed to get there:
- Eightfold: Microsoft and Qualcomm only answer `/api/pcsx/search` (`api: 'pcsx'`); Netflix stays on v2 (pcsx 403).
  `PoliteFetcher.json` waits out one 429 (Retry-After, max 30 s); a 429 that lasts past page 1 keeps the pages read,
  marked truncated (Qualcomm).
- Ashby: when the posting API errors, the public board page (`window.__appData`) is read instead.
- `careers: null` (curated in Admin) for Google (robots.txt disallows, old API gone), Walmart (Workday tenant gone),
  ServiceNow and Freshworks (SmartRecruiters' robots.txt admits only LinkedInBot), Postman and PhonePe (no public
  board), JPMorgan (WAF 403s robots.txt). Dell moved to Oracle (`enterpriseplatform.dell.com`), Visa to Workday.
- Hack2skill reads its public event-list API (robots.txt allows it); open events only.
- News: entrackr `/rss`, ht-jobs reads HT's business feed; bs-tech, bs-companies (robots 403) and fe-jobs (410) removed.
- Jobspresso: `/jobs/feed/` (the old `/feed/` is the empty blog). The link check now ignores closed-job phrases in
  `<script>`/`<style>` (WordPress themes ship "position has been filled" on every page).
- Lever boards get 60 s (Palantir's board is one ~6 MB response).

Adzuna's terms want "Jobs by Adzuna" credit and a licence for ongoing commercial use.
