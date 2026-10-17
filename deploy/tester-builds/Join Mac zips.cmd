@echo off
rem GitHub refuses files over 100 MB, so each Mac zip is stored in two parts. This joins them back into
rem Nomadic-1.4.0-mac-arm64.zip and Nomadic-1.4.0-mac-x64.zip in the Mac folder. Run it once before sharing.
rem On a Mac or Linux instead: cat Nomadic-1.4.0-mac-arm64.zip.part* > Nomadic-1.4.0-mac-arm64.zip
cd /d "%~dp0Mac"
copy /b /y Nomadic-1.4.0-mac-arm64.zip.part001 + Nomadic-1.4.0-mac-arm64.zip.part002 Nomadic-1.4.0-mac-arm64.zip >nul
copy /b /y Nomadic-1.4.0-mac-x64.zip.part001 + Nomadic-1.4.0-mac-x64.zip.part002 Nomadic-1.4.0-mac-x64.zip >nul
certutil -hashfile Nomadic-1.4.0-mac-arm64.zip SHA256 | findstr /v ":"
certutil -hashfile Nomadic-1.4.0-mac-x64.zip SHA256 | findstr /v ":"
echo Done. Compare the two hashes above with SHA256SUMS.txt, then share the .zip files (not the .part files).
pause
