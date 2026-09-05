[CmdletBinding()]
param(
  [string]$ServerIp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$composeFile = Join-Path $projectRoot "infra\local\docker-compose.yml"
$runtimeFile = Join-Path $projectRoot "infra\local\runtime.env.local"
$lanRuntimeFile = Join-Path $projectRoot "infra\local\runtime.lan.env.local"
$lanViteFile = Join-Path $projectRoot ".env.local-server-lan.local"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Set-EnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Value
  )
  $pattern = "(?m)^" + [Regex]::Escape($Name) + "=.*$"
  $replacement = "$Name=$Value"
  if ([Regex]::IsMatch($Content, $pattern)) {
    return [Regex]::Replace($Content, $pattern, $replacement)
  }
  return $Content.TrimEnd() + "`r`n" + $replacement + "`r`n"
}

function Test-PrivateIPv4 {
  param([string]$Address)
  if ($Address -match '^10\.') { return $true }
  if ($Address -match '^192\.168\.') { return $true }
  if ($Address -match '^172\.(1[6-9]|2[0-9]|3[01])\.') { return $true }
  return $false
}

function Resolve-ServerIp {
  param([string]$RequestedIp)

  if ($RequestedIp) {
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($RequestedIp, [ref]$parsed) -or
        $parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
        -not (Test-PrivateIPv4 $RequestedIp)) {
      throw "ServerIp must be a private IPv4 address (10.x, 172.16-31.x, or 192.168.x)."
    }
    return $RequestedIp
  }

  $candidates = @(
    Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction Stop |
      Where-Object {
        (Test-PrivateIPv4 $_.IPAddress) -and
        $_.InterfaceAlias -notmatch 'vEthernet|Docker|WSL|Loopback|Bluetooth'
      }
  )

  if ($candidates.Count -eq 0) {
    throw "No private LAN IPv4 address was found. Re-run with -ServerIp <address>."
  }

  $preferred = @($candidates | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Wireless|Ethernet' })
  if ($preferred.Count -eq 1) { return $preferred[0].IPAddress }
  if ($candidates.Count -eq 1) { return $candidates[0].IPAddress }

  $details = ($candidates | ForEach-Object { "$($_.InterfaceAlias)=$($_.IPAddress)" }) -join ', '
  throw "Multiple LAN addresses were found ($details). Re-run with -ServerIp <address>."
}

if (-not (Test-Path $runtimeFile)) {
  throw "Local runtime configuration is missing. Run npm run local:bootstrap first."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI was not found."
}

$resolvedIp = Resolve-ServerIp -RequestedIp $ServerIp
$runtime = [System.IO.File]::ReadAllText($runtimeFile)
$runtime = Set-EnvValue -Content $runtime -Name "BACKEND_BIND_HOST" -Value "0.0.0.0"
$runtime = Set-EnvValue -Content $runtime -Name "CONVEX_CLOUD_ORIGIN" -Value "http://${resolvedIp}:3210"
$runtime = Set-EnvValue -Content $runtime -Name "CONVEX_SITE_ORIGIN" -Value "http://${resolvedIp}:3211"
$runtime = Set-EnvValue -Content $runtime -Name "NEXT_PUBLIC_DEPLOYMENT_URL" -Value "http://${resolvedIp}:3210"
Write-Utf8NoBom -Path $lanRuntimeFile -Content $runtime

$vite = "VITE_CONVEX_URL=http://${resolvedIp}:3210`r`n"
Write-Utf8NoBom -Path $lanViteFile -Content $vite

& docker compose --env-file $lanRuntimeFile -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose could not start LAN mode."
}

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
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
  throw "LAN backend did not become healthy within 60 seconds."
}

Write-Host ""
Write-Host "LAN backend is healthy."
Write-Host "Server IP: $resolvedIp"
Write-Host "Backend:   http://${resolvedIp}:3210"
Write-Host "HTTP:      http://${resolvedIp}:3211"
Write-Host "Dashboard remains localhost-only on http://127.0.0.1:6791"
Write-Host "Next: start the LAN frontend with npm run local:lan:frontend"
Write-Host "Machine-specific LAN files are ignored by Git."
