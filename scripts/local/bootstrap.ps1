[CmdletBinding()]
param(
  [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$composeFile = Join-Path $projectRoot "infra\local\docker-compose.yml"
$templateFile = Join-Path $projectRoot "infra\local\runtime.env.example"
$runtimeFile = Join-Path $projectRoot "infra\local\runtime.env.local"
$cliFile = Join-Path $projectRoot "infra\local\cli.env.local"
$viteFile = Join-Path $projectRoot ".env.local-server.local"

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
  & docker compose --env-file $runtimeFile -f $composeFile @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed: $($ComposeArgs -join ' ')"
  }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI was not found. Start Docker Desktop and open a new terminal."
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Engine is not running. Start Docker Desktop and try again."
}

if (-not (Test-Path $runtimeFile)) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  $password = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  $template = Get-Content $templateFile -Raw
  $runtime = $template.Replace("GENERATED_LOCALLY_DO_NOT_COMMIT", $password)
  Write-Utf8NoBom -Path $runtimeFile -Content $runtime
  Write-Host "Created local runtime configuration (secret values were not printed)."
}

if (-not $SkipPull) {
  Invoke-Compose pull
}

Invoke-Compose up -d

$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3210/version" -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Invoke-Compose ps
  Invoke-Compose logs --tail 120 backend postgres
  throw "The local Convex backend did not become healthy within 120 seconds."
}

$adminOutput = & docker compose --env-file $runtimeFile -f $composeFile exec -T backend ./generate_admin_key.sh 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Could not generate the local Convex admin key."
}
$adminKey = ($adminOutput | Select-Object -Last 1).ToString().Trim()
if ($adminKey.Length -lt 20) {
  throw "The generated Convex admin key was not valid."
}

$cliContent = @"
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=$adminKey
"@
Write-Utf8NoBom -Path $cliFile -Content $cliContent

$viteContent = @"
VITE_CONVEX_URL=http://127.0.0.1:3210
"@
Write-Utf8NoBom -Path $viteFile -Content $viteContent

Write-Host ""
Write-Host "Local PostgreSQL and Convex are healthy."
Write-Host "Backend:   http://127.0.0.1:3210"
Write-Host "HTTP:      http://127.0.0.1:3211"
Write-Host "Dashboard: http://127.0.0.1:6791"
Write-Host "Secrets were stored only in ignored *.local files."
