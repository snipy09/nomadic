# Scrapers and the Desktop scraper folder

Last updated: 7 October 2026. Operator guide with every option: [`docs/guides/SCRAPER_LAPTOP.md`](../docs/guides/SCRAPER_LAPTOP.md).

## What fills the database

All scrapers are in `packages/scrapers` and run from the owner's laptop (service-role key in the folder's `.env`). The
apps only read what they publish. robots.txt is obeyed; requests to one site are at least 1 s apart.

| Scraper | Writes | Sources |
|---|---|---|
| jobs (`run`) | `jobs` | Internshala (45 listing pages × 5, 1 s apart, stops paging at a mostly-seen page), Unstop jobs + internships, company careers sites (Workday, SmartRecruiters, Eightfold v2/pcsx, Oracle, amazon.jobs), Greenhouse/Lever/Ashby boards (built-in + feed companies + discovered), Remotive, Jobicy, Arbeitnow, RSS, Adzuna India (needs a key). Naukri/Indeed opt-in. ≤ 5,000 new jobs per run (was 1,000: a 2,800-job backlog); careers sites read up to 25 pages per company, and a company read in full expires its vanished jobs even when another company was cut off; jobs older than 30 days are skipped and expire (migration 033). |
| discover | `state/boards.json` | ~370 India-hiring companies (`sources/india-companies.ts`) probed on the Greenhouse, Lever, Ashby and SmartRecruiters APIs (a platform whose robots.txt disallows the API, SmartRecruiters today, is asked once per run and skipped); boards with ≥ 1 India-open job are kept and feed jobs + companies. |
| companies (`feed --sources companies`) | `companies`, `company_openings`, `company_hiring_snapshots` | 66 famous companies (`feed/companies.ts`) + discovered boards; one snapshot per company per IST day. |
| hackathons (`feed --sources hackathons`) | `hackathons` | Devfolio, Unstop, Devpost, HackerEarth, Hack2skill, MLH (schema.org markup), Codeforces contests (official API). |
| news | `news_items` | Indian publishers' RSS (`news/feeds.ts`): hiring plans, campus drives, layoffs, funding/expansion of known companies; company, roles, headcount, period and cities read from the headline + summary only. Government/police/exam recruitment, single executive hires and deal stories are dropped; a company is tagged from the headline, or from the summary only when it names exactly one company (never under a college headline). A feed whose items are all past the window shows as STALE. Google News RSS is not used (non-commercial terms). |
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

Fixes after the 18 Oct 2026 publishing run (scraper report review):
- News: ie-jobs and moneycontrol removed (every item older than 30 days). yourstory, toi-business and ht-jobs are general
  business desks: 0 kept in one run is expected; they cost one request each per run.
- `auto`: a `state\boards.json` newer than the last recorded discovery counts as that discovery (a "Test all sources"
  dry run probes for real but recorded nothing, so discovery ran again 30 min later); `--force all` ("Run everything",
  "Test all sources") leaves out a discovery that is not due; "Find company boards now" still runs it.
- Palantir removed from the built-in Lever boards (0 India jobs of ~310 every run).
- "Member of Technical Staff" (Adobe, Salesforce, Oracle) no longer counts as staff-level: AMTS entry, MTS unknown,
  SMTS/LMTS/PMTS senior. amazon.jobs `university_job` marks campus roles entry level.
- HackerEarth: an answer without its `response` list is FAILED (was a silent 0 of 0); an empty list is still 0.
- Contacts: names are only kept when they match the address (no guessed names), so team inboxes have none; Dell's 502 and
  Coinbase's 403 are their servers, not the scraper.

Adzuna's terms want "Jobs by Adzuna" credit and a licence for ongoing commercial use.
