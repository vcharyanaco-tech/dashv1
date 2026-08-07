# Verify-EnterpriseAddons.ps1
# Validates every artifact the enterprise build should have produced.
# Exits 0 on success, 1 on failure.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$failures = 0

function Test-File {
  param([string]$RelativePath)
  $abs = Join-Path $root $RelativePath
  if (Test-Path -LiteralPath $abs) {
    Write-Host ('  [OK] ' + $RelativePath) -ForegroundColor Green
  } else {
    Write-Host ('  [MISSING] ' + $RelativePath) -ForegroundColor Red
    $script:failures++
  }
}

function Test-Contains {
  param([string]$RelativePath, [string]$Needle, [string]$Label)
  $abs = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $abs)) {
    Write-Host ('  [MISSING] ' + $RelativePath + ' (cannot check ' + $Label + ')') -ForegroundColor Red
    $script:failures++
    return
  }
  $content = [System.IO.File]::ReadAllText($abs)
  if ($content.Contains($Needle)) {
    Write-Host ('  [OK] ' + $RelativePath + ' -> ' + $Label) -ForegroundColor Green
  } else {
    Write-Host ('  [FAIL] ' + $RelativePath + ' missing ' + $Label) -ForegroundColor Red
    $script:failures++
  }
}

Write-Host 'Verifying enterprise addons ...'
Write-Host 'Part 1 - foundation:'
Test-File '.clasp.json'
Test-File '.claspignore'
Test-Contains '.claspignore' 'worker-enterprise-routes.js' 'excludes worker module'
Test-Contains '.claspignore' 'sw.js' 'excludes service worker'
Test-Contains '.claspignore' 'manifest.json' 'excludes manifest'
Test-Contains '.claspignore' '*.ps1' 'excludes PowerShell scripts'
Test-Contains '.claspignore' '*.md' 'excludes markdown'
Test-File 'docs/manifest.json'
Test-File 'docs/sw.js'
Test-File 'docs/docs-pwa-icon.svg'
Test-File 'EnterpriseSettings.js'
Test-File 'EnterpriseUtils.js'

Write-Host 'Part 2 - PWA + offline queue:'
Test-File 'docs/offline-queue.js'
Test-Contains 'docs/app.html' '<link rel="manifest"' 'manifest link'
Test-Contains 'docs/app.html' 'id="offlineLabel"' 'offline label span'
Test-Contains 'docs/app.html' 'offline-queue.js' 'offline queue include'

Write-Host 'Part 3 - server endpoints:'
Test-File 'EnterpriseService.gs'
Test-Contains 'EnterpriseService.gs' 'exportReviewCalendarIcs' 'ics endpoint'
Test-Contains 'EnterpriseService.gs' 'sendWhatsAppReviewReminders' 'whatsapp endpoint'
Test-Contains 'EnterpriseService.gs' 'getAiInsights' 'ai endpoint'
Test-Contains 'appsscript.json' 'script.external_request' 'external_request scope'
Test-Contains 'docs/app.js' 'exportReviewCalendarIcs' 'client ics method'
Test-Contains 'docs/app.js' 'sendWhatsAppReviewReminders' 'client whatsapp method'
Test-Contains 'docs/app.js' 'getAiInsights' 'client ai method'

Write-Host 'Part 4 - worker + orchestration:'
Test-File 'worker-enterprise-routes.js'
Test-Contains 'worker-enterprise-routes.js' 'enterpriseHeadersForPath' 'worker headers'
Test-Contains 'worker-enterprise-routes.js' 'Service-Worker-Allowed' 'SW allowed header'
Test-File 'Apply-EnterpriseAddons.ps1'
Test-File 'Run-EnterpriseAddons.bat'
Test-File 'Verify-EnterpriseAddons.ps1'
Test-File 'README_ENTERPRISE_ADDONS.md'

Write-Host ''
if ($failures -gt 0) {
  Write-Host ('Verification FAILED with ' + $failures + ' problem(s).') -ForegroundColor Red
  exit 1
} else {
  Write-Host 'Verification PASSED.' -ForegroundColor Green
  exit 0
}