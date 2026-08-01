[CmdletBinding()]
param(
  [ValidateSet("start", "stop", "status", "restart")]
  [string]$Action = "status",
  [string]$EnvFile = ".env.worker.local",
  [string]$HostName = "0.0.0.0",
  [int]$Port = 8787,
  [int]$PollIntervalMs = 15000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$httpScript = Join-Path $repoRoot "scripts\worker-http-lifecycle.ps1"
$handoffScript = Join-Path $repoRoot "scripts\worker-handoff-lifecycle.ps1"

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

  try {
    return $jsonLine | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Invoke-HttpLifecycle {
  param([string]$RequestedAction)

  $output = & pwsh -NoProfile -File $httpScript `
    -Action $RequestedAction `
    -EnvFile $EnvFile `
    -HostName $HostName `
    -Port $Port
  return Convert-JsonOutput -Output ($output -join "`n")
}

function Invoke-HandoffLifecycle {
  param([string]$RequestedAction)

  $output = & pwsh -NoProfile -File $handoffScript `
    -Action $RequestedAction `
    -EnvFile $EnvFile `
    -PollIntervalMs $PollIntervalMs
  return Convert-JsonOutput -Output ($output -join "`n")
}

function Write-BridgeStatus {
  param(
    $HttpStatus,
    $HandoffStatus
  )

  [pscustomobject]@{
    bridgeReady = [bool](
      $HttpStatus -and
      $HandoffStatus -and
      $HttpStatus.running -and
      $HttpStatus.listening -and
      $HandoffStatus.running -and
      $HandoffStatus.handoffRootReachable
    )
    http = [pscustomobject]@{
      running = [bool]($HttpStatus -and $HttpStatus.running)
      listening = [bool]($HttpStatus -and $HttpStatus.listening)
      port = if ($HttpStatus) { $HttpStatus.port } else { $Port }
      processCount = if ($HttpStatus) { $HttpStatus.processCount } else { 0 }
    }
    handoff = [pscustomobject]@{
      running = [bool]($HandoffStatus -and $HandoffStatus.running)
      handoffRootConfigured = [bool]($HandoffStatus -and $HandoffStatus.handoffRootConfigured)
      handoffRootReachable = [bool]($HandoffStatus -and $HandoffStatus.handoffRootReachable)
      processCount = if ($HandoffStatus) { $HandoffStatus.processCount } else { 0 }
    }
  } | ConvertTo-Json -Compress
}

switch ($Action) {
  "start" {
    $http = Invoke-HttpLifecycle -RequestedAction "start"
    $handoff = Invoke-HandoffLifecycle -RequestedAction "start"
    Write-BridgeStatus -HttpStatus $http -HandoffStatus $handoff
  }
  "stop" {
    $handoff = Invoke-HandoffLifecycle -RequestedAction "stop"
    $http = Invoke-HttpLifecycle -RequestedAction "stop"
    Write-BridgeStatus -HttpStatus $http -HandoffStatus $handoff
  }
  "restart" {
    [void](Invoke-HandoffLifecycle -RequestedAction "stop")
    [void](Invoke-HttpLifecycle -RequestedAction "stop")
    Start-Sleep -Milliseconds 500
    $http = Invoke-HttpLifecycle -RequestedAction "start"
    $handoff = Invoke-HandoffLifecycle -RequestedAction "start"
    Write-BridgeStatus -HttpStatus $http -HandoffStatus $handoff
  }
  "status" {
    $http = Invoke-HttpLifecycle -RequestedAction "status"
    $handoff = Invoke-HandoffLifecycle -RequestedAction "status"
    Write-BridgeStatus -HttpStatus $http -HandoffStatus $handoff
  }
}
