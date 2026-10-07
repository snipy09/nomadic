@echo off
rem Runs the Nomadic feed scraper: openings at famous companies (full time + internships) and upcoming
rem hackathons into Supabase (companies, company_openings, company_hiring_snapshots, hackathons), then opens
rem the summary. Add -DryRun to only report.
rem The scraper code lives in the Nomadic repo (Desktop\Nomadic), next to this folder or next to its parent folder
rem (Desktop\Nomadic Content\Scraper), or this folder is scripts\desktop-scraper inside the repo.
set "REPO=%~dp0..\Nomadic"
if not exist "%REPO%\scripts\scrape-desktop.ps1" set "REPO=%~dp0..\..\Nomadic"
if not exist "%REPO%\scripts\scrape-desktop.ps1" set "REPO=%~dp0..\.."
if not exist "%REPO%\scripts\scrape-desktop.ps1" (
  echo Cannot find the Nomadic repo. Keep this folder in Desktop\Nomadic Content.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode feed -SummaryDir "%~dp0reports" %*
echo.
echo Reports are in %~dp0reports
pause
