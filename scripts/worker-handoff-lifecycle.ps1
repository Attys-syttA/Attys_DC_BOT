[CmdletBinding()]
param(
  [ValidateSet("start", "stop", "status", "restart")]
  [string]$Action = "status",
  [string]$EnvFile = ".env.worker.local",
  [int]$PollIntervalMs = 15000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot ".discord-bot-state"
$outLog = Join-Path $stateDir "worker-handoff.out.log"
$errLog = Join-Path $stateDir "worker-handoff.err.log"

function Get-HandoffProcesses {
  $escapedRepo = [regex]::Escape($repoRoot)
  Get-CimInstance Win32_Process | Where-Object {
    $cmd = $_.CommandLine
    $cmd -and
      ($cmd -match $escapedRepo) -and
      ($cmd -match "start-worker-handoff|src[\\/]cli[\\/]worker-handoff-loop|worker-handoff-loop\\.ts")
  }
}

function Get-DescendantProcessIds {
  param([int[]]$RootProcessIds)

  $all = Get-CimInstance Win32_Process
  $pending = New-Object System.Collections.Generic.Queue[int]
  $seen = New-Object System.Collections.Generic.HashSet[int]
  foreach ($rootProcessId in $RootProcessIds) {
    [void]$pending.Enqueue($rootProcessId)
    [void]$seen.Add($rootProcessId)
  }

  while ($pending.Count -gt 0) {
    $currentProcessId = $pending.Dequeue()
    foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $currentProcessId }) {
      if ($seen.Add([int]$child.ProcessId)) {
        $pending.Enqueue([int]$child.ProcessId)
      }
    }
  }

  return [int[]]$seen
}

function Resolve-EnvFilePath {
  if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    return $EnvFile
  }
  return Join-Path $repoRoot $EnvFile
}

function Get-HandoffRootFromEnvFile {
  $resolvedEnvFile = Resolve-EnvFilePath
  if (-not (Test-Path -LiteralPath $resolvedEnvFile)) {
    return ""
  }
  foreach ($line in Get-Content -LiteralPath $resolvedEnvFile) {
    if ($line -match "^\s*ATTYS_NAS_HANDOFF_ROOT\s*=(.*)$") {
      return $matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Write-Status {
  $processes = @(Get-HandoffProcesses)
  $handoffRoot = Get-HandoffRootFromEnvFile
  [pscustomobject]@{
    running = ($processes.Count -gt 0)
    processCount = $processes.Count
    processIds = @($processes | Select-Object -ExpandProperty ProcessId)
    handoffRootConfigured = [bool]$handoffRoot
    handoffRootReachable = ($handoffRoot -and (Test-Path -LiteralPath $handoffRoot))
  } | ConvertTo-Json -Compress
}

function Stop-Handoff {
  $processes = @(Get-HandoffProcesses)
  if ($processes.Count -eq 0) {
    return
  }

  $ids = Get-DescendantProcessIds -RootProcessIds @($processes | Select-Object -ExpandProperty ProcessId)
  foreach ($targetProcessId in ($ids | Sort-Object -Descending)) {
    Stop-Process -Id $targetProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Start-Handoff {
  if (@(Get-HandoffProcesses).Count -gt 0) {
    Write-Status
    return
  }

  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  $script = Join-Path $repoRoot "scripts\start-worker-handoff.ps1"
  Start-Process -FilePath "pwsh" `
    -ArgumentList @("-NoProfile", "-File", $script, "-EnvFile", $EnvFile, "-PollIntervalMs", [string]$PollIntervalMs) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog | Out-Null

  Start-Sleep -Milliseconds 750
  Write-Status
}

switch ($Action) {
  "start" {
    Start-Handoff
  }
  "stop" {
    Stop-Handoff
    Start-Sleep -Milliseconds 500
    Write-Status
  }
  "restart" {
    Stop-Handoff
    Start-Sleep -Milliseconds 500
    Start-Handoff
  }
  "status" {
    Write-Status
  }
}
