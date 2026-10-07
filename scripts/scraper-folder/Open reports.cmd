@echo off
if not exist "%~dp0reports" mkdir "%~dp0reports"
start "" explorer "%~dp0reports"
