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
      throw "تعذر قراءة ملف اعتماد الاختبارات المحلية. احذف .local-e2e-admin.local ثم أعد التشغيل لإعداده من جديد."
    }
  }

  Write-Host "تهيئة اختبارات Local Server لأول مرة فقط." -ForegroundColor Cyan
  $email = (Read-Host "Local admin email").Trim().ToLowerInvariant()
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw "صيغة البريد الإلكتروني غير صحيحة"
  }

  $securePassword = Read-Host "Local admin password" -AsSecureString
  $protectedPassword = ConvertFrom-SecureString $securePassword
  [pscustomobject]@{
    email = $email
    protectedPassword = $protectedPassword
  } | ConvertTo-Json | Set-Content $secretPath -Encoding UTF8

  Write-Host "تم حفظ اعتماد المدير مشفرًا لحساب Windows الحالي داخل ملف *.local ignored." -ForegroundColor Green
  return [pscustomobject]@{
    Email = $email
    SecurePassword = $securePassword
  }
}

$admin = Read-Or-CreateLocalAdminSecret
$bstr = [IntPtr]::Zero
$plainPassword = $null

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($admin.SecurePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:LOCAL_E2E_ADMIN_EMAIL = $admin.Email
  $env:LOCAL_E2E_ADMIN_PASSWORD = $plainPassword
  $env:LOCAL_E2E_SKIP_VERIFY = if ($SkipVerify) { "true" } else { "false" }

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
