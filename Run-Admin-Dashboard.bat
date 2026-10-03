@echo off
cd /d "%~dp0"
echo ===================================================
echo   Nomadic Admin Dashboard (Localhost Control)
echo ===================================================
echo Opening Admin Dashboard in your browser: http://localhost:5173/?admin=true
echo Starting local Vite dev server...
start http://localhost:5173/?admin=true
call npm run ui:dev
pause
