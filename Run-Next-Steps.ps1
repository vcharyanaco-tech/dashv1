# Run-Next-Steps.ps1
# Safe local pre-flight check for the India Post Dashboard enterprise addons.
# Performs READ-ONLY checks only. It NEVER pushes to GitHub, deploys to Apps
# Script or Cloudflare, modifies secrets, or deletes files.
# Exit code: 0 = all checks passed, 1 = at least one check failed.

$ErrorActionPreference = 'Continue'
$failures = 0
$repoRoot = 'D:\VS tools\dashv1'

function Check {
  param([bool]$Ok, [string]$Label)
  if ($Ok) {
    Write-Host ('  [PASS] ' + $Label) -ForegroundColor Green
  } else {
    Write-Host ('  [FAIL] ' + $Label) -ForegroundColor Red
    $script:failures++
  }
}

Write-Host '=== 1. Repository location ==='
Check (Test-Path -LiteralPath $repoRoot) "Repository exists at $repoRoot"
Check ((Get-Location).Path -ieq $repoRoot) 'Current directory is the repository root'

Write-Host '=== 2. Git branch ==='
$branch = git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null
Check ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($branch)) "Git branch readable (current: $branch)"
if ($branch -eq 'feat/enterprise-addons') {
  Write-Host '  [INFO] On feature branch feat/enterprise-addons.'
}

Write-Host '=== 3. Required generated files ==='
$required = @(
  '.clasp.json',
  '.claspignore',
  'docs/manifest.json',
  'docs/sw.js',
  'docs/docs-pwa-icon.svg',
  'EnterpriseSettings.js',
  'EnterpriseUtils.js',
  'EnterpriseService.gs',
  'docs/offline-queue.js',
  'worker-enterprise-routes.js',
  'Build-EnterpriseAddons-Part1.ps1',
  'Build-EnterpriseAddons-Part2.ps1',
  'Build-EnterpriseAddons-Part3.ps1',
  'Build-EnterpriseAddons-Part4.ps1',
  'Apply-EnterpriseAddons.ps1',
  'Run-EnterpriseAddons.bat',
  'Verify-EnterpriseAddons.ps1',
  'README_ENTERPRISE_ADDONS.md'
)
foreach ($rel in $required) {
  Check (Test-Path -LiteralPath (Join-Path $repoRoot $rel)) $rel
}

Write-Host '=== 4. File sizes (min 200 bytes) ==='
foreach ($rel in $required) {
  $abs = Join-Path $repoRoot $rel
  if (Test-Path -LiteralPath $abs) {
    $len = (Get-Item -LiteralPath $abs).Length
    Check ($len -ge 200) ("$rel is $len bytes (>= 200)")
  }
}
Write-Host '  [INFO] Mapped aliases (consolidated build):'
Write-Host '    CalendarExport.js       -> EnterpriseService.gs (exportReviewCalendarIcs/buildIcs_)'
Write-Host '    WhatsAppNotifications.js -> EnterpriseService.gs (sendWhatsAppReviewReminders)'
Write-Host '    AIInsights.js           -> EnterpriseService.gs (getAiInsights)'
Write-Host '    OfflineSync.js          -> docs/offline-queue.js'
Write-Host '    enterprise-addons.html  -> integration lives in docs/app.html + docs/app.js'
Write-Host '    docs/pwa-icon.svg       -> docs/docs-pwa-icon.svg'

Write-Host '=== 5. .clasp.json trailing-space check ==='
$claspPath = Join-Path $repoRoot '.clasp.json'
if (Test-Path -LiteralPath $claspPath) {
  $lines = Get-Content -LiteralPath $claspPath
  $bad = $false
  foreach ($line in $lines) {
    if ($line -match '\S\s+":' -or $line -match ':\s*"[^"]*"\s*$' -or $line -match '\s+$') {
      $bad = $true
      Write-Host ('    Suspicious line: [' + $line + ']') -ForegroundColor Yellow
    }
  }
  Check (-not $bad) '.clasp.json has no trailing spaces in keys/values'
  Check (($lines -join "`n").Contains('"scriptId": "1QYwVDQGWPL5o64Xrvv9kKfE-AFT2nUuVMlvOc5CTK46qClfTCu3ofWcU"')) '.clasp.json preserves scriptId'
  Check (($lines -join "`n").Contains('"projectId": "dashboard-504111"')) '.clasp.json preserves projectId'
} else {
  Check $false '.clasp.json exists'
}

Write-Host '=== 6. index.html / docs/app.html include checks ==='
$rootIndex = Join-Path $repoRoot 'index.html'
if (Test-Path -LiteralPath $rootIndex) {
  $ri = Get-Content -LiteralPath $rootIndex -Raw
  Check $ri.Contains("include('enterprise-addons')") "root index.html contains <?!= include('enterprise-addons'); ?>"
} else {
  Check $false 'root index.html exists'
}
$liveHtml = Join-Path $repoRoot 'docs/app.html'
if (Test-Path -LiteralPath $liveHtml) {
  $lh = Get-Content -LiteralPath $liveHtml -Raw
  Check $lh.Contains('offline-queue.js') 'docs/app.html includes offline-queue.js'
  Check $lh.Contains('<link rel="manifest"') 'docs/app.html includes manifest link'
  Check $lh.Contains('id="offlineLabel"') 'docs/app.html includes offline label span'
} else {
  Check $false 'docs/app.html exists'
}

Write-Host ''
if ($failures -gt 0) {
  Write-Host ('SUMMARY: ' + $failures + ' check(s) FAILED. See README_ENTERPRISE_ADDONS.md and the runbook for fixes.') -ForegroundColor Red
  exit 1
} else {
  Write-Host 'SUMMARY: All checks PASSED.' -ForegroundColor Green
  exit 0
}
