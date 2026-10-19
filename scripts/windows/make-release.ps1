<#
  make-release.ps1
  Makes the public Windows download from an existing build: a zip holding ONLY the
  portable Nomadic.exe (nothing else), plus its SHA-256 checksums file.

    Nomadic-<version>-windows-x64.zip          -> Nomadic.exe
    Nomadic-<version>-windows-SHA256SUMS.txt   -> checksum of the zip

  Names must match packages/config/src/downloads.ts. Run after build-nomadic.ps1 (which
  calls this at the end), then upload both files to the `win-v<version>` release of
  snipy09/nomadic-releases.

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

# electron-builder's portable target (package.json -> build.portable.artifactName).
$portable = Join-Path $dist "Nomadic.$version.exe"
if (-not (Test-Path $portable)) {
  throw "Portable build not found: $portable. Run scripts\windows\build-nomadic.ps1 first."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zipName = "Nomadic-$version-windows-x64.zip"
$sumName = "Nomadic-$version-windows-SHA256SUMS.txt"
$zip     = Join-Path $OutDir $zipName

# Stage the exe alone under its download name so the zip root has exactly one file.
$stage = Join-Path ([IO.Path]::GetTempPath()) ("nomadic-release-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Copy-Item $portable (Join-Path $stage "Nomadic.exe")
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $stage "Nomadic.exe") -DestinationPath $zip -CompressionLevel Optimal
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

# Verify: exactly one entry, Nomadic.exe.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName })
} finally {
  $archive.Dispose()
}
if ($entries.Count -ne 1 -or $entries[0] -ne "Nomadic.exe") {
  throw "Zip must contain only Nomadic.exe, found: $($entries -join ', ')"
}

# sha256sum format ("<hash>  <file>"), LF, no BOM.
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText((Join-Path $OutDir $sumName), "$hash  $zipName`n")

$size = "{0:N1} MB" -f ((Get-Item $zip).Length / 1MB)
Write-Host "`nWindows download ready in: $OutDir" -ForegroundColor Cyan
Write-Host "  $zipName  ($size, contains only Nomadic.exe)" -ForegroundColor Green
Write-Host "  $sumName" -ForegroundColor Green
Write-Host "Upload: gh release create win-v$version `"$zip`" `"$(Join-Path $OutDir $sumName)`" -R snipy09/nomadic-releases" -ForegroundColor Gray
