@echo off
rem Runs every scraper but writes NOTHING to Supabase: use it to see which sources work. Summaries in reports\.
call "%~dp0bin\run.cmd" all --dry-run
