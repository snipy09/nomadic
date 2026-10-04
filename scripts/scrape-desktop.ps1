# Scrapes jobs and publishes them to Supabase from this computer (Windows), with a per-run summary.
# Used by the launchers in Desktop\Nomadic-Scraper (docs/SCRAPER_LAPTOP.md). At most -MaxNew jobs that are not
# in Supabase yet are added per run; jobs already there are refreshed, duplicates of published jobs are skipped.
#   -SummaryDir  where scrape-<time>.txt, latest-summary.txt and history.csv go
#   -Quiet       scheduled run: never prompt, never open Notepad
# Extra arguments go to the scraper CLI (e.g. --sources internshala,lever).
param(
  [string]$SummaryDir = '',
  [int]$MaxNew = 100,
  [switch]$Quiet,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (-not $SummaryDir) { $SummaryDir = Join-Path $repo 'scrape-output\summaries' }
New-Item -ItemType Directory -Force -Path $SummaryDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repo 'scrape-output') | Out-Null
$log = Join-Path $repo 'scrape-output\scrape.log'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$defaultUrl = 'https://grqkiddfwoyicktpgdea.supabase.co'

function Fail([string]$message) {
  Write-Host "[scrape] $message" -ForegroundColor Red
  Add-Content -Path (Join-Path $SummaryDir 'errors.log') -Value "$(Get-Date -Format s) $message"
  exit 1
}

# ── Service role key (bypasses RLS: kept only in the git-ignored .env) ─────────
$envPath = Join-Path $repo '.env'
$lines = @()
if (Test-Path $envPath) { $lines = @(Get-Content $envPath) }
$hasKey = [bool]($lines | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=(eyJ|sb_secret_)' })
if (-not $hasKey) {
  if ($Quiet) { Fail 'SUPABASE_SERVICE_ROLE_KEY is not set in .env. Double-click "Run scraper.cmd" once to enter it.' }
  Write-Host 'First run: paste the Supabase service_role / secret key.'
  Write-Host '(Supabase dashboard > Project Settings > API keys. It is saved only in this computer''s .env.)'
  $secure = Read-Host -AsSecureString 'Service role key'
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($key -notmatch '^(eyJ|sb_secret_)') { Fail 'That does not look like a service role key (starts with eyJ or sb_secret_). Nothing saved.' }
  $kept = @($lines | Where-Object { $_ -notmatch '^SUPABASE_SERVICE_ROLE_KEY=' })
  if (-not ($kept | Where-Object { $_ -match '^SUPABASE_URL=\S' })) { $kept = @($kept | Where-Object { $_ -notmatch '^SUPABASE_URL=' }) + "SUPABASE_URL=$defaultUrl" }
  $kept += "SUPABASE_SERVICE_ROLE_KEY=$key"
  [IO.File]::WriteAllText($envPath, (($kept -join "`n") + "`n"), $utf8)
  $key = $null
  Write-Host '[scrape] Key saved to .env.'
}

# ── Dependencies (once; no Electron or browser downloads) ──────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is not installed (nodejs.org, version 22 LTS).' }
if (-not (Test-Path (Join-Path $repo 'node_modules\tsx'))) {
  Write-Host '[scrape] Installing dependencies once...'
  & npm.cmd ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' }
}

# ── Run ────────────────────────────────────────────────────────────────────────
Add-Content -Path $log -Value "[scrape] $(Get-Date -Format s) starting (max new $MaxNew)"
$cliArgs = @('tsx', 'packages\scrapers\src\cli.ts', 'run', '--publish', '--max-new', "$MaxNew", '--summary-dir', $SummaryDir, '--json', 'scrape-output\report.json') + $Rest
$ErrorActionPreference = 'Continue'
& npx.cmd @cliArgs 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
$rc = $LASTEXITCODE
Add-Content -Path $log -Value "[scrape] $(Get-Date -Format s) finished with exit code $rc"

$latest = Join-Path $SummaryDir 'latest-summary.txt'
if ($rc -ne 0) { Add-Content -Path (Join-Path $SummaryDir 'errors.log') -Value "$(Get-Date -Format s) scraper exited with code $rc (see $log)" }
elseif ((Test-Path $latest) -and -not $Quiet) { Start-Process notepad.exe $latest }
exit $rc
