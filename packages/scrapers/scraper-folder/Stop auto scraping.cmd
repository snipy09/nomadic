@echo off
rem Turns off the background schedule. Nothing else changes; Start auto scraping.cmd turns it back on.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\schedule.ps1" -Remove
echo.
pause
