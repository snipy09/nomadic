@echo off
rem Called by the launchers before they start node. The scrapers are bundled into bin\nomadic-scrapers.mjs only in the
rem built folder (Desktop\Nomadic Content\Scraper). Started from the repo's source copy (scripts\scraper-folder), it
rem builds and installs that folder instead; exit code 1 tells the launcher to stop.
if exist "%~dp0nomadic-scrapers.mjs" exit /b 0
set "INSTALLER=%~dp0..\..\windows\install-scraper-folder.ps1"
if exist "%INSTALLER%" (
  echo This is the source copy of the scraper folder in the repo; it has no scrapers bundled.
  echo Building and installing the real folder to Desktop\Nomadic Content\Scraper. Use the launchers there.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
) else (
  echo bin\nomadic-scrapers.mjs is missing from this folder. Reinstall it with "Install scraper folder.cmd" in the repo.
)
exit /b 1
