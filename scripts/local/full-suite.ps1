param(
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$secretPath = Join-Path (Get-Location) ".local-e2e-admin.local"
$frontendUrl = "http://localhost:5173/"

function Test-LocalFrontend {
  try {
    $response = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  }
  catch {
    return $false
  }
}

function Start-LocalFrontendForSuite {
  if (Test-LocalFrontend) {
    Write-Host "Local frontend already available at $frontendUrl" -ForegroundColor Green
    return $null
  }

  $viteCommand = Join-Path (Get-Location) "node_modules\.bin\vite.cmd"
  if (-not (Test-Path $viteCommand)) {
    throw "Local Vite executable is missing. Run npm ci before the local suite."
  }

  Write-Host "Starting Local Server frontend for the test suite..." -ForegroundColor Cyan
  $process = Start-Process `
    -FilePath $viteCommand `
    -ArgumentList @("--mode", "local-server", "--host", "127.0.0.1", "--port", "5173", "--strictPort") `
    -WorkingDirectory (Get-Location).Path `
    -PassThru `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      throw "Local frontend process exited before becoming ready."
    }
    if (Test-LocalFrontend) {
      Write-Host "Local frontend ready at $frontendUrl" -ForegroundColor Green
      return $process
    }
    Start-Sleep -Milliseconds 500
  }

  try {
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
  catch {
    # Best-effort cleanup before surfacing the readiness failure.
  }
  throw "Local frontend did not become ready at $frontendUrl within 30 seconds."
}

function Stop-LocalFrontendForSuite {
  param([System.Diagnostics.Process]$Process)

  if ($null -eq $Process) { return }
  if ($Process.HasExited) { return }

  try {
    & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
  }
  catch {
    try { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
}

function Read-Or-CreateLocalAdminSecret {
  if (Test-Path $secretPath) {
    try {
      $stored = Get-Content $secretPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if (-not $stored.email -or -not $stored.protectedPassword) {
        throw "invalid local admin secret file"
      }
      $securePassword = ConvertTo-SecureString $stored.protectedPassword
      return [pscustomobject]@{
        Email = [string]$stored.email
        SecurePassword = $securePassword
      }
    }
    catch {
      throw "Unable to read the local E2E credential file. Delete .local-e2e-admin.local and run setup again."
    }
  }

  Write-Host "First-time Local Server E2E setup." -ForegroundColor Cyan
  $email = (Read-Host "Local admin email").Trim().ToLowerInvariant()
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw "Invalid email address"
  }

  $securePassword = Read-Host "Local admin password" -AsSecureString
  $protectedPassword = ConvertFrom-SecureString $securePassword
  [pscustomobject]@{
    email = $email
    protectedPassword = $protectedPassword
  } | ConvertTo-Json | Set-Content $secretPath -Encoding UTF8

  Write-Host "Local admin credentials saved encrypted for the current Windows account in an ignored *.local file." -ForegroundColor Green
  return [pscustomobject]@{
    Email = $email
    SecurePassword = $securePassword
  }
}

if (-not $SkipVerify) {
  Write-Host ""
  Write-Host "=== Local Suite: repository verification ===" -ForegroundColor Cyan
  & npm.cmd run verify
  $verifyExitCode = $LASTEXITCODE
  if ($verifyExitCode -ne 0) { exit $verifyExitCode }
}

$admin = Read-Or-CreateLocalAdminSecret
$bstr = [IntPtr]::Zero
$plainPassword = $null
$frontendProcess = $null

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($admin.SecurePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:LOCAL_E2E_ADMIN_EMAIL = $admin.Email
  $env:LOCAL_E2E_ADMIN_PASSWORD = $plainPassword

  # Repository verification is handled above by PowerShell on Windows.
  # Keep the Node harness focused on local runtime and business E2E.
  $env:LOCAL_E2E_SKIP_VERIFY = "true"

  $frontendProcess = Start-LocalFrontendForSuite

  Write-Host ""
  Write-Host "=== Local Suite: base fixture bootstrap ===" -ForegroundColor Cyan
  & node "scripts/local/fixture-bootstrap.mjs"
  $bootstrapExitCode = $LASTEXITCODE
  if ($bootstrapExitCode -ne 0) { exit $bootstrapExitCode }

  & node "scripts/local/full-suite.mjs"
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { exit $exitCode }
}
finally {
  Stop-LocalFrontendForSuite -Process $frontendProcess
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Remove-Item Env:LOCAL_E2E_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_E2E_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_E2E_SKIP_VERIFY -ErrorAction SilentlyContinue
  $plainPassword = $null
}
