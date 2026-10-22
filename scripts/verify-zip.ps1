param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ArchivePath) {
  $releaseVersion = (Get-Content -Raw -Encoding UTF8 (Join-Path $projectRoot 'package.json') | ConvertFrom-Json).version
  $ArchivePath = Join-Path (Split-Path -Parent $projectRoot) "outputs\figma-to-codex-exporter-v$releaseVersion.zip"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $checkedCount = 0
  foreach ($entry in $archive.Entries) {
    $prefix = 'figma-to-codex-exporter/'
    if (-not $entry.FullName.StartsWith($prefix)) { throw "Unexpected archive root: $($entry.FullName)" }
    $relative = $entry.FullName.Substring($prefix.Length)
    $actualPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $actualPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe archive path' }
    $stream = $entry.Open()
    $memory = New-Object System.IO.MemoryStream
    try { $stream.CopyTo($memory); $actual = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $expected = [System.IO.File]::ReadAllBytes($actualPath)
    if ([Convert]::ToBase64String($expected) -cne [Convert]::ToBase64String($actual)) { throw "Bytes differ: $relative" }
    $checkedCount++
  }
  $manifestEntry = $archive.GetEntry('figma-to-codex-exporter/manifest.json')
  $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  foreach ($reference in @($manifest.main, $manifest.ui)) {
    if (-not $archive.GetEntry('figma-to-codex-exporter/' + $reference)) { throw "Missing manifest reference: $reference" }
  }
  Write-Output "Windows .NET ZIP check passed: $checkedCount files match local bytes; main/ui references present."
} finally { $archive.Dispose() }
