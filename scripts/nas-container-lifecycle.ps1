[CmdletBinding()]
param(
  [ValidateSet("status", "rebuild")]
  [string]$Action = "status",
  [string]$HostName = $env:ATTYS_NAS_SSH_HOST,
  [string]$User = $(if ($env:ATTYS_NAS_SSH_USER) { $env:ATTYS_NAS_SSH_USER } else { "Codex" }),
  [string]$KeyPath = $(if ($env:ATTYS_NAS_SSH_KEY_PATH) { $env:ATTYS_NAS_SSH_KEY_PATH } else { Join-Path $env:USERPROFILE ".ssh\attys_nas_codex_ed25519" }),
  [int]$ConnectTimeoutSec = 10,
  [switch]$Json,
  [switch]$VerboseOutput
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$localEnvPath = Join-Path $repoRoot ".env.nas-ssh.local"

function Import-LocalEnvFile([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $PathValue) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }

    $equalsIndex = $trimmed.IndexOf("=")
    if ($equalsIndex -le 0) {
      continue
    }

    $name = $trimmed.Substring(0, $equalsIndex).Trim()
    $value = $trimmed.Substring($equalsIndex + 1).Trim().Trim('"').Trim("'")
    if ($name -match "^[A-Z0-9_]+$" -and -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-LocalEnvFile $localEnvPath

if (-not $HostName) {
  $HostName = $env:ATTYS_NAS_SSH_HOST
}
if (-not $User) {
  $User = if ($env:ATTYS_NAS_SSH_USER) { $env:ATTYS_NAS_SSH_USER } else { "Codex" }
}
if (-not $KeyPath) {
  $KeyPath = if ($env:ATTYS_NAS_SSH_KEY_PATH) { $env:ATTYS_NAS_SSH_KEY_PATH } else { Join-Path $env:USERPROFILE ".ssh\attys_nas_codex_ed25519" }
}

if (-not $HostName) {
  throw "ATTYS_NAS_SSH_HOST is required. Set it in .env.nas-ssh.local or pass -HostName."
}

$expandedKeyPath = [Environment]::ExpandEnvironmentVariables($KeyPath)
$resolvedKeyPath = [System.IO.Path]::GetFullPath($expandedKeyPath)
if (-not (Test-Path -LiteralPath $resolvedKeyPath -PathType Leaf)) {
  throw "NAS SSH key file is missing: $resolvedKeyPath"
}

$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
  throw "OpenSSH ssh.exe is required but was not found on PATH."
}

$remoteScript = switch ($Action) {
  "status" { "/usr/local/sbin/attys-dc-bot-status.sh" }
  "rebuild" { "/usr/local/sbin/attys-dc-bot-rebuild.sh" }
}

$sshArgs = @(
  "-i", $resolvedKeyPath,
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ConnectTimeout=$ConnectTimeoutSec",
  "$User@$HostName",
  "sudo -n $remoteScript"
)

$startedAt = Get-Date
$outputLines = @(& $ssh.Source @sshArgs 2>&1 | ForEach-Object { $_.ToString() })
$exitCode = $LASTEXITCODE
$finishedAt = Get-Date
$ok = $exitCode -eq 0
$durationSec = [Math]::Round(($finishedAt - $startedAt).TotalSeconds, 1)

$summary = [ordered]@{
  ok = $ok
  action = $Action
  target = "<nas-ssh>"
  user = $User
  startedAt = $startedAt.ToUniversalTime().ToString("o")
  finishedAt = $finishedAt.ToUniversalTime().ToString("o")
  durationSec = $durationSec
  exitCode = $exitCode
  output = $outputLines
}

if ($Json) {
  $summary | ConvertTo-Json -Depth 4
} else {
  if ($ok) {
    "OK NAS container $Action completed in ${durationSec}s"
  } else {
    "FAIL NAS container $Action failed with exit code $exitCode"
  }

  $shouldShowOutput = $VerboseOutput -or -not $ok -or $Action -eq "status"
  if ($outputLines.Count -gt 0 -and $shouldShowOutput) {
    "output:"
    $outputLines | ForEach-Object { "- $_" }
  } elseif ($outputLines.Count -gt 0) {
    "output: hidden on success ($($outputLines.Count) line(s)); re-run with -VerboseOutput for full remote output"
  }
}

if (-not $ok) {
  exit $exitCode
}
