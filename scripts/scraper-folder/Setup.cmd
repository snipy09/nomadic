@echo off
rem First-time setup: Node.js check, Supabase service key, optional Adzuna key, then auto scraping on.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\setup.ps1"
echo.
pause
