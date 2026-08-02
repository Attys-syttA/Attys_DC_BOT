[CmdletBinding()]
param(
  [string]$StagingRoot = "nas-staging\Discord_Codex_BOT",
  [string]$TargetRoot = "K:\",
  [switch]$Apply,
  [switch]$AllowDirtySource,
  [switch]$AllowStaleSource,
  [switch]$NoIncludeSource,
  [switch]$SkipRebuild,
  [switch]$ForceRebuild,
  [switch]$SkipVerify,
  [int]$WaitAfterRebuildSec = 65
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Test-NasDeployAlreadyCurrent {
  param(
    [string]$TargetRootValue
  )

  $outputLines = @(& npm run --silent nas:deploy:verify -- --target-root $TargetRootValue --json 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) {
    return $false
  }

  try {
    $parsed = ($outputLines -join "`n") | ConvertFrom-Json
    return $parsed.ok -eq $true
  } catch {
    return $false
  }
}

Push-Location $repoRoot
try {
  $prepareArgs = @("run", "nas:prepare", "--", "-StagingRoot", $StagingRoot)
  if (-not $NoIncludeSource) { $prepareArgs += "-IncludeSource" }
  if ($AllowDirtySource) { $prepareArgs += "-AllowDirtySource" }
  Invoke-Step "prepare NAS staging" { npm @prepareArgs }

  Invoke-Step "check NAS staging" {
    npm run nas:check -- -StagingRoot $StagingRoot
  }

  $syncArgs = @("run", "nas:sync-share", "--", "-StagingRoot", $StagingRoot, "-TargetRoot", $TargetRoot)
  if ($Apply) { $syncArgs += "-Apply" }
  if ($AllowStaleSource) { $syncArgs += "-AllowStaleSource" }
  Invoke-Step ($(if ($Apply) { "apply NAS share sync" } else { "dry-run NAS share sync" })) {
    npm @syncArgs
  }

  if (-not $Apply) {
    Write-Host "Dry-run complete. Re-run with -Apply to sync, rebuild, and verify the NAS control-plane container."
    return
  }

  $shouldRebuild = -not $SkipRebuild
  if ($shouldRebuild -and -not $ForceRebuild -and -not $SkipVerify) {
    Write-Host "==> check whether NAS rebuild is needed"
    if (Test-NasDeployAlreadyCurrent -TargetRootValue $TargetRoot) {
      Write-Host "NAS deploy already current; skipping rebuild. Use -ForceRebuild to rebuild anyway."
      $shouldRebuild = $false
    } else {
      Write-Host "NAS deploy is not current yet; rebuild required."
    }
  }

  if ($shouldRebuild) {
    Invoke-Step "rebuild NAS container" {
      npm run nas:container:rebuild
    }
    if ($WaitAfterRebuildSec -gt 0 -and -not $SkipVerify) {
      Write-Host "Waiting $WaitAfterRebuildSec seconds for the NAS control-plane snapshot..."
      Start-Sleep -Seconds $WaitAfterRebuildSec
    }
  }

  if (-not $SkipVerify) {
    Invoke-Step "verify NAS deployment" {
      npm run nas:deploy:verify -- --target-root $TargetRoot
    }
  }
} finally {
  Pop-Location
}
