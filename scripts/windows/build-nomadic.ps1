<#
  build-nomadic.ps1
  Builds the Nomadic desktop app for Windows and copies the finished .exe files
  into your Downloads folder. Run this on Windows (the packaged app needs native
  Windows binaries).

  USAGE (PowerShell, from the repo root; or double-click scripts\windows\Build Nomadic.bat):

    # Credentials come from the environment or from the repo's .env file:
    .\scripts\windows\build-nomadic.ps1

    # Or pass them explicitly:
    .\scripts\windows\build-nomadic.ps1 -SupabaseUrl "https://xxxx.supabase.co" -SupabaseAnonKey "your-anon-key"

    # Just to see the UI build (login won't reach the server):
    .\scripts\windows\build-nomadic.ps1 -SkipCredsCheck

  CODE SIGNING (optional):
    Set these environment variables before running (never commit the .pfx):
      WIN_CSC_LINK          path to the .pfx (or the .pfx as a base64 string)
      WIN_CSC_KEY_PASSWORD  password for the .pfx
    When they are not set the build continues unsigned.

  If you get an execution-policy error, run once:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

param(
  # Precedence: explicit -arg  >  environment variable  >  .env file in the repo root.
  # NOTE: use the BASE project URL (no /rest/v1); the app appends the path.
  [string]$SupabaseUrl     = $env:SUPABASE_URL,
  [string]$SupabaseAnonKey = $env:SUPABASE_ANON_KEY,
  [switch]$SkipCredsCheck
)

$ErrorActionPreference = "Stop"
# This script lives in scripts\windows; the repo root is two folders up.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# --- 0. Load .env (only for variables that are not already set) ---------------
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $name  = $Matches[1]
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
}
if (-not $SupabaseUrl)     { $SupabaseUrl     = $env:SUPABASE_URL }
if (-not $SupabaseAnonKey) { $SupabaseAnonKey = $env:SUPABASE_ANON_KEY }

$version = (Get-Content (Join-Path $root "apps\desktop\package.json") -Raw | ConvertFrom-Json).version

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Nomadic v$version  -  Windows build & package" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# --- 1. Credentials -----------------------------------------------------------
# SUPABASE_URL + SUPABASE_ANON_KEY are baked into the app at build time so a
# fresh install can reach the licensing server. The service_role key is NEVER
# baked into the app.
if ((-not $SupabaseUrl -or -not $SupabaseAnonKey) -and -not $SkipCredsCheck) {
  Write-Warning "SUPABASE_URL / SUPABASE_ANON_KEY were not provided."
  Write-Warning "The app will still build, but NOBODY will be able to log in until"
  Write-Warning "it is rebuilt with them. Set them in .env, pass -SupabaseUrl /"
  Write-Warning "-SupabaseAnonKey, or re-run with -SkipCredsCheck to just build the UI."
  $answer = Read-Host "Continue without credentials? (y/N)"
  if ($answer -ne "y") { Write-Host "Aborted."; exit 1 }
}

$env:SUPABASE_URL           = $SupabaseUrl
$env:SUPABASE_ANON_KEY      = $SupabaseAnonKey
$env:VITE_SUPABASE_URL      = $SupabaseUrl   # renderer (Vite) copy
$env:VITE_SUPABASE_ANON_KEY = $SupabaseAnonKey

# --- 2. Code signing ----------------------------------------------------------
# electron-builder reads WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD (or CSC_LINK /
# CSC_KEY_PASSWORD) directly. Without them, disable cert auto-discovery so the
# build produces unsigned binaries instead of failing.
$certLink = if ($env:WIN_CSC_LINK) { $env:WIN_CSC_LINK } else { $env:CSC_LINK }
# A short value that is not an existing file is a bad path (a base64 .pfx is much longer).
if ($certLink -and $certLink.Length -le 100 -and -not (Test-Path $certLink)) {
  Write-Warning "WIN_CSC_LINK points to '$certLink', which does not exist. Building unsigned."
  Remove-Item Env:WIN_CSC_LINK, Env:CSC_LINK -ErrorAction SilentlyContinue
  $certLink = $null
}
if ($certLink) {
  if (-not ($env:WIN_CSC_KEY_PASSWORD -or $env:CSC_KEY_PASSWORD)) {
    Write-Warning "WIN_CSC_LINK is set but WIN_CSC_KEY_PASSWORD is not; signing may fail."
  }
  Write-Host "`nCode signing: enabled (certificate from WIN_CSC_LINK / CSC_LINK)." -ForegroundColor Green
} else {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  Write-Host "`nCode signing: skipped (WIN_CSC_LINK not set). Binaries will be unsigned." -ForegroundColor DarkYellow
}

# --- 3. Dependencies ----------------------------------------------------------
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "`n[1/3] Installing dependencies (first run only, a few minutes)..." -ForegroundColor Yellow
  npm install
  npm run setup:browsers
} else {
  Write-Host "`n[1/3] Dependencies already installed - skipping npm install." -ForegroundColor DarkGray
}

# --- 4. Build + package -------------------------------------------------------
Write-Host "`n[2/3] Building renderer + main and packaging the Windows installer..." -ForegroundColor Yellow
npm run package:desktop
if ($LASTEXITCODE -ne 0) { throw "npm run package:desktop failed with exit code $LASTEXITCODE" }

# --- 5. Copy artifacts to Downloads ------------------------------------------
Write-Host "`n[3/3] Copying the app to your Downloads folder..." -ForegroundColor Yellow
$dist      = Join-Path $root "apps\desktop\dist-electron"
$downloads = Join-Path $env:USERPROFILE "Downloads"

if (-not (Test-Path $dist)) { throw "Build output not found at $dist" }
# Remove any legacy Hirestack artifacts
Get-ChildItem $dist -Filter "Hirestack*.exe" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $downloads -Filter "Hirestack*.exe" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$exes = Get-ChildItem $dist -Filter "Nomadic*.exe" -File -ErrorAction SilentlyContinue
if (-not $exes) { throw "No Nomadic .exe was produced in $dist" }

foreach ($exe in $exes) {
  try {
    Copy-Item $exe.FullName -Destination $downloads -Force
    $size = "{0:N1} MB" -f ($exe.Length / 1MB)
    Write-Host ("  copied  {0}  ({1})" -f $exe.Name, $size) -ForegroundColor Green
  } catch {
    Write-Host ("  note: {0} is currently in use or open. Close it to overwrite." -f $exe.Name) -ForegroundColor Yellow
  }
}

Write-Host "`nDone. Your app is in: $downloads" -ForegroundColor Cyan
Write-Host "  - 'Nomadic.Setup.$version.exe'  = installer (recommended)" -ForegroundColor Gray
Write-Host "  - 'Nomadic.$version.exe'        = portable, no install" -ForegroundColor Gray

# --- 6. Website download (zip with only "Nomadic Setup.exe" + SHA-256) ----------------
& (Join-Path $PSScriptRoot "make-release.ps1")
Start-Process explorer.exe $downloads
