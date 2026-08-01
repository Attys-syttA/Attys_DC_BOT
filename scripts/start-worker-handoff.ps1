[CmdletBinding()]
param(
  [string]$EnvFile = ".env.worker.local",
  [int]$PollIntervalMs = 15000,
  [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $WorkspaceRoot) {
  $WorkspaceRoot = Split-Path -Parent $repoRoot
}

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

$resolvedEnvFile = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile
} else {
  Join-Path $repoRoot $EnvFile
}

Import-EnvFile -Path $resolvedEnvFile

$handoffRoot = [Environment]::GetEnvironmentVariable("ATTYS_NAS_HANDOFF_ROOT", "Process")
if (-not $handoffRoot) {
  throw "ATTYS_NAS_HANDOFF_ROOT is required. Set it in $resolvedEnvFile."
}
if (-not (Test-Path -LiteralPath $handoffRoot)) {
  throw "ATTYS_NAS_HANDOFF_ROOT is not reachable: $handoffRoot"
}

$env:ATTYS_WORKER_WORKSPACE_ROOT = $WorkspaceRoot
$env:ATTYS_WORKER_HANDOFF_POLL_INTERVAL_MS = [string]$PollIntervalMs

Push-Location $repoRoot
try {
  npm run worker:handoff:loop
} finally {
  Pop-Location
}
