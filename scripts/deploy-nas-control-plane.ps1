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
  [int]$WaitAfterRebuildSec = 180
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

function Wait-NasDeployVerification {
  param(
    [string]$TargetRootValue,
    [int]$TimeoutSec,
    [int]$PollIntervalSec = 5
  )

  if ($TimeoutSec -le 0) {
    return
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $attempt = 1
  while ((Get-Date) -lt $deadline) {
    Write-Host "Waiting for NAS deploy verification (attempt $attempt, timeout ${TimeoutSec}s)..."
    if (Test-NasDeployAlreadyCurrent -TargetRootValue $TargetRootValue) {
      Write-Host "NAS deploy verification is ready."
      return
    }

    $remainingSec = [Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds)
    if ($remainingSec -le 0) {
      break
    }

    Start-Sleep -Seconds ([Math]::Min($PollIntervalSec, $remainingSec))
    $attempt += 1
  }

  Write-Host "NAS deploy verification was not ready within ${TimeoutSec}s; running final verifier for details."
}

function Get-CurrentSourceIdentity {
  $sourceCommit = "unknown"
  $packageVersion = "unknown"

  try {
    $sourceCommitValue = git -C $repoRoot rev-parse --short=12 HEAD
    if ($LASTEXITCODE -eq 0 -and $sourceCommitValue) {
      $sourceCommit = [string]$sourceCommitValue
    }
  } catch {
    $sourceCommit = "unknown"
  }

  try {
    $packageJson = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
    if ($packageJson.version) {
      $packageVersion = [string]$packageJson.version
    }
  } catch {
    $packageVersion = "unknown"
  }

  [pscustomobject]@{
    SourceCommit = $sourceCommit
    PackageVersion = $packageVersion
  }
}

function Test-SourceCheckoutClean {
  $status = git -C $repoRoot status --short --untracked-files=all
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return @($status | Where-Object { $_.Trim().Length -gt 0 }).Count -eq 0
}

function Test-NasDeployMatchesCurrentSource {
  param(
    [string]$TargetRootValue
  )

  $identity = Get-CurrentSourceIdentity
  if ($identity.SourceCommit -eq "unknown" -or $identity.PackageVersion -eq "unknown") {
    return $false
  }

  $outputLines = @(& npm run --silent nas:deploy:verify -- --target-root $TargetRootValue --json 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) {
    return $false
  }

  try {
    $parsed = ($outputLines -join "`n") | ConvertFrom-Json
    return $parsed.ok -eq $true `
      -and $parsed.sourceCommit -eq $identity.SourceCommit `
      -and $parsed.packageVersion -eq $identity.PackageVersion
  } catch {
    return $false
  }
}

Push-Location $repoRoot
try {
  $canSkipBeforeSync = $Apply `
    -and -not $NoIncludeSource `
    -and -not $AllowDirtySource `
    -and -not $SkipRebuild `
    -and -not $ForceRebuild `
    -and -not $SkipVerify
  if ($canSkipBeforeSync) {
    Write-Host "==> check whether NAS deploy already matches current source"
    if ((Test-SourceCheckoutClean) -and (Test-NasDeployMatchesCurrentSource -TargetRootValue $TargetRoot)) {
      Write-Host "NAS deploy already matches current source; skipping sync and rebuild. Use -ForceRebuild to rebuild anyway."
      Invoke-Step "verify NAS deployment" {
        npm run nas:deploy:verify -- --target-root $TargetRoot
      }
      return
    }
    Write-Host "NAS deploy does not match current source yet; sync required."
  }

  $prepareArgs = @("run", "nas:prepare", "--", "-StagingRoot", $StagingRoot)
  if (-not $NoIncludeSource) { $prepareArgs += "-IncludeSource" }
  if ($AllowDirtySource) { $prepareArgs += "-AllowDirtySource" }
  Invoke-Step "prepare NAS staging" { npm @prepareArgs }

  Invoke-Step "check NAS staging" {
    npm run nas:check -- -StagingRoot $StagingRoot
  }

  if ($Apply -and -not $SkipRebuild) {
    Invoke-Step "preflight NAS container lifecycle" {
      npm run --silent nas:container:status
    }
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
      Wait-NasDeployVerification -TargetRootValue $TargetRoot -TimeoutSec $WaitAfterRebuildSec
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
