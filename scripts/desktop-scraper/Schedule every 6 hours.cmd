@echo off
rem Runs the job and contact scrapers every 6 hours while this computer is on and signed in.
schtasks /Create /TN "Nomadic scraper" /SC HOURLY /MO 6 /TR "\"%~dp0run-scheduled.cmd\"" /F
pause
