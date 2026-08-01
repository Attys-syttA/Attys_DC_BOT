[CmdletBinding()]
param(
  [string]$StagingRoot = "nas-staging\Discord_Codex_BOT"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = Join-Path $repoRoot $StagingRoot
$resolvedTargetRoot = [System.IO.Path]::GetFullPath($targetRoot)
$requiredTargetPrefix = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "nas-staging\"))

if (-not $resolvedTargetRoot.StartsWith($requiredTargetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to inspect outside the repository nas-staging folder: $resolvedTargetRoot"
}

if (-not (Test-Path -LiteralPath $resolvedTargetRoot)) {
  throw "NAS staging folder is missing. Run npm run nas:prepare first."
}

$manifestPath = Join-Path $resolvedTargetRoot "NAS_STAGING_MANIFEST.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "NAS staging manifest is missing: $manifestPath"
}

$forbiddenPatterns = @(
  "\.env$",
  "\\node_modules\\",
  "\\dist\\",
  "\\\.git\\",
  "\\\.codex\\",
  "\\\.discord-bot-state\\",
  "\.sqlite(?:-shm|-wal)?$",
  "\.log$"
)

$files = Get-ChildItem -LiteralPath $resolvedTargetRoot -Recurse -File
foreach ($file in $files) {
  $relativePath = [System.IO.Path]::GetRelativePath($resolvedTargetRoot, $file.FullName)
  $normalized = $relativePath -replace "/", "\"
  foreach ($pattern in $forbiddenPatterns) {
    if ($normalized -match $pattern) {
      throw "Forbidden file in NAS staging output: $relativePath"
    }
  }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected = @{}
foreach ($entry in $manifest.files) {
  $expected[$entry.path] = $entry
}

$actualFiles = $files |
  Where-Object { $_.Name -ne "NAS_STAGING_MANIFEST.json" } |
  ForEach-Object {
    [System.IO.Path]::GetRelativePath($resolvedTargetRoot, $_.FullName) -replace "\\", "/"
  }

foreach ($path in $actualFiles) {
  if (-not $expected.ContainsKey($path)) {
    throw "File is present but missing from NAS staging manifest: $path"
  }
}

foreach ($path in $expected.Keys) {
  $filePath = Join-Path $resolvedTargetRoot ($path -replace "/", "\")
  if (-not (Test-Path -LiteralPath $filePath)) {
    throw "Manifest file is missing from NAS staging output: $path"
  }

  $file = Get-Item -LiteralPath $filePath
  $hash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($file.Length -ne [int64]$expected[$path].size) {
    throw "Manifest size mismatch for $path"
  }
  if ($hash -ne [string]$expected[$path].sha256) {
    throw "Manifest hash mismatch for $path"
  }
}

Write-Host "NAS staging check passed: $resolvedTargetRoot"
