<#
.SYNOPSIS
  Prints the text in an image using the built-in Windows OCR engine.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\ocr.ps1 -ImagePath .\screenshot.png
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$ImagePath
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
  Write-Error "Image not found: $ImagePath"
  exit 1
}
# WinRT StorageFile needs an absolute path.
$resolvedPath = (Resolve-Path -LiteralPath $ImagePath).ProviderPath

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$fileTask = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPath)
$fileTask.AsTask().Wait()
$file = $fileTask.GetResults()

$streamTask = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
$streamTask.AsTask().Wait()
$stream = $streamTask.GetResults()

$decoderTask = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
$decoderTask.AsTask().Wait()
$decoder = $decoderTask.GetResults()

$bitmapTask = $decoder.GetSoftwareBitmapAsync()
$bitmapTask.AsTask().Wait()
$bitmap = $bitmapTask.GetResults()

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$ocrTask = $engine.RecognizeAsync($bitmap)
$ocrTask.AsTask().Wait()
$result = $ocrTask.GetResults()

Write-Output $result.Text
