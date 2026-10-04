#!/usr/bin/env bash
# Scrapes jobs and publishes them to Supabase from this computer (macOS/Linux). Same as scrape-laptop.cmd.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "[scrape] Missing .env (copy .env.example, fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)"; exit 1; }
grep -Eq '^SUPABASE_SERVICE_ROLE_KEY=.+' .env || { echo "[scrape] SUPABASE_SERVICE_ROLE_KEY in .env is empty"; exit 1; }
[[ -d node_modules/tsx ]] || npm ci --ignore-scripts --no-audit --no-fund
mkdir -p scrape-output
npx tsx packages/scrapers/src/cli.ts run --publish --json scrape-output/report.json "$@" 2>&1 | tee -a scrape-output/scrape.log
