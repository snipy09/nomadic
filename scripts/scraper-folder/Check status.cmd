@echo off
chcp 65001 >nul
rem Last run, result and next run of each scraper, and whether auto scraping is on.
node "%~dp0bin\nomadic-scrapers.mjs" status --home "%~dp0."
schtasks /Query /TN "Nomadic scrapers" >nul 2>nul
if errorlevel 1 (echo Auto scraping is OFF. Double-click "Start auto scraping.cmd" to turn it on.) else (echo Auto scraping is ON: checks every 30 minutes while this computer is on and you are signed in.)
echo.
pause
