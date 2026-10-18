# First-time setup of the Nomadic scraper folder: checks Node.js, stores the Supabase service key (and an optional
# Adzuna key) in this folder's .env (readable only by you), turns on auto scraping and starts the first run.
$ErrorActionPreference = 'Stop'
$bin = $PSScriptRoot
$folder = Split-Path -Parent $bin
$envPath = Join-Path $folder '.env'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$defaultUrl = 'https://grqkiddfwoyicktpgdea.supabase.co'

# Started from the repo's source copy (no bundled scrapers): build and install the real folder instead, so the
# schedule and the .env never point at the repo.
if (-not (Test-Path (Join-Path $bin 'nomadic-scrapers.mjs'))) {
  $installer = Join-Path $folder '..\windows\install-scraper-folder.ps1'
  if (Test-Path $installer) {
    Write-Host 'This is the source copy of the scraper folder in the repo. Installing the real one to Desktop\Nomadic Content\Scraper;'
    Write-Host 'use the launchers there.'
    & $installer
  } else {
    Write-Host 'bin\nomadic-scrapers.mjs is missing. Reinstall with "Install scraper folder.cmd" in the repo.' -ForegroundColor Red
  }
  exit 1
}

Write-Host 'NOMADIC SCRAPERS - SETUP' -ForegroundColor Cyan
Write-Host ''

# -- Node.js 22+ --------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
$major = 0
if ($node) { $major = [int](((& node --version) -replace '^v', '').Split('.')[0]) }
if ($major -lt 22) {
  Write-Host 'Node.js 22 or newer is needed.' -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    $answer = Read-Host 'Install Node.js LTS now with winget? (Y/n)'
    if ($answer -notmatch '^[nN]') {
      winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
      Write-Host 'Node.js installed. Close this window and double-click Setup.cmd again.' -ForegroundColor Green
      exit 0
    }
  }
  Write-Host 'Install Node.js 22 LTS from https://nodejs.org, then run Setup.cmd again.'
  exit 1
}
Write-Host "Node.js $(& node --version): OK"

# -- .env ---------------------------------------------------------------------
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
# Earlier setups locked .env to "$env:USERNAME:(R,W)", which on some accounts (Microsoft account, OneDrive Desktop)
# left it unreadable even for its owner. The owner may always rewrite the permissions: reset them, then retry.
function Read-EnvFile {
  try { return @(Get-Content -LiteralPath $envPath -ErrorAction Stop) } catch { }
  & icacls $envPath /reset | Out-Null
  & icacls $envPath /grant "*$($sid):(F)" | Out-Null
  try { return @(Get-Content -LiteralPath $envPath -ErrorAction Stop) } catch {
    Write-Host "Cannot read $envPath (access denied). Delete that file and run Setup.cmd again." -ForegroundColor Red
    exit 1
  }
}
$lines = @()
if (Test-Path -LiteralPath $envPath) { $lines = @(Read-EnvFile) }
function Get-Value([string]$name) {
  $line = $lines | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if ($line) { return ($line -replace "^$name=", '').Trim() } else { return '' }
}
function Set-Value([string]$name, [string]$value) {
  $script:lines = @($script:lines | Where-Object { $_ -notmatch "^$name=" }) + "$name=$value"
}
function Read-Secret([string]$prompt) {
  $secure = Read-Host -AsSecureString $prompt
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if (-not (Get-Value 'SUPABASE_URL')) { Set-Value 'SUPABASE_URL' $defaultUrl }
$key = Get-Value 'SUPABASE_SERVICE_ROLE_KEY'
if ($key -notmatch '^(eyJ|sb_secret_)') {
  # The old launchers kept the key in the repo's .env (Desktop\Nomadic\.env).
  $repoEnv = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nomadic\.env'
  $old = ''
  if (Test-Path $repoEnv) {
    $old = ((Get-Content $repoEnv | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=(eyJ|sb_secret_)' } | Select-Object -First 1) -replace '^SUPABASE_SERVICE_ROLE_KEY=', '').Trim()
  }
  if ($old -and (Read-Host "Found the service key in $repoEnv. Use it? (Y/n)") -notmatch '^[nN]') {
    $key = $old
  } else {
    Write-Host ''
    Write-Host 'Paste the Supabase service_role / secret key (Supabase dashboard > Project Settings > API keys).'
    Write-Host 'It is saved only in this folder''s .env and never uploaded. Typing is hidden.'
    $key = Read-Secret 'Service role key'
  }
  if ($key -notmatch '^(eyJ|sb_secret_)') {
    Write-Host 'That does not look like a service role key (it starts with eyJ or sb_secret_). Nothing saved.' -ForegroundColor Red
    exit 1
  }
  Set-Value 'SUPABASE_SERVICE_ROLE_KEY' $key
}
$key = $null
Write-Host 'Supabase service key: saved'

if (-not (Get-Value 'ADZUNA_APP_ID')) {
  Write-Host ''
  Write-Host 'Optional: Adzuna adds thousands of India jobs through its official API (free key: https://developer.adzuna.com).'
  Write-Host 'Their terms ask for "Jobs by Adzuna" credit and a licence for ongoing commercial use. Press Enter to skip.'
  $appId = (Read-Host 'Adzuna app id').Trim()
  if ($appId) {
    $appKey = Read-Secret 'Adzuna app key'
    if ($appKey) { Set-Value 'ADZUNA_APP_ID' $appId; Set-Value 'ADZUNA_APP_KEY' $appKey; Write-Host 'Adzuna: saved' }
  }
}

[IO.File]::WriteAllText($envPath, (($lines -join "`n") + "`n"), $utf8)
# Only this user (by SID, so the account name does not matter) may open the key file.
try { & icacls $envPath /inheritance:r /grant:r "*$($sid):(F)" | Out-Null } catch { }

# -- Auto scraping ------------------------------------------------------------
Write-Host ''
& (Join-Path $bin 'schedule.ps1')
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-ScheduledTask -TaskName 'Nomadic scrapers' -ErrorAction SilentlyContinue
Write-Host ''
Write-Host 'The first run has started in the background (the first one reads everything and can take an hour).' -ForegroundColor Green
Write-Host 'Follow it with "Check status.cmd"; summaries land in reports\.'
