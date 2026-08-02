[CmdletBinding()]
param(
  [string]$StagingRoot = "nas-staging\Discord_Codex_BOT",
  [string]$TargetRoot = "K:\",
  [switch]$Prepare,
  [switch]$IncludeSource,
  [switch]$AllowDirtySource,
  [switch]$AllowStaleSource,
  [switch]$Apply,
  [switch]$NoRemoveBeforeCopy,
  [switch]$Detailed,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$prepareScript = Join-Path $PSScriptRoot "prepare-nas-staging.ps1"
$checkScript = Join-Path $PSScriptRoot "check-nas-staging.ps1"

function Resolve-SafeRoot([string]$PathValue, [string]$Kind) {
  $basePath = if ([System.IO.Path]::IsPathRooted($PathValue)) {
    $PathValue
  } else {
    Join-Path (Get-Location) $PathValue
  }
  $resolved = [System.IO.Path]::GetFullPath($basePath)
  if (-not (Test-Path -LiteralPath $resolved)) {
    throw "$Kind does not exist: $resolved"
  }
  return $resolved.TrimEnd("\", "/")
}

function Get-RelativePath([string]$Root, [string]$PathValue) {
  return [System.IO.Path]::GetRelativePath($Root, $PathValue) -replace "\\", "/"
}

function Test-ProtectedTargetRelativePath([string]$RelativePath) {
  $normalized = $RelativePath -replace "\\", "/"
  return $normalized -eq ".env.nas" `
    -or $normalized -eq ".env" `
    -or $normalized -like "logs/*" `
    -or $normalized -like "#recycle/*" `
    -or $normalized -like "data/handoff/inbox/*" `
    -or $normalized -like "data/handoff/outbox/*" `
    -or $normalized -like "data/handoff/archive/*" `
    -or $normalized -like "data/handoff/tmp/*" `
    -or $normalized -like "data/*.json"
}

function Get-StagingFreshness([string]$RepoRoot, [string]$StagingRootPath, [object]$Manifest) {
  if (-not [bool]$Manifest.includeSource) {
    return [ordered]@{
      includeSource = $false
      status = "not-included"
    }
  }

  $sourceItems = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src"
  )
  $sourceFiles = foreach ($item in $sourceItems) {
    $sourcePath = Join-Path $RepoRoot $item
    if (Test-Path -LiteralPath $sourcePath) {
      Get-ChildItem -LiteralPath $sourcePath -Recurse -File
    }
  }
  $stagedSourceFiles = Get-ChildItem -LiteralPath (Join-Path $StagingRootPath "app") -Recurse -File
  $latestSource = @($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
  $latestStaged = @($stagedSourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)

  if (-not $latestSource -or -not $latestStaged) {
    return [ordered]@{
      includeSource = $true
      status = "unknown"
    }
  }

  $stale = $latestSource[0].LastWriteTimeUtc -gt $latestStaged[0].LastWriteTimeUtc
  return [ordered]@{
    includeSource = $true
    status = if ($stale) { "stale" } else { "fresh" }
  }
}

if ($Prepare) {
  $prepareArgs = @("-NoProfile", "-File", $prepareScript, "-StagingRoot", $StagingRoot)
  if ($IncludeSource) { $prepareArgs += "-IncludeSource" }
  if ($AllowDirtySource) { $prepareArgs += "-AllowDirtySource" }
  & pwsh @prepareArgs
  if ($LASTEXITCODE -ne 0) {
    throw "NAS staging preparation failed."
  }
}

& pwsh -NoProfile -File $checkScript -StagingRoot $StagingRoot
if ($LASTEXITCODE -ne 0) {
  throw "NAS staging check failed."
}

$stagingRootPath = Join-Path $repoRoot $StagingRoot
$resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRootPath).TrimEnd("\", "/")
$requiredStagingPrefix = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "nas-staging\"))
if (-not $resolvedStagingRoot.StartsWith($requiredStagingPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to sync from outside repository nas-staging: $resolvedStagingRoot"
}

$resolvedTargetRoot = Resolve-SafeRoot $TargetRoot "NAS target root"
if ($resolvedTargetRoot -eq $resolvedStagingRoot) {
  throw "Refusing to sync staging root onto itself."
}

$manifestPath = Join-Path $resolvedStagingRoot "NAS_STAGING_MANIFEST.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$stagingSource = Get-StagingFreshness -RepoRoot $repoRoot -StagingRootPath $resolvedStagingRoot -Manifest $manifest
if ($Apply -and $stagingSource.status -eq "stale" -and -not $AllowStaleSource) {
  throw "Refusing to apply stale NAS staging source. Rerun nas:prepare with reviewed source or pass -AllowStaleSource after explicit review."
}
$manifestFiles = @($manifest.files | ForEach-Object { [string]$_.path })
$copyRelativePaths = @($manifestFiles + "NAS_STAGING_MANIFEST.json" | Sort-Object -Unique)

$planned = [System.Collections.Generic.List[object]]::new()
$removeBeforeCopy = -not [bool]$NoRemoveBeforeCopy

foreach ($relativePath in $copyRelativePaths) {
  if (Test-ProtectedTargetRelativePath $relativePath) {
    $planned.Add([ordered]@{
      action = "skip-protected"
      path = $relativePath
    }) | Out-Null
    continue
  }

  $sourcePath = Join-Path $resolvedStagingRoot ($relativePath -replace "/", "\")
  $targetPath = Join-Path $resolvedTargetRoot ($relativePath -replace "/", "\")

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Staging file is missing before sync: $relativePath"
  }

  $action = "copy"
  if (Test-Path -LiteralPath $targetPath) {
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    if ($sourceHash -eq $targetHash) {
      $action = "skip"
    } elseif ($removeBeforeCopy) {
      $action = "replace-delete-first"
    } else {
      $action = "replace"
    }
  }

  $planned.Add([ordered]@{
    action = $action
    path = $relativePath
  }) | Out-Null

  if ($Apply -and $action -ne "skip") {
    $targetParent = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    if ((Test-Path -LiteralPath $targetPath) -and $removeBeforeCopy) {
      Remove-Item -LiteralPath $targetPath -Force
    }
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  }
}

$summary = [ordered]@{
  mode = if ($Apply) { "applied" } else { "dry-run" }
  targetRoot = "<nas-share>"
  stagingSource = $stagingSource
  copiedOrReplaced = @($planned | Where-Object { $_.action -notin @("skip", "skip-protected") }).Count
  skipped = @($planned | Where-Object { $_.action -eq "skip" }).Count
  protectedSkipped = @($planned | Where-Object { $_.action -eq "skip-protected" }).Count
  removeBeforeCopy = $removeBeforeCopy
  protectedPathsPreserved = @(".env.nas", "data/*.json", "data/handoff/*", "logs/*", "#recycle/*")
}

if ($Detailed) {
  $summary.changes = $planned
}

if ($Json) {
  $summary | ConvertTo-Json -Depth 5
} else {
  $mode = $summary.mode
  $stagingSourceStatus = $summary.stagingSource.status
  "NAS share sync: $mode"
  "staging-source: $stagingSourceStatus"
  "pending managed changes: $($summary.copiedOrReplaced)"
  "unchanged managed files: $($summary.skipped)"
  "protected preserved: $($summary.protectedSkipped)"
  "delete-before-copy: $(if ($summary.removeBeforeCopy) { "enabled" } else { "disabled" })"
  "writes: $(if ($Apply) { "enabled" } else { "disabled" })"
  if ($Detailed) {
    "changes:"
    $planned | ForEach-Object { "- $($_.action): $($_.path)" }
  } else {
    "details: hidden by default; re-run with -Detailed for managed file actions"
  }
}
