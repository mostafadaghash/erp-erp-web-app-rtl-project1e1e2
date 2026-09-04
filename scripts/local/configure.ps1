[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$cliFile = Join-Path $projectRoot "infra\local\cli.env.local"
$authFile = Join-Path $projectRoot "infra\local\auth.env.local"
$keyGenerator = Join-Path $scriptDir "generate-auth-keys.mjs"
$convexCli = Join-Path $projectRoot "node_modules\.bin\convex.cmd"

function Read-LocalEnv {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -le 0) { continue }
    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    $values[$name] = $value
  }
  return $values
}

function Invoke-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$FailureMessage
  )
  $previousPreference = $ErrorActionPreference
  $exitCode = -1
  try {
    $ErrorActionPreference = "Continue"
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) { throw $FailureMessage }
}

if (-not (Test-Path $cliFile)) {
  throw "Local Convex CLI configuration is missing. Run npm run local:bootstrap first."
}
if (-not (Test-Path $convexCli)) {
  throw "Convex CLI is missing. Run npm ci --ignore-scripts first."
}

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3210/version" -TimeoutSec 3
  if ($response.StatusCode -ne 200) { throw "Unexpected health response." }
} catch {
  throw "Local Convex is not reachable. Start Docker Desktop and run npm run local:bootstrap."
}

if (-not (Test-Path $authFile)) {
  Invoke-NativeCommand -FilePath "node" -Arguments @($keyGenerator, $authFile) -FailureMessage "Could not generate local Convex Auth keys."
}

$cliSettings = Read-LocalEnv -Path $cliFile
if (-not $cliSettings.ContainsKey("CONVEX_SELF_HOSTED_URL") -or
    -not $cliSettings.ContainsKey("CONVEX_SELF_HOSTED_ADMIN_KEY")) {
  throw "Local Convex CLI configuration is incomplete."
}

$previousUrl = [Environment]::GetEnvironmentVariable("CONVEX_SELF_HOSTED_URL", "Process")
$previousAdminKey = [Environment]::GetEnvironmentVariable("CONVEX_SELF_HOSTED_ADMIN_KEY", "Process")
try {
  $env:CONVEX_SELF_HOSTED_URL = $cliSettings["CONVEX_SELF_HOSTED_URL"]
  $env:CONVEX_SELF_HOSTED_ADMIN_KEY = $cliSettings["CONVEX_SELF_HOSTED_ADMIN_KEY"]

  Invoke-NativeCommand -FilePath $convexCli -Arguments @("env", "set", "--from-file", $authFile, "--force") -FailureMessage "Could not configure Convex Auth variables on the local deployment."
  Invoke-NativeCommand -FilePath $convexCli -Arguments @("dev", "--once", "--env-file", $cliFile, "--typecheck", "enable", "--tail-logs", "disable") -FailureMessage "Could not deploy the ERP functions to local Convex."
} finally {
  if ($null -eq $previousUrl) {
    Remove-Item Env:CONVEX_SELF_HOSTED_URL -ErrorAction SilentlyContinue
  } else {
    $env:CONVEX_SELF_HOSTED_URL = $previousUrl
  }
  if ($null -eq $previousAdminKey) {
    Remove-Item Env:CONVEX_SELF_HOSTED_ADMIN_KEY -ErrorAction SilentlyContinue
  } else {
    $env:CONVEX_SELF_HOSTED_ADMIN_KEY = $previousAdminKey
  }
}

Write-Host ""
Write-Host "Local Convex Auth variables and ERP functions are configured."
Write-Host "No Cloud deployment was changed."
