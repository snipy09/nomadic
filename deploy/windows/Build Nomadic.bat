@echo off
REM ===================================================================
REM  Build Nomadic.bat
REM  Double-click to build the Nomadic desktop app and copy the .exe files
REM  into your Downloads folder. Supabase credentials are read from the
REM  environment or from the repo's .env file (see .env.example).
REM  Code signing is optional: set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD.
REM ===================================================================
rem This launcher lives in deploy\windows; run from the repo root.
cd /d "%~dp0..\.."
echo Building Nomadic - this can take several minutes on the first run...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-nomadic.ps1"
echo.
echo ===================================================================
echo  Finished. Check your Downloads folder for:
echo    - Nomadic.Setup.^<version^>.exe   (installer)
echo    - Nomadic.^<version^>.exe         (portable)
echo ===================================================================
pause
