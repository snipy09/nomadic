# Nomadic for Windows: one-line installer.
#   irm https://nomadicai.vercel.app/install/windows.ps1 | iex
# Downloads the Windows zip, checks its SHA-256, puts Nomadic.exe in %LOCALAPPDATA%\Programs\Nomadic, adds Start menu
# and Desktop shortcuts and opens it. No admin rights; nothing else on the PC is changed. Files downloaded by PowerShell
# carry no "downloaded from the internet" mark, so SmartScreen does not stop the app.
# $Version must match WINDOWS_DOWNLOAD.version in packages/config/src/downloads.ts. Keep this file ASCII.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $Version = '1.5.0'
  $Site = 'https://nomadicai.vercel.app'

  function Say($text) { Write-Host $text -ForegroundColor Cyan }

  try {
    if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'this installer is for Windows.' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Nomadic needs 64-bit Windows 10 or Windows 11.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $zipName = "Nomadic-$Version-windows-x64.zip"
    $work = Join-Path ([IO.Path]::GetTempPath()) ('nomadic-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
      Say "Downloading Nomadic $Version for Windows (about 95 MB)..."
      $zip = Join-Path $work $zipName
      try { Invoke-WebRequest -UseBasicParsing -Uri "$Site/downloads/$zipName" -OutFile $zip }
      catch { throw 'download failed. Check your internet connection and try again.' }
      $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$Site/downloads/Nomadic-$Version-windows-SHA256SUMS.txt").Content
      if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }

      $expected = ''
      foreach ($line in ($sums -split "`n")) {
        $parts = $line.Trim() -split '\s+'
        if ($parts.Count -eq 2 -and $parts[1] -eq $zipName) { $expected = $parts[0].ToLower() }
      }
      $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
      if (-not $expected -or $expected -ne $actual) { throw 'the download is damaged (checksum mismatch). Run the command again.' }
      Say 'Checksum OK.'

      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $unzipped = Join-Path $work 'unzipped'
      [IO.Compression.ZipFile]::ExtractToDirectory($zip, $unzipped)
      $newExe = Join-Path $unzipped 'Nomadic.exe'
      if (-not (Test-Path $newExe)) { throw 'Nomadic.exe is missing from the zip.' }

      # Close a running copy so it can be replaced.
      Get-Process -Name 'Nomadic', 'NomadicOS' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2

      $dest = Join-Path $env:LOCALAPPDATA 'Programs\Nomadic'
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      $exe = Join-Path $dest 'Nomadic.exe'
      Copy-Item $newExe $exe -Force
      Unblock-File $exe -ErrorAction SilentlyContinue

      $shell = New-Object -ComObject WScript.Shell
      $places = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
      foreach ($place in $places) {
        if (-not $place) { continue }
        $link = $shell.CreateShortcut((Join-Path $place 'Nomadic.lnk'))
        $link.TargetPath = $exe
        $link.WorkingDirectory = $dest
        $link.Description = 'Nomadic'
        $link.Save()
      }

      Say "Installed in $dest (Start menu and Desktop shortcuts added). Opening Nomadic..."
      Start-Process -FilePath $exe -WorkingDirectory $dest
    } finally {
      Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  }
}
