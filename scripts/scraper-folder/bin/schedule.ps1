# Turns auto scraping on (or off with -Remove): a Windows scheduled task "Nomadic scrapers" for this user that starts
# bin\run-scheduled.vbs every 30 minutes and at sign-in. Each start runs only the scrapers that are due (settings.ini),
# so the interval per scraper is set there, not here. Runs while this computer is on and you are signed in; a run
# missed during sleep starts when the computer wakes. No administrator rights needed.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$bin = $PSScriptRoot
$folder = Split-Path -Parent $bin
$taskName = 'Nomadic scrapers'

# The 6-hour task of the old launchers (Schedule every 6 hours.cmd) is replaced by this one.
cmd /c 'schtasks /Delete /TN "Nomadic scraper" /F >nul 2>nul'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Auto scraping is OFF. Run "Start auto scraping.cmd" to turn it back on.'
  exit 0
}

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
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host 'Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org, then run this again.' -ForegroundColor Red
  exit 1
}
[IO.File]::WriteAllText((Join-Path $bin 'node-path.txt'), $node, (New-Object System.Text.UTF8Encoding($false)))

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
if (Test-Path $wscript) {
  $action = New-ScheduledTaskAction -Execute $wscript -Argument "//B //NoLogo `"$bin\run-scheduled.vbs`"" -WorkingDirectory $folder
} else {
  # Windows without VBScript: PowerShell with a hidden window (it may flash briefly).
  $command = "& '$node' '$bin\nomadic-scrapers.mjs' auto --home '$folder'"
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$command`"" -WorkingDirectory $folder
}
$user = "$env:USERDOMAIN\$env:USERNAME"
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4) -RunOnlyIfNetworkAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$description = "Nomadic scrapers in $folder. Every 30 minutes runs the scrapers that are due (settings.ini) and publishes to Supabase."

function Register([object[]]$triggers) {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description $description -Force | Out-Null
}
try {
  Register @($every, (New-ScheduledTaskTrigger -AtLogOn -User $user))
} catch {
  try {
    # Some Windows setups refuse a sign-in trigger without admin rights: the 30-minute trigger alone still catches up.
    Register @($every)
  } catch {
    # Older Windows needs an explicit repetition length.
    $every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
    Register @($every)
  }
}
Write-Host "Auto scraping is ON: every 30 minutes the scrapers that are due run in the background (intervals in settings.ini)."
Write-Host "Check what ran with ""Check status.cmd"". Turn it off with ""Stop auto scraping.cmd""."
