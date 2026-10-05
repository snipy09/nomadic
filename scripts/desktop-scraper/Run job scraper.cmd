@echo off
rem Runs the Nomadic job scraper: adds up to 100 new jobs to Supabase, then opens the summary.
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode jobs -SummaryDir "%~dp0reports" -MaxNew 100 %*
echo.
echo Reports are in %~dp0reports
pause
