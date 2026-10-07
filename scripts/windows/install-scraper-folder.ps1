# Builds the scraper folder (npm run build:scraper-folder -> dist\scraper-folder\Scraper) and installs it to
# Desktop\Nomadic Content\Scraper. Keeps the folder's .env, settings.ini, reports, logs and state; removes the
# launchers of the old folder (Run job scraper.cmd, Schedule every 6 hours.cmd, ...) and their 6-hour task.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org, then run this again.' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $repo 'node_modules\esbuild'))) {
  Write-Host '[install] Installing dependencies once (no Electron or browser downloads)...'
  & npm.cmd ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host 'npm ci failed.' -ForegroundColor Red; exit 1 }
}
& npm.cmd run build:scraper-folder
if ($LASTEXITCODE -ne 0) { Write-Host 'Building the scraper folder failed.' -ForegroundColor Red; exit 1 }
$source = Join-Path $repo 'dist\scraper-folder\Scraper'

$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $desktop 'Nomadic Content\Scraper'
New-Item -ItemType Directory -Force -Path $target | Out-Null

# Launchers of the previous folder (they called scripts\scrape-desktop.ps1, which is gone) and their task.
$old = @('Run job scraper.cmd', 'Run contact scraper.cmd', 'Run feed scraper.cmd', 'Schedule every 6 hours.cmd', 'Remove schedule.cmd', 'run-scheduled.cmd')
foreach ($name in $old) { Remove-Item -LiteralPath (Join-Path $target $name) -Force -ErrorAction SilentlyContinue }
cmd /c 'schtasks /Delete /TN "Nomadic scraper" /F >nul 2>nul'

# Copy everything except the files that belong to this computer.
& robocopy $source $target /E /NFL /NDL /NJH /NJS /NP /XF settings.ini .env node-path.txt /XD state reports logs | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Copying to $target failed (robocopy $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $target 'settings.ini'))) { Copy-Item (Join-Path $source 'settings.ini') $target }

Write-Host ''
Write-Host "Scraper folder ready: $target" -ForegroundColor Green
$task = Get-ScheduledTask -TaskName 'Nomadic scrapers' -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $target '.env'))) {
  Write-Host 'Next: double-click Setup.cmd in that folder (Supabase key, then auto scraping turns on).'
} elseif ($task) {
  & (Join-Path $target 'bin\schedule.ps1')
} else {
  Write-Host 'Auto scraping is off. Double-click "Start auto scraping.cmd" there to turn it on.'
}
Start-Process explorer.exe $target
