[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Commit,
  [string]$StagingRoot = "nas-staging\Discord_Codex_BOT",
  [string]$TargetRoot = "K:\"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$candidate = $Commit.Trim()

if ($candidate -notmatch "^[0-9a-fA-F]{7,40}$") {
  throw "Rollback commit must be a 7-40 character hexadecimal Git commit."
}

$resolvedCommit = (git -C $repoRoot rev-parse --verify "$candidate^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedCommit -notmatch "^[0-9a-f]{40}$") {
  throw "Rollback commit does not resolve to a Git commit."
}

$shortCommit = (git -C $repoRoot rev-parse --short=12 $resolvedCommit).Trim()
if ($LASTEXITCODE -ne 0 -or $shortCommit -notmatch "^[0-9a-f]{7,12}$") {
  throw "Rollback commit short identity could not be resolved."
}

$status = git -C $repoRoot status --short --untracked-files=all
if ($LASTEXITCODE -ne 0) {
  throw "Cannot inspect git status before NAS rollback."
}
if (@($status | Where-Object { $_.Trim().Length -gt 0 }).Count -gt 0) {
  throw "Refusing NAS rollback from a dirty checkout."
}

$exportRoot = Join-Path $repoRoot "nas-staging\rollback-source-$shortCommit"
$resolvedExportRoot = [System.IO.Path]::GetFullPath($exportRoot)
$requiredExportPrefix = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "nas-staging\"))
if (-not $resolvedExportRoot.StartsWith($requiredExportPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to export rollback source outside nas-staging."
}

if (Test-Path -LiteralPath $resolvedExportRoot) {
  Remove-Item -LiteralPath $resolvedExportRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $resolvedExportRoot | Out-Null

try {
  Write-Host "==> export rollback source"
  $archivePath = Join-Path $resolvedExportRoot "source.tar"
  git -C $repoRoot archive --format=tar --output=$archivePath $resolvedCommit package.json package-lock.json tsconfig.json src deploy/nas/Discord_Codex_BOT
  if ($LASTEXITCODE -ne 0) {
    throw "Git archive export failed."
  }
  tar -xf $archivePath -C $resolvedExportRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback source extraction failed."
  }
  Remove-Item -LiteralPath $archivePath -Force

  $templateRoot = Join-Path $resolvedExportRoot "deploy\nas\Discord_Codex_BOT"

  Write-Host "==> prepare rollback NAS staging"
  pwsh -NoProfile -File (Join-Path $repoRoot "scripts\prepare-nas-staging.ps1") `
    -StagingRoot $StagingRoot `
    -IncludeSource `
    -SourceRoot $resolvedExportRoot `
    -TemplateRoot $templateRoot `
    -SourceCommit $shortCommit
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS staging preparation failed."
  }

  Write-Host "==> check rollback NAS staging"
  npm run nas:check -- -StagingRoot $StagingRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS staging check failed."
  }

  Write-Host "==> preflight NAS container lifecycle"
  npm run --silent nas:container:status
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS container preflight failed."
  }

  Write-Host "==> apply rollback NAS share sync"
  npm run nas:sync-share -- -StagingRoot $StagingRoot -TargetRoot $TargetRoot -Apply
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS share sync failed."
  }

  Write-Host "==> rebuild NAS container"
  npm run nas:container:rebuild
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS container rebuild failed."
  }

  Write-Host "==> verify rollback NAS deployment"
  npm run nas:deploy:verify -- --target-root $TargetRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Rollback NAS deploy verifier failed."
  }
} finally {
  if (Test-Path -LiteralPath $resolvedExportRoot) {
    Remove-Item -LiteralPath $resolvedExportRoot -Recurse -Force
  }
}
