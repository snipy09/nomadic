@echo off
rem Turns on the background schedule (every 30 minutes, runs whatever settings.ini says is due).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\schedule.ps1"
echo.
pause
