@echo off
chcp 65001 >nul
rem Runs scrapers now, in this window: %1 = jobs, news, hackathons, companies, contacts, discover or all.
rem Further arguments go to the runner (e.g. --dry-run). Opens the newest summary afterwards.
setlocal
set "BIN=%~dp0"
set "FOLDER=%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
call "%BIN%need-bundle.cmd" || (pause & exit /b 1)
node "%BIN%nomadic-scrapers.mjs" auto --home "%FOLDER%" --force %*
set "RC=%ERRORLEVEL%"
echo.
if "%1"=="all" (
  start "" explorer "%FOLDER%\reports"
) else (
  for %%F in ("%FOLDER%\reports\%1\latest-*.txt") do start "" notepad "%%~fF"
)
if not "%RC%"=="0" echo Something failed. The summary and logs\ say what.
pause
exit /b %RC%
