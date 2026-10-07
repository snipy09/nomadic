@echo off
title Nomadic - Job Radar Scraper
color 0A
rem This launcher lives in scripts\windows; run from the repo root.
cd /d "%~dp0..\.."
echo ========================================================================
echo  ⚡ NOMADIC: Running Local Job Scraper & Supabase Publisher
echo ========================================================================
echo.
call npx tsx packages/scrapers/src/cli.ts run --publish
echo.
echo ========================================================================
echo  Press any key to exit...
echo ========================================================================
pause >nul
