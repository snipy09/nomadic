@echo off
rem Runs the Nomadic contact scraper: public hiring contacts (recruiters/HR, hiring managers, founders,
rem employees, team inboxes) into Supabase outreach_contacts, then opens the summary.
rem The scraper code lives in the Nomadic repo next to this folder (Desktop\Nomadic), or this folder is
rem scripts\desktop-scraper inside the repo.
set "REPO=%~dp0..\Nomadic"
if not exist "%REPO%\scripts\scrape-desktop.ps1" set "REPO=%~dp0..\.."
if not exist "%REPO%\scripts\scrape-desktop.ps1" (
  echo Cannot find the Nomadic repo. Keep this folder next to the Nomadic folder on the Desktop.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode contacts -SummaryDir "%~dp0reports" %*
echo.
echo Reports are in %~dp0reports
pause
