NOMADIC SCRAPERS
================

One folder with every Nomadic scraper. It fills Supabase with jobs, hiring news, hackathons, company hiring
snapshots and hiring contacts, and keeps them fresh on its own while this computer is on.

FIRST TIME
  1. Double-click Setup.cmd. It checks Node.js 22 (offers to install it), asks once for the Supabase
     service_role / secret key (Supabase dashboard > Project Settings > API keys; or reuses the one in
     Desktop\Nomadic\.env), optionally an Adzuna key, then turns on auto scraping and starts the first run.
  2. Supabase needs migration 033 (packages\supabase\baseline\apply_033.sql) for news and contests.
  3. Later, "Check status.cmd" shows what ran, what failed and what runs next.

AUTO SCRAPING
  Start auto scraping.cmd   Background schedule: every 30 minutes it runs whatever is due, then stops.
                            How often each scraper runs is set in settings.ini ([schedule], hours; 0 = off).
                            Defaults: news 3 h, jobs 6 h, hackathons 12 h, companies 12 h, contacts 24 h,
                            board discovery weekly. Runs while the computer is on and you are signed in;
                            a run missed during sleep starts when it wakes. No admin rights, no window.
  Stop auto scraping.cmd    Turns the schedule off.
  Check status.cmd          Last run, result and next run of each scraper; whether the schedule is on.

RUN NOW (in a window; the summary opens in Notepad afterwards)
  Run everything now.cmd          every scraper that is not turned off
  Run jobs now.cmd                jobs and internships (see SOURCES)
  Run news now.cmd                hiring news
  Run hackathons now.cmd          hackathons and coding contests
  Run company snapshots now.cmd   openings and a daily hiring snapshot per company (News: "X posted 12 roles")
  Run contacts now.cmd            hiring contacts for Outreach
  Find company boards now.cmd     looks for the job boards of ~370 companies hiring in India (weekly by itself)
  Test all sources (dry run).cmd  runs everything but writes NOTHING to Supabase; shows which sources work
  Open reports.cmd                the reports folder

SOURCES
  Jobs        Internshala (45 listing pages x 5), Unstop jobs + internships, company careers sites (Google,
              Microsoft, Amazon, NVIDIA, Walmart, Oracle, JPMorgan, ... via their own APIs), Greenhouse / Lever /
              Ashby boards (built-in plus every board "Find company boards" finds), Remotive, Jobicy, Arbeitnow,
              RSS, and Adzuna India when its key is in .env. Up to 5,000 new jobs per run. A job is shown for at
              most 30 days after it was posted; closed and dead listings are removed.
  News        Economic Times, ET Tech, Inc42, YourStory, Entrackr, Mint, BusinessLine, Times of India,
              Hindustan Times (RSS). Kept: hiring
              plans, campus drives, layoffs, and funding/expansion of known companies. Company, roles, headcount,
              period (e.g. "September to December", "FY27") and cities are read from the headline and summary only.
  Hackathons  Devfolio, Unstop, Devpost, HackerEarth, Hack2skill, MLH, plus Codeforces contests (official API).
  Companies   66 famous companies + every company whose board was found; one hiring snapshot per company per day.
  Contacts    HN "Who is hiring", public job pages and company team/contact pages (no LinkedIn, no guessed emails).
  robots.txt is obeyed and requests to one site are spaced at least 1 second apart.

FIRST LIVE CHECK
  Several feeds and pages could not be tested before shipping (MLH, Hack2skill, some news feeds, some careers
  boards). Run "Test all sources (dry run).cmd" once and read reports\*\latest-*.txt: anything listed as FAILED
  needs its URL fixed in the repo (or turned off: news feeds via feeds_off in settings.ini).

FILES
  settings.ini      intervals and limits (edit in Notepad; the next run uses them)
  .env              Supabase service key (+ Adzuna key). Bypasses all security rules: never share it.
  reports\<name>\   latest-*.txt summary of the last run of each scraper, plus dated copies
  reports\history.csv  one line per scheduled run (time, scraper, ok/failed, seconds)
  logs\             everything the scrapers printed, one file per month
  state\            schedule state, found company boards (boards.json), last jobs report
  bin\              the scrapers (one bundled file) and helper scripts

UPDATING
  In the repo (Desktop\Nomadic): git pull, then double-click scripts\windows\Install scraper folder.cmd.
  It rebuilds bin\ and keeps .env, settings.ini, reports, logs and state.
