param(
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$secretPath = Join-Path (Get-Location) ".local-e2e-admin.local"

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

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($admin.SecurePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:LOCAL_E2E_ADMIN_EMAIL = $admin.Email
  $env:LOCAL_E2E_ADMIN_PASSWORD = $plainPassword

  # Repository verification is handled above by PowerShell on Windows.
  # Keep the Node harness focused on local runtime and business E2E.
  $env:LOCAL_E2E_SKIP_VERIFY = "true"

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
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Remove-Item Env:LOCAL_E2E_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_E2E_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_E2E_SKIP_VERIFY -ErrorAction SilentlyContinue
  $plainPassword = $null
}
