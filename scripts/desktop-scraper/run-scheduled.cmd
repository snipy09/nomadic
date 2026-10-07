@echo off
rem Used by the scheduled task: jobs, then contacts, then the feed sources. No prompts, no Notepad. Summaries still go to reports\.
set "REPO=%~dp0..\Nomadic"
if not exist "%REPO%\scripts\scrape-desktop.ps1" set "REPO=%~dp0..\..\Nomadic"
if not exist "%REPO%\scripts\scrape-desktop.ps1" set "REPO=%~dp0..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode jobs -SummaryDir "%~dp0reports" -MaxNew 100 -Quiet
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode contacts -SummaryDir "%~dp0reports" -Quiet
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\scrape-desktop.ps1" -Mode feed -SummaryDir "%~dp0reports" -Quiet
