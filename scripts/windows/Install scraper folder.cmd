@echo off
rem Builds the Nomadic scraper folder from this repo and installs it to Desktop\Nomadic Content\Scraper
rem (keeps .env, settings.ini, reports, logs and state). Run it again after git pull to update the scrapers.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-scraper-folder.ps1"
echo.
pause
