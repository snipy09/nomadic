@echo off
rem Scrapes jobs and publishes them to Supabase from this computer (Windows).
rem Needs Node.js 22+ and a .env file in the repo root with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
rem Extra arguments are passed to the scraper, e.g.:  scripts\scrape-laptop.cmd --include-tier3
rem Logs go to scrape-output\scrape.log and the last report to scrape-output\report.json.
setlocal
cd /d "%~dp0.."

if not exist ".env" (
  echo [scrape] Missing .env in %CD%. Copy .env.example to .env and fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
  exit /b 1
)
findstr /b /c:"SUPABASE_SERVICE_ROLE_KEY=ey" .env >nul || findstr /b /c:"SUPABASE_SERVICE_ROLE_KEY=sb_secret_" .env >nul
if errorlevel 1 (
  echo [scrape] SUPABASE_SERVICE_ROLE_KEY in .env is empty. Supabase dashboard ^> Project Settings ^> API keys ^> service_role / secret key.
  exit /b 1
)

if not exist "node_modules\tsx" (
  echo [scrape] Installing dependencies once ^(no Electron or browser downloads^)...
  call npm ci --ignore-scripts --no-audit --no-fund || exit /b 1
)

if not exist "scrape-output" mkdir scrape-output
echo [scrape] %DATE% %TIME% starting >> scrape-output\scrape.log
call npx tsx packages\scrapers\src\cli.ts run --publish --json scrape-output\report.json %* >> scrape-output\scrape.log 2>&1
set RC=%ERRORLEVEL%
echo [scrape] %DATE% %TIME% finished with exit code %RC% >> scrape-output\scrape.log
powershell -NoProfile -Command "Get-Content -Tail 25 'scrape-output\scrape.log'"
exit /b %RC%
