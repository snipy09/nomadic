@echo off
rem Runs Nomadic for Android on this PC: starts the Android emulator, installs the APK and opens the app.
rem Double-click to use the newest local build (or the public release APK), or drop an .apk file on this file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-apk-on-pc.ps1" %*
echo.
pause
