# Downloads the newest successful builds on main from GitHub Actions (artifacts are kept 14 days) into
# Desktop\Nomadic Content\Tester builds\{Windows,Mac,Android}, writes READ ME FIRST.txt for testers and zips the
# folder to Desktop\Nomadic Content\Nomadic tester builds.zip. Keep this file ASCII (PowerShell 5.1).
param([string]$Branch = 'main')
$ErrorActionPreference = 'Stop'
$repo = 'snipy09/nomadic'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host 'GitHub CLI is not installed. Run: winget install GitHub.cli   then: gh auth login   then run this again.' -ForegroundColor Red
  exit 1
}
cmd /c 'gh auth status >nul 2>nul'
if ($LASTEXITCODE -ne 0) { Write-Host 'Sign in first: gh auth login' -ForegroundColor Red; exit 1 }

$content = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nomadic Content'
$target = Join-Path $content 'Tester builds'
$staging = Join-Path $env:TEMP 'nomadic-tester-builds'
Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null

function Get-LatestRun($workflow) {
  $json = & gh run list -R $repo --workflow $workflow --branch $Branch --status success --limit 1 --json 'databaseId,createdAt'
  $runs = $json | ConvertFrom-Json
  if (-not $runs) { return $null }
  return $runs[0]
}

$builds = @(
  @{ Name = 'Windows'; Workflow = 'build-windows.yml'; Pattern = 'Nomadic-*-windows-unsigned' },
  @{ Name = 'Mac';     Workflow = 'build-mac.yml';     Pattern = 'Nomadic-*-mac-*' },
  @{ Name = 'Android'; Workflow = 'android-app.yml';   Pattern = 'nomadic-android-debug-*' }
)
$missing = @()
foreach ($b in $builds) {
  $run = Get-LatestRun $b.Workflow
  if (-not $run) { $missing += $b.Name; Write-Host "[$($b.Name)] no successful build on main." -ForegroundColor Yellow; continue }
  Write-Host "[$($b.Name)] downloading run $($run.databaseId) ($($run.createdAt))..."
  $dir = Join-Path $staging $b.Name
  & gh run download $run.databaseId -R $repo -p $b.Pattern -D $dir
  if ($LASTEXITCODE -ne 0) { $missing += $b.Name; Write-Host "[$($b.Name)] download failed (artifacts expire after 14 days)." -ForegroundColor Yellow; continue }
  # gh puts each artifact in its own subfolder; flatten them.
  Get-ChildItem $dir -Recurse -File | Where-Object { $_.DirectoryName -ne $dir } | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination $dir -Force }
  Get-ChildItem $dir -Directory | Remove-Item -Recurse -Force
}

# Give the APK a recognisable name.
$apk = Join-Path $staging 'Android\app-debug.apk'
if (Test-Path $apk) {
  $ver = (Get-Content -Raw (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'apps\android\package.json') | ConvertFrom-Json).version
  Rename-Item -LiteralPath $apk -NewName "Nomadic-$ver-android-test.apk"
}

$readme = @'
Nomadic test builds
===================
These are test builds. They are not signed, so your computer or phone will warn you once.
Please do not share them outside the test group.

WINDOWS (Windows 10/11, 64-bit)  - folder Windows
  Nomadic.Setup.<version>.exe   installs the app (recommended)
  Nomadic.<version>.exe         portable, runs without installing
  Windows SmartScreen may say "Windows protected your PC": click More info, then Run anyway.

MAC (macOS)  - folder Mac
  Apple Silicon (M1/M2/M3/M4): Nomadic-<version>-arm64.dmg
  Intel Mac:                   Nomadic-<version>-x64.dmg
  (Apple menu > About This Mac shows "Chip: Apple ..." or "Processor: Intel ...")
  Open the DMG and drag Nomadic to Applications. On first open macOS blocks it:
  open System Settings > Privacy & Security, scroll down, click Open Anyway, then Open.

ANDROID (Android 7 or newer)  - folder Android
  Copy Nomadic-<version>-android-test.apk to the phone and tap it.
  Allow "Install unknown apps" for the app you opened it with (Files, Chrome, WhatsApp...) when asked.

SHA256SUMS*.txt files list checksums if you want to verify a download.
Report bugs with: device, OS version, what you did, what happened, and a screenshot.
'@
Set-Content -LiteralPath (Join-Path $staging 'READ ME FIRST.txt') -Value $readme -Encoding ASCII

# Replace the old folder and zip only once everything is downloaded.
New-Item -ItemType Directory -Force -Path $content | Out-Null
Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
Move-Item -LiteralPath $staging -Destination $target
$zip = Join-Path $content 'Nomadic tester builds.zip'
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Write-Host 'Zipping...'
Compress-Archive -Path (Join-Path $target '*') -DestinationPath $zip

Write-Host ''
Write-Host "Tester builds: $target" -ForegroundColor Green
Write-Host "Zip to share:  $zip" -ForegroundColor Green
Get-ChildItem $target -Recurse -File | ForEach-Object { '  {0,-45} {1,8:N0} MB' -f $_.FullName.Substring($target.Length + 1), ($_.Length / 1MB) }
if ($missing) { Write-Host ("Missing: " + ($missing -join ', ') + ". Run its workflow in GitHub Actions, then run this again.") -ForegroundColor Yellow; exit 1 }
