# Runs a Nomadic APK on this PC: starts the Android emulator (AVD NomadicTest, created if missing), installs the APK
# and opens the app. A phone plugged in over USB with USB debugging on is used instead of the emulator.
# APK: the path given as the first argument (or dropped on the .cmd), else the newest local Gradle build, else the
# public release APK (version from packages/config/src/downloads.ts). Keep this file ASCII (PowerShell 5.1).
param([string]$Apk = '')
# Continue, not Stop: PowerShell 5.1 turns any stderr line of adb/sdkmanager into a terminating error under Stop.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$pkg = 'com.nomadic.career'
$avd = 'NomadicTest'
$image = 'system-images;android-35;google_apis;x86_64'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "-> $msg" -ForegroundColor Cyan }

# --- Android SDK -------------------------------------------------------------------------------------------------
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
  Where-Object { $_ -and (Test-Path (Join-Path $_ 'platform-tools\adb.exe')) } | Select-Object -First 1
if (-not $sdk) {
  Fail ("Android SDK not found. Install Android Studio (https://developer.android.com/studio), open it once so it " +
    "downloads the SDK to $env:LOCALAPPDATA\Android\Sdk, then run this again.")
}
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$cmdline = Get-ChildItem (Join-Path $sdk 'cmdline-tools') -Directory -ErrorAction SilentlyContinue |
  Sort-Object { if ($_.Name -eq 'latest') { 'zzz' } else { $_.Name } } -Descending | Select-Object -First 1
$sdkmanager = if ($cmdline) { Join-Path $cmdline.FullName 'bin\sdkmanager.bat' } else { $null }
$avdmanager = if ($cmdline) { Join-Path $cmdline.FullName 'bin\avdmanager.bat' } else { $null }
$yes = 1..30 | ForEach-Object { 'y' }
# sdkmanager/avdmanager need Java; fall back to the JDK bundled with Android Studio.
if (-not $env:JAVA_HOME) {
  $jbr = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
}
Write-Host "Android SDK: $sdk"

# --- APK ---------------------------------------------------------------------------------------------------------
if (-not $Apk) {
  $outputs = Join-Path $repoRoot 'apps\android\android\app\build\outputs\apk'
  $local = Get-ChildItem $outputs -Recurse -Filter '*.apk' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($local) {
    $Apk = $local.FullName
    Write-Host "Using the newest local build ($($local.LastWriteTime))."
  } else {
    $downloads = Get-Content -Raw (Join-Path $repoRoot 'packages\config\src\downloads.ts')
    $m = [regex]::Match($downloads, "ANDROID_DOWNLOAD[^=]*=\s*\{\s*version:\s*'([0-9.]+)'")
    if (-not $m.Success) { Fail 'No local APK and no Android release version in packages/config/src/downloads.ts.' }
    $ver = $m.Groups[1].Value
    $dir = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nomadic Content\APK test'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $Apk = Join-Path $dir "Nomadic-$ver-android.apk"
    if (-not (Test-Path -LiteralPath $Apk)) {
      $url = "https://github.com/snipy09/nomadic-releases/releases/download/android-v$ver/Nomadic-$ver-android.apk"
      Step "Downloading the public $ver APK..."
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      try { Invoke-WebRequest -Uri $url -OutFile "$Apk.part" -UseBasicParsing -ErrorAction Stop } catch { Fail "Download failed: $url" }
      Move-Item -LiteralPath "$Apk.part" -Destination $Apk -Force
    }
  }
}
if (-not (Test-Path -LiteralPath $Apk)) { Fail "APK not found: $Apk" }
$Apk = (Resolve-Path -LiteralPath $Apk).Path
Write-Host "APK: $Apk"

# --- Device: a USB phone or a running emulator, else start the AVD ----------------------------------------------
& $adb start-server | Out-Null
function Get-Devices { & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' } | ForEach-Object { ($_ -split '\t')[0] } }
$serial = Get-Devices | Select-Object -First 1
if ($serial) {
  Write-Host "Using connected device $serial."
} else {
  if (-not (Test-Path $emulator)) {
    if (-not $sdkmanager) { Fail 'The Android Emulator is not installed. In Android Studio: More Actions > SDK Manager > SDK Tools > tick Android Emulator and Android SDK Command-line Tools.' }
    Step 'Installing the Android Emulator...'
    $yes | & $sdkmanager --licenses | Out-Null
    & $sdkmanager 'emulator' 'platform-tools'
  }
  $avds = & $emulator -list-avds
  if ($avds -notcontains $avd) {
    if (-not $sdkmanager) { Fail "AVD $avd not found and the SDK Command-line Tools are missing (Android Studio: SDK Manager > SDK Tools > Android SDK Command-line Tools)." }
    Step "Creating the $avd emulator (Pixel 7, Android 15). The first time downloads about 1.5 GB..."
    $yes | & $sdkmanager --licenses | Out-Null
    & $sdkmanager $image
    if ($LASTEXITCODE -ne 0) { Fail "Could not download $image." }
    'no' | & $avdmanager create avd -n $avd -k $image -d pixel_7 --force
    if ($LASTEXITCODE -ne 0) { Fail "Could not create the $avd emulator." }
  }
  Step "Starting the $avd emulator (a window opens; first boot takes 1-3 minutes)..."
  Start-Process -FilePath $emulator -ArgumentList @('-avd', $avd, '-gpu', 'auto') -WindowStyle Minimized
  $deadline = (Get-Date).AddMinutes(5)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    $serial = Get-Devices | Where-Object { $_ -like 'emulator-*' } | Select-Object -First 1
    if ($serial -and ((& $adb -s $serial shell getprop sys.boot_completed 2>$null) -match '1')) { break }
    $serial = $null
  }
  if (-not $serial) {
    Fail ('The emulator did not finish booting in 5 minutes. If it said hardware acceleration is missing: Windows ' +
      'Features > tick Windows Hypervisor Platform, restart, run this again.')
  }
  Write-Host "Emulator $serial is ready."
}

# --- Install and open ---------------------------------------------------------------------------------------------
Step 'Installing Nomadic...'
$out = (& $adb -s $serial install -r $Apk 2>&1) -join "`n"
if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|INSTALL_FAILED_VERSION_DOWNGRADE') {
  # Never on a real phone: uninstalling would wipe the owner's own app data there.
  if ($serial -notlike 'emulator-*') { Fail "A Nomadic with another signing key or a newer version is on the phone. Uninstall it there first.`n$out" }
  Write-Host 'A Nomadic with another signing key or a newer version is installed; removing it (its app data goes too)...' -ForegroundColor Yellow
  & $adb -s $serial uninstall $pkg | Out-Null
  $out = (& $adb -s $serial install $Apk 2>&1) -join "`n"
}
if ($out -notmatch 'Success') { Fail "Install failed:`n$out" }
& $adb -s $serial shell am force-stop $pkg | Out-Null
& $adb -s $serial shell am start -n "$pkg/.MainActivity" | Out-Null

Write-Host ''
Write-Host "Nomadic is open on $serial." -ForegroundColor Green
Write-Host 'Run this again after a new build to update it (app data is kept). Close the emulator window when done.'
Write-Host 'Google sign-in on the emulator needs a Google account added in its Settings, and works only with the release APK.'
