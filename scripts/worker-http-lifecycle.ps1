[CmdletBinding()]
param(
  [ValidateSet("start", "stop", "status", "restart")]
  [string]$Action = "status",
  [string]$EnvFile = ".env.worker.local",
  [string]$HostName = "0.0.0.0",
  [int]$Port = 8787
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot ".discord-bot-state"
$outLog = Join-Path $stateDir "worker-http.out.log"
$errLog = Join-Path $stateDir "worker-http.err.log"

function Get-WorkerProcesses {
  $escapedRepo = [regex]::Escape($repoRoot)
  Get-CimInstance Win32_Process | Where-Object {
    $cmd = $_.CommandLine
    $cmd -and
      ($cmd -match $escapedRepo) -and
      ($cmd -match "start-worker-http|src[\\/]cli[\\/]worker-http|worker-http\\.ts")
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

function Test-WorkerListening {
  $listeners = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" }
  return [bool]$listeners
}

function Write-Status {
  $processes = @(Get-WorkerProcesses)
  $listening = Test-WorkerListening
  [pscustomobject]@{
    running = ($processes.Count -gt 0)
    listening = $listening
    port = $Port
    processCount = $processes.Count
    processIds = @($processes | Select-Object -ExpandProperty ProcessId)
  } | ConvertTo-Json -Compress
}

function ConvertTo-PowerShellLiteral([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

function ConvertTo-CommandLineArgument([string]$Value) {
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Start-DetachedPowerShellScript {
  param(
    [string]$ScriptPath,
    [string[]]$ScriptArguments,
    [string]$StdOutPath,
    [string]$StdErrPath
  )

  $pwsh = Get-Command pwsh -ErrorAction Stop
  $argumentText = ($ScriptArguments | ForEach-Object {
    if ($_ -match "^-[A-Za-z][A-Za-z0-9-]*$") { $_ } else { ConvertTo-PowerShellLiteral $_ }
  }) -join " "
  $command = "& $(ConvertTo-PowerShellLiteral $ScriptPath) $argumentText 1> $(ConvertTo-PowerShellLiteral $StdOutPath) 2> $(ConvertTo-PowerShellLiteral $StdErrPath)"
  $commandLine = "$(ConvertTo-CommandLineArgument $pwsh.Source) -NoProfile -Command $(ConvertTo-CommandLineArgument $command)"
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $commandLine
    CurrentDirectory = $repoRoot
  }
  if ($result.ReturnValue -ne 0) {
    throw "Failed to start detached worker process. Win32_Process.Create returned $($result.ReturnValue)."
  }
}

function Stop-Worker {
  $processes = @(Get-WorkerProcesses)
  if ($processes.Count -eq 0) {
    return
  }

  $ids = Get-DescendantProcessIds -RootProcessIds @($processes | Select-Object -ExpandProperty ProcessId)
  foreach ($targetProcessId in ($ids | Sort-Object -Descending)) {
    Stop-Process -Id $targetProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Start-Worker {
  if (@(Get-WorkerProcesses).Count -gt 0 -or (Test-WorkerListening)) {
    Write-Status
    return
  }

  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  $script = Join-Path $repoRoot "scripts\start-worker-http.ps1"
  Start-DetachedPowerShellScript `
    -ScriptPath $script `
    -ScriptArguments @("-EnvFile", $EnvFile, "-HostName", $HostName, "-Port", [string]$Port) `
    -StdOutPath $outLog `
    -StdErrPath $errLog

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (Test-WorkerListening) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
  Write-Status
}

switch ($Action) {
  "start" {
    Start-Worker
  }
  "stop" {
    Stop-Worker
    Start-Sleep -Milliseconds 500
    Write-Status
  }
  "restart" {
    Stop-Worker
    Start-Sleep -Milliseconds 500
    Start-Worker
  }
  "status" {
    Write-Status
  }
}
