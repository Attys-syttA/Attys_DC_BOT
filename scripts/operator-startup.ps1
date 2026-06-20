param(
  [string]$McpLinkRoot,
  [string]$WorkspaceName = "Attys_DC_BOT",
  [int]$HealthTimeoutSec = 45,
  [switch]$SkipDockerDesktop,
  [switch]$SkipObsidian
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot "operator-startup.log"
$stateDir = Join-Path $repoRoot ".discord-bot-state"
$lockPath = Join-Path $stateDir "operator-startup.lock"

function Write-OperatorLog([string]$Message) {
  $line = (Get-Date).ToString("s") + " " + $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Host $Message
}

function Get-LockOwnerProcessId {
  if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    return 0
  }

  try {
    $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
    return [int]$lock.pid
  } catch {
    return 0
  }
}

function Test-ProcessAlive([int]$TargetProcessId) {
  if ($TargetProcessId -le 0) {
    return $false
  }

  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $TargetProcessId) -ErrorAction SilentlyContinue
  return $null -ne $process
}

function Release-OperatorStartupLock {
  $ownerProcessId = Get-LockOwnerProcessId
  if ($ownerProcessId -eq $PID -and (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
}

function Exit-OperatorStartup([int]$ExitCode) {
  Release-OperatorStartupLock
  exit $ExitCode
}

function Acquire-OperatorStartupLock {
  if (-not (Test-Path -LiteralPath $stateDir -PathType Container)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
  }

  $ownerProcessId = Get-LockOwnerProcessId
  if (Test-ProcessAlive -TargetProcessId $ownerProcessId) {
    Write-OperatorLog "RUNNING: operator tools preflight already active."
    exit 3
  }

  if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }

  @{
    pid = $PID
    startedAt = (Get-Date).ToString("s")
  } | ConvertTo-Json -Compress | Set-Content -LiteralPath $lockPath -Encoding UTF8
}

function Resolve-McpLinkRoot([string]$Value) {
  if ($Value -and (Test-Path -LiteralPath $Value -PathType Container)) {
    return (Resolve-Path -LiteralPath $Value).Path
  }

  $parent = Split-Path -Parent $repoRoot
  $candidate = Join-Path $parent "codex-ai-tools-mcp-link"
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }

  return ""
}

Acquire-OperatorStartupLock

$resolvedMcpLinkRoot = Resolve-McpLinkRoot -Value $McpLinkRoot
if (-not $resolvedMcpLinkRoot) {
  Write-OperatorLog "SKIPPED: codex-ai-tools-mcp-link root not found."
  Exit-OperatorStartup 2
}

$launcher = Join-Path $resolvedMcpLinkRoot "start-email-header-analyzer-workspace.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
  Write-OperatorLog "SKIPPED: workspace launcher script not found."
  Exit-OperatorStartup 2
}

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $launcher,
  "-WorkspaceName",
  $WorkspaceName,
  "-SkipTelegramBot",
  "-SkipVsCode",
  "-HealthTimeoutSec",
  $HealthTimeoutSec.ToString()
)

if ($SkipDockerDesktop) {
  $arguments += "-SkipDockerDesktop"
}
if ($SkipObsidian) {
  $arguments += "-SkipObsidian"
}

Write-OperatorLog "START: operator tools preflight."

$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList $arguments `
  -WorkingDirectory $resolvedMcpLinkRoot `
  -NoNewWindow `
  -Wait `
  -PassThru

if ($process.ExitCode -ne 0) {
  Write-OperatorLog ("FAILED: operator tools preflight exit=" + $process.ExitCode)
  Exit-OperatorStartup 1
}

Write-OperatorLog "OK: operator tools preflight completed."
Exit-OperatorStartup 0
