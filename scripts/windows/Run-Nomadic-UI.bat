@echo off
rem This launcher lives in scripts\windows; run from the repo root.
cd /d "%~dp0..\.."
echo Starting Nomadic UI on http://localhost:5173 ...
npm run ui:dev
pause
