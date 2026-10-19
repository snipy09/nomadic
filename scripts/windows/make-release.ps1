<#
  make-release.ps1
  Makes the public Windows download from an existing build: a zip holding ONLY the
  installer "Nomadic Setup.exe" (nothing else), plus its SHA-256 checksums file.

    Nomadic-<version>-windows-x64.zip          -> Nomadic Setup.exe
    Nomadic-<version>-windows-SHA256SUMS.txt   -> checksum of the zip

  Names must match packages/config/src/downloads.ts and apps/web/public/install/windows.ps1.
  Run after build-nomadic.ps1 (which calls this at the end), then upload both files to the
  `win-v<version>` release of snipy09/nomadic-releases.

  USAGE (PowerShell, from the repo root):
    .\scripts\windows\make-release.ps1
    .\scripts\windows\make-release.ps1 -OutDir "D:\somewhere"
#>

param(
  [string]$OutDir
)

$ErrorActionPreference = "Stop"
$root    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$version = (Get-Content (Join-Path $root "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
$dist    = Join-Path $root "apps\desktop\dist-electron"
if (-not $OutDir) {
  $OutDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "Nomadic Content\App builds\Nomadic $version downloads"
}

# electron-builder's NSIS target (package.json -> build.nsis.artifactName).
$setup = Join-Path $dist "Nomadic.Setup.$version.exe"
if (-not (Test-Path $setup)) {
  throw "Installer build not found: $setup. Run scripts\windows\build-nomadic.ps1 first."
}

$entryName = "Nomadic Setup.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zipName = "Nomadic-$version-windows-x64.zip"
$sumName = "Nomadic-$version-windows-SHA256SUMS.txt"
$zip     = Join-Path $OutDir $zipName

# Stage the installer alone under its download name so the zip root has exactly one file.
$stage = Join-Path ([IO.Path]::GetTempPath()) ("nomadic-release-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Copy-Item $setup (Join-Path $stage $entryName)
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -LiteralPath (Join-Path $stage $entryName) -DestinationPath $zip -CompressionLevel Optimal
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

# Verify: exactly one entry, the installer.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName })
} finally {
  $archive.Dispose()
}
if ($entries.Count -ne 1 -or $entries[0] -ne $entryName) {
  throw "Zip must contain only $entryName, found: $($entries -join ', ')"
}

# sha256sum format ("<hash>  <file>"), LF, no BOM.
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText((Join-Path $OutDir $sumName), "$hash  $zipName`n")

$size = "{0:N1} MB" -f ((Get-Item $zip).Length / 1MB)
Write-Host "`nWindows download ready in: $OutDir" -ForegroundColor Cyan
Write-Host "  $zipName  ($size, contains only $entryName)" -ForegroundColor Green
Write-Host "  $sumName" -ForegroundColor Green
Write-Host "Upload: gh release upload win-v$version `"$zip`" `"$(Join-Path $OutDir $sumName)`" --clobber -R snipy09/nomadic-releases" -ForegroundColor Gray
