@echo off
rem Downloads the latest Windows, Mac and Android builds from GitHub Actions into
rem Desktop\Nomadic Content\Tester builds and zips the folder for sharing. Needs the GitHub CLI (gh), signed in.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-tester-builds.ps1"
echo.
pause
