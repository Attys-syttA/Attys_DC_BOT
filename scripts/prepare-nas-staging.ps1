[CmdletBinding()]
param(
  [string]$StagingRoot = "nas-staging\Discord_Codex_BOT",
  [switch]$IncludeSource,
  [switch]$AllowDirtySource,
  [string]$SourceRoot = "",
  [string]$TemplateRoot = "",
  [string]$SourceCommitOverride = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$effectiveTemplateRoot = if ($TemplateRoot.Trim().Length -gt 0) { [System.IO.Path]::GetFullPath($TemplateRoot) } else { Join-Path $repoRoot "deploy\nas\Discord_Codex_BOT" }
$effectiveSourceRoot = if ($SourceRoot.Trim().Length -gt 0) { [System.IO.Path]::GetFullPath($SourceRoot) } else { $repoRoot }
$targetRoot = Join-Path $repoRoot $StagingRoot
$resolvedTargetRoot = [System.IO.Path]::GetFullPath($targetRoot)
$requiredTargetPrefix = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "nas-staging\"))

if (-not $resolvedTargetRoot.StartsWith($requiredTargetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside the repository nas-staging folder: $resolvedTargetRoot"
}

if (-not (Test-Path -LiteralPath $effectiveTemplateRoot)) {
  throw "NAS template folder is missing: $effectiveTemplateRoot"
}

if (-not (Test-Path -LiteralPath $effectiveSourceRoot)) {
  throw "NAS source folder is missing: $effectiveSourceRoot"
}

if ($IncludeSource -and -not $AllowDirtySource -and $effectiveSourceRoot -eq $repoRoot) {
  $status = git -C $repoRoot status --short --untracked-files=all
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot inspect git status before source staging."
  }
  if (@($status | Where-Object { $_.Trim().Length -gt 0 }).Count -gt 0) {
    throw "Refusing to copy source from a dirty checkout. Commit/stash unrelated work or rerun with -AllowDirtySource after review."
  }
}

if (Test-Path -LiteralPath $resolvedTargetRoot) {
  Remove-Item -LiteralPath $resolvedTargetRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $resolvedTargetRoot | Out-Null
Copy-Item -Path (Join-Path $effectiveTemplateRoot "*") -Destination $resolvedTargetRoot -Recurse -Force

$appRoot = Join-Path $resolvedTargetRoot "app"
$sourceCommit = "unknown"
$packageVersion = "unknown"

try {
  if ($SourceCommitOverride.Trim().Length -gt 0) {
    $sourceCommit = $SourceCommitOverride.Trim()
  } else {
    $sourceCommitValue = git -C $repoRoot rev-parse --short=12 HEAD
    if ($LASTEXITCODE -eq 0 -and $sourceCommitValue) {
      $sourceCommit = [string]$sourceCommitValue
    }
  }
} catch {
  $sourceCommit = "unknown"
}

try {
    $packageJson = Get-Content -LiteralPath (Join-Path $effectiveSourceRoot "package.json") -Raw | ConvertFrom-Json
  if ($packageJson.version) {
    $packageVersion = [string]$packageJson.version
  }
} catch {
  $packageVersion = "unknown"
}

if ($IncludeSource) {
  $sourceItems = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src"
  )

  foreach ($item in $sourceItems) {
    $sourcePath = Join-Path $effectiveSourceRoot $item
    $destinationPath = Join-Path $appRoot $item
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      throw "Required source item is missing: $sourcePath"
    }
    if ((Get-Item -LiteralPath $sourcePath).PSIsContainer) {
      Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
    } else {
      Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }
  }
}

$buildInfo = [ordered]@{
  sourceCommit = $sourceCommit
  packageVersion = $packageVersion
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  includeSource = [bool]$IncludeSource
}
$buildInfoJson = $buildInfo | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $appRoot "NAS_BUILD_INFO.json"), $buildInfoJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

$composePath = Join-Path $resolvedTargetRoot "docker-compose.yml"
if (Test-Path -LiteralPath $composePath) {
  $composeText = Get-Content -LiteralPath $composePath -Raw
  $safeSourceCommit = if ($sourceCommit -match "^[A-Za-z0-9._-]{1,80}$") { $sourceCommit } else { "unknown" }
  $safePackageVersion = if ($packageVersion -match "^[A-Za-z0-9._-]{1,80}$") { $packageVersion } else { "unknown" }
  $safeImageTag = ($safeSourceCommit.ToLowerInvariant() -replace "[^a-z0-9_.-]", "-")
  if (-not $safeImageTag -or $safeImageTag -eq "unknown") {
    $safeImageTag = "local"
  }
  if ($safeImageTag.Length -gt 80) {
    $safeImageTag = $safeImageTag.Substring(0, 80)
  }
  $composeText = $composeText.Replace("__ATTYS_NAS_IMAGE_TAG__", $safeImageTag)
  $composeText = $composeText.Replace("__ATTYS_NAS_SOURCE_COMMIT__", $safeSourceCommit)
  $composeText = $composeText.Replace("__ATTYS_NAS_PACKAGE_VERSION__", $safePackageVersion)
  [System.IO.File]::WriteAllText($composePath, $composeText, [System.Text.UTF8Encoding]::new($false))
}

foreach ($dir in @("data", "data\handoff", "data\handoff\inbox", "data\handoff\outbox", "data\handoff\archive", "data\handoff\tmp", "logs")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $resolvedTargetRoot $dir) | Out-Null
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

$stagedFiles = Get-ChildItem -LiteralPath $resolvedTargetRoot -Recurse -File
foreach ($file in $stagedFiles) {
  $relativePath = [System.IO.Path]::GetRelativePath($resolvedTargetRoot, $file.FullName)
  $normalized = $relativePath -replace "/", "\"
  foreach ($pattern in $forbiddenPatterns) {
    if ($normalized -match $pattern) {
      throw "Forbidden file in NAS staging output: $relativePath"
    }
  }
}

$manifestFiles = $stagedFiles |
  Sort-Object FullName |
  ForEach-Object {
    $relativePath = [System.IO.Path]::GetRelativePath($resolvedTargetRoot, $_.FullName) -replace "\\", "/"
    [ordered]@{
      path = $relativePath
      size = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  layoutRoot = "Discord_Codex_BOT"
  includeSource = [bool]$IncludeSource
  sourceCommit = $sourceCommit
  packageVersion = $packageVersion
  notes = @(
    "Copy the contents of this folder into the NAS Discord_Codex_BOT shared folder.",
    "Do not add real .env.nas values to Git.",
    "NAS-side Codex execution remains disabled in this slice."
  )
  files = $manifestFiles
}

$manifestPath = Join-Path $resolvedTargetRoot "NAS_STAGING_MANIFEST.json"
$json = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Host "Prepared NAS staging folder: $resolvedTargetRoot"
Write-Host "Copy this folder's contents to the NAS Discord_Codex_BOT shared folder when deployment is approved."
