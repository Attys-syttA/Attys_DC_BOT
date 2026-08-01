[CmdletBinding()]
param(
  [string]$EnvFile = ".env.worker.local",
  [string]$Project = "Attys_DC_BOT",
  [ValidateSet("plans", "lint", "typecheck", "tests", "build", "full")]
  [string]$Check = "plans",
  [int]$TimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeScript = Join-Path $repoRoot "scripts\nas-bridge-lifecycle.ps1"

function Import-EnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$") {
      continue
    }

    $key = $matches[1]
    $value = $matches[2].Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Convert-JsonOutput {
  param([string]$Output)

  $trimmed = $Output.Trim()
  if (-not $trimmed) {
    return $null
  }
  $jsonLine = @($trimmed -split "`r?`n" | Where-Object { $_.Trim().StartsWith("{") } | Select-Object -Last 1)
  if (-not $jsonLine) {
    return $null
  }
  return $jsonLine | ConvertFrom-Json
}

$resolvedEnvFile = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile
} else {
  Join-Path $repoRoot $EnvFile
}
Import-EnvFile -Path $resolvedEnvFile

$handoffRoot = [Environment]::GetEnvironmentVariable("ATTYS_NAS_HANDOFF_ROOT", "Process")
if (-not $handoffRoot) {
  throw "ATTYS_NAS_HANDOFF_ROOT is required for the NAS bridge smoke."
}
if (-not (Test-Path -LiteralPath $handoffRoot)) {
  throw "ATTYS_NAS_HANDOFF_ROOT is not reachable."
}

$bridgeStatus = Convert-JsonOutput -Output ((& pwsh -NoProfile -File $bridgeScript -Action status -EnvFile $EnvFile) -join "`n")
if (-not $bridgeStatus -or -not $bridgeStatus.bridgeReady) {
  throw "NAS bridge is not ready."
}

$requestId = "nas-bridge-smoke-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Push-Location $repoRoot
try {
  $env:ATTYS_NAS_HANDOFF_ROOT = $handoffRoot
  npm run nas:handoff:audit-request -- --id $requestId --project $Project --check $Check | Out-Null

  $resultPath = Join-Path (Join-Path $handoffRoot "outbox") "result-$requestId.json"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $resultPath) {
      $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
      [pscustomobject]@{
        ok = $true
        requestId = $requestId
        check = $Check
        result = $result.publicFields.result
        summary = $result.publicFields.summary
      } | ConvertTo-Json -Compress
      exit 0
    }
    Start-Sleep -Milliseconds 500
  }

  [pscustomobject]@{
    ok = $false
    requestId = $requestId
    check = $Check
    result = "timeout"
    summary = "result was not observed before timeout"
  } | ConvertTo-Json -Compress
  exit 1
} finally {
  Pop-Location
}
