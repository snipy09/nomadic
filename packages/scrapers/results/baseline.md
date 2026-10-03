# Scraper benchmark

**Not measured yet.** The baseline needs live network access to each source. The
environment this was built in blocks outbound traffic to job boards, so no numbers
are recorded here rather than made-up ones.

Generate it with either:

- `npm run scrapers:bench` on a machine with internet access (overwrites this file), or
- the **Scrape jobs** workflow → *Run workflow* → mode `bench`; the table is in the
  run summary and in the `scrape-report-*` artifact (`baseline.md`).

The scoreboard has one row per source with: jobs returned, % schema-valid,
% reachable apply URL (every link fetched, including official-API links),
% cross-source duplicates, % closed/dead/invalid, run time and errors.
Use `--include-tier3` to benchmark the opt-in sources as well.
