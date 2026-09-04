$ErrorActionPreference = "Stop"

$email = Read-Host "Local admin email"
$securePassword = Read-Host "Local admin password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:LOCAL_ACCEPTANCE_EMAIL = $email
  $env:LOCAL_ACCEPTANCE_PASSWORD = $plainPassword

  & node "scripts/local/acceptance.mjs"
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    exit $exitCode
  }
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Remove-Item Env:LOCAL_ACCEPTANCE_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_ACCEPTANCE_PASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
}
