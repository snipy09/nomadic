NOMADIC SCRAPERS
================

Run job scraper.cmd        Double-click to scrape jobs now. Adds at most 100 NEW jobs to Supabase per run
                           (best jobs first; the rest are added next run), refreshes jobs already there,
                           skips duplicates, removes dead or closed listings, then opens the summary.
Run contact scraper.cmd    Double-click to collect hiring contacts now: recruiters/HR, hiring managers,
                           founders, employees and team inboxes (careers@, jobs@) from public pages only
                           (HN "Who is hiring", job pages, company team/contact pages). No LinkedIn scraping,
                           no guessed emails, domains MX-checked. Published to Supabase outreach_contacts,
                           which the app's Outreach directory reads. Then opens the summary.
Schedule every 6 hours.cmd Runs both automatically (only while the laptop is on and signed in).
Remove schedule.cmd        Stops the automatic runs.
reports\                   Jobs: latest-summary.txt, scrape-<date-time>.txt, history.csv.
                           Contacts: latest-contacts.txt, contacts-<date-time>.txt.
                           errors.log if a run failed.

First run asks for the Supabase service_role / secret key (Supabase dashboard > Project Settings >
API keys). It is saved only in Desktop\Nomadic\.env (git-ignored). Never share it.

Needs Node.js 22 LTS. Keep this folder next to the Nomadic folder on the Desktop.
Extra options can be added after the file name in a terminal, e.g.:
  "Run job scraper.cmd" --sources internshala,lever
  "Run contact scraper.cmd" --sources hn,jobs --region all --max-pages 80
  "Run contact scraper.cmd" -DryRun        (scrape and report only, nothing written to Supabase)
