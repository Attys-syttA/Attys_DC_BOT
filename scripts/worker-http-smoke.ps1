[CmdletBinding()]
param(
  [int]$Port = 18787,
  [string]$Project = "Attys_DC_BOT",
  [string]$Check = "plans"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $repoRoot
$token = "local-worker-smoke-token"
$job = $null

try {
  $job = Start-Job -ScriptBlock {
    param($repoRootArg, $workspaceRootArg, $portArg, $tokenArg)
    Set-Location $repoRootArg
    $env:ATTYS_WORKER_HTTP_ENABLED = "true"
    $env:ATTYS_WORKER_HTTP_HOST = "127.0.0.1"
    $env:ATTYS_WORKER_HTTP_PORT = [string]$portArg
    $env:ATTYS_WORKER_ID = "loopback-worker"
    $env:ATTYS_WORKER_LABEL = "Loopback Worker"
    $env:ATTYS_WORKSPACE_ROOT_LABEL = "codex_works-home"
    $env:ATTYS_WORKER_WORKSPACE_ROOT = $workspaceRootArg
    $env:ATTYS_WORKER_SHARED_SECRET_ENV = "ATTYS_WORKER_SHARED_SECRET_HOME"
    $env:ATTYS_WORKER_SHARED_SECRET_HOME = $tokenArg
    npm run worker:http
  } -ArgumentList $repoRoot, $workspaceRoot, $Port, $token

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $response = Invoke-WebRequest `
        -Uri "http://127.0.0.1:$Port/health" `
        -Headers @{ "x-telecodex-shared-secret" = $token } `
        -UseBasicParsing `
        -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $ready) {
    throw "Worker HTTP smoke server did not become ready."
  }

  $env:ATTYS_NAS_WORKERS_JSON = @"
[{"id":"loopback-worker","label":"Loopback Worker","baseUrl":"http://127.0.0.1:$Port","sharedSecretEnv":"ATTYS_WORKER_SHARED_SECRET_HOME","workspaceRootLabel":"codex_works-home"}]
"@
  $env:ATTYS_WORKER_SHARED_SECRET_HOME = $token

  npm run nas:workers:health
  if ($LASTEXITCODE -ne 0) { throw "nas:workers:health failed." }

  npm run nas:workers:repo-status -- --project $Project
  if ($LASTEXITCODE -ne 0) { throw "nas:workers:repo-status failed." }

  npm run nas:workers:check -- --project $Project --check $Check
  if ($LASTEXITCODE -ne 0) { throw "nas:workers:check failed." }

  Write-Host "Worker HTTP smoke passed."
} finally {
  Remove-Item Env:\ATTYS_NAS_WORKERS_JSON -ErrorAction SilentlyContinue
  Remove-Item Env:\ATTYS_WORKER_SHARED_SECRET_HOME -ErrorAction SilentlyContinue
  if ($job) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
}
