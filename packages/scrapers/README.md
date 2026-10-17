# @nomadic/scrapers

Every scraper and everything that runs them. All of them publish to Supabase with the service key; nothing is
invented (unknown fields stay empty).

```
src/              the scrapers: pipeline/ (normalize, dedupe, classify, region, link-validate, score, store),
                  sources/ (registry, ATS boards, Adzuna, Unstop, careers sites, …), feed/ (company snapshots,
                  hackathons), news/ (Indian publishers' RSS), contacts/ (Outreach), auto/ (the scheduler), cli.ts
scraper-folder/   launchers + settings.ini + bin/ helpers of the Desktop scraper folder (keep these files ASCII:
                  PowerShell 5.1 reads UTF-8 without BOM as ANSI)
launchers/        Install scraper folder.cmd (build + install the folder on Windows), scrape-laptop.cmd/.sh
                  (one-off job scrape from a repo checkout)
scripts/          build-folder.mjs → dist/scraper-folder/Scraper (one esbuild bundle, needs only Node 22)
results/          benchmark baseline
SCRAPER_LAPTOP.md full guide: the scraper folder, every option, sources
```

## Commands (repo root)

| Task | Command |
|---|---|
| Build the scraper folder | `npm run build:scraper-folder` |
| Install / update it on Windows | double-click `packages\scrapers\launchers\Install scraper folder.cmd` |
| Jobs (dry run / publish) | `npm run scrape` · `npm run scrape:publish` |
| Company feed, hackathons | `npm run scrape:feed` |
| Hiring news | `npm run scrape:news` |
| Outreach contacts | `npm run scrape:contacts` |
| Benchmark | `npm run scrapers:bench` |
| Try the scheduler without Windows | `node dist/scraper-folder/Scraper/bin/nomadic-scrapers.mjs auto --home <dir> --force news --dry-run` |

CI: `.github/workflows/scraper-folder.yml` builds the folder; `scrape.yml` is the cloud job scraper. What each scraper
writes and its live status: [`context/scrapers.md`](../../context/scrapers.md).
