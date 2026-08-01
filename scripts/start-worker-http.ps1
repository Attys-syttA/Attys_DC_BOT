[CmdletBinding()]
param(
  [string]$EnvFile = ".env.worker.local",
  [string]$HostName = "0.0.0.0",
  [int]$Port = 8787,
  [string]$WorkerId = "otthon",
  [string]$WorkerLabel = "Otthoni Windows worker",
  [string]$WorkspaceRootLabel = "codex_works-home",
  [string]$SecretEnvName = "ATTYS_WORKER_SHARED_SECRET_HOME",
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

$env:ATTYS_WORKER_HTTP_ENABLED = "true"
$env:ATTYS_WORKER_HTTP_HOST = $HostName
$env:ATTYS_WORKER_HTTP_PORT = [string]$Port
$env:ATTYS_WORKER_ID = $WorkerId
$env:ATTYS_WORKER_LABEL = $WorkerLabel
$env:ATTYS_WORKSPACE_ROOT_LABEL = $WorkspaceRootLabel
$env:ATTYS_WORKER_WORKSPACE_ROOT = $WorkspaceRoot
$env:ATTYS_WORKER_SHARED_SECRET_ENV = $SecretEnvName

if (-not [Environment]::GetEnvironmentVariable($SecretEnvName, "Process")) {
  Write-Warning "Shared secret env '$SecretEnvName' is not set. Worker will start without request authentication."
}

Push-Location $repoRoot
try {
  npm run worker:http
} finally {
  Pop-Location
}
