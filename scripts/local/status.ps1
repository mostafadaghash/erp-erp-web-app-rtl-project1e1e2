Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$composeFile = Join-Path $projectRoot "infra\local\docker-compose.yml"
$runtimeFile = Join-Path $projectRoot "infra\local\runtime.env.local"

if (-not (Test-Path $runtimeFile)) {
  throw "Local runtime configuration is missing. Run npm run local:bootstrap first."
}

& docker compose --env-file $runtimeFile -f $composeFile ps
if ($LASTEXITCODE -ne 0) {
  throw "Could not read the local service status."
}

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3210/version" -TimeoutSec 3
  Write-Host "Convex health: HTTP $($response.StatusCode)"
} catch {
  throw "Convex health endpoint is not reachable."
}

& docker compose --env-file $runtimeFile -f $composeFile exec -T postgres pg_isready -U convex -d business_tech_erp_local
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL is not ready."
}
