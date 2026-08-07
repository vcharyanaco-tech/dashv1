# Build-EnterpriseAddons-Part4.ps1
# Adds the Cloudflare Worker enterprise-route module, the orchestration
# scripts (Apply / Run / Verify), the addons README, and hardens .claspignore.
# ASCII-only. Single-quoted here-strings. UTF-8 (no BOM). Backups before patches.

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$nl = "`r`n"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Backup-Existing {
  param([string]$RelativePath)
  $abs = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $abs)) { return }
  $bak = $abs + '.bak'
  if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  Copy-Item -LiteralPath $abs -Destination $bak -Force
  Write-Host ('Backed up ' + $RelativePath + ' -> ' + (Split-Path -Leaf $bak))
}

function Write-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $abs = Join-Path $repoRoot $RelativePath
  $dir = Split-Path -Parent $abs
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Backup-Existing $RelativePath
  [System.IO.File]::WriteAllText($abs, $Content, $utf8)
  Write-Host ('Wrote ' + $RelativePath)
}

function Patch-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Anchor,
    [Parameter(Mandatory = $true)][string]$Replacement
  )
  $abs = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $abs)) { throw ('Missing: ' + $RelativePath) }
  $content = [System.IO.File]::ReadAllText($abs, $utf8)
  if (-not $content.Contains($Anchor)) { throw ('Anchor not found in ' + $RelativePath + ': ' + $Anchor) }
  Backup-Existing $RelativePath
  $content = $content.Replace($Anchor, $Replacement)
  [System.IO.File]::WriteAllText($abs, $content, $utf8)
  Write-Host ('Patched ' + $RelativePath)
}

# ------------------------------------------------------------ worker-enterprise-routes.js
$workerRoutes = @'
/**
 * worker-enterprise-routes.js
 * Optional Cloudflare Worker module for the enterprise addons (PWA).
 *
 * The base worker (worker.js) already serves every file in docs/ via the raw
 * GitHub CDN, so manifest.json, sw.js, offline-queue.js and the PWA icon all
 * resolve automatically. This module only upgrades their response headers
 * (MIME type, cache policy, Service-Worker-Allowed) and is safe to import.
 *
 * Wiring into worker.js (3 lines):
 *   import { isEnterprisePath, enterpriseHeadersForPath } from './worker-enterprise-routes.js';
 *   // in fetch(), before the static-bundle fallback:
 *   if (isEnterprisePath(path)) {
 *     const resp = await fetchFromPages(path, url.search);
 *     const headers = new Headers(resp.headers);
 *     Object.entries(enterpriseHeadersForPath(path)).forEach(([k, v]) => headers.set(k, v));
 *     return new Response(resp.body, { status: resp.status, headers });
 *   }
 */

const ENTERPRISE_MANIFEST_PATH = '/manifest.json';
const ENTERPRISE_SW_PATH = '/sw.js';
const ENTERPRISE_QUEUE_PATH = '/offline-queue.js';
const ENTERPRISE_ICON_PATH = '/docs-pwa-icon.svg';

/* Returns the extra response headers for a PWA path, or null when the path is
   not managed by the enterprise module. */
export function enterpriseHeadersForPath(path) {
  const clean = String(path || '').split('?')[0];

  if (clean === ENTERPRISE_MANIFEST_PATH) {
    return {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
  }

  if (clean === ENTERPRISE_SW_PATH) {
    return {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    };
  }

  if (clean === ENTERPRISE_QUEUE_PATH) {
    return {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
  }

  if (clean === ENTERPRISE_ICON_PATH) {
    return {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400'
    };
  }

  return null;
}

/* True when the path is one of the enterprise-managed PWA assets. */
export function isEnterprisePath(path) {
  return enterpriseHeadersForPath(path) !== null;
}
'@
Write-TextFile 'worker-enterprise-routes.js' $workerRoutes

# ------------------------------------------------------------ Apply-EnterpriseAddons.ps1
$applyScript = @'
# Apply-EnterpriseAddons.ps1
# Runs the full enterprise addons build (Parts 1-3) and verifies the result.
# This script NEVER commits, pushes, runs clasp, or deploys - those steps are
# documented in README_ENTERPRISE_ADDONS.md and executed by the user.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Invoke-BuildPart {
  param([string]$Name)
  $file = Join-Path $root $Name
  if (-not (Test-Path -LiteralPath $file)) { throw ('Missing build script: ' + $Name) }
  Write-Host ('Running ' + $Name + ' ...') -ForegroundColor Cyan
  & $file
  if ($LASTEXITCODE -ne 0) { throw ('Build step failed: ' + $Name) }
}

Invoke-BuildPart 'Build-EnterpriseAddons-Part1.ps1'
Invoke-BuildPart 'Build-EnterpriseAddons-Part2.ps1'
Invoke-BuildPart 'Build-EnterpriseAddons-Part3.ps1'

Write-Host 'Running verification ...' -ForegroundColor Cyan
$verify = Join-Path $root 'Verify-EnterpriseAddons.ps1'
& $verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed. See messages above.' }

Write-Host ''
Write-Host 'Enterprise addons applied and verified.' -ForegroundColor Green
Write-Host 'Next steps (NOT automated):' -ForegroundColor Yellow
Write-Host '  1. git add -A; git commit; git push   (Pages rebuilds docs/)'
Write-Host '  2. clasp push --force                 (GAS gets EnterpriseService.gs)'
Write-Host '  3. clasp deploy -i <worker-target-deployment> -V <newVersion>'
Write-Host '  4. Redeploy the Cloudflare Worker after wiring worker-enterprise-routes.js'
'@
Write-TextFile 'Apply-EnterpriseAddons.ps1' $applyScript

# ------------------------------------------------------------ Run-EnterpriseAddons.bat
$runBat = @'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-EnterpriseAddons.ps1"
if errorlevel 1 (
  echo.
  echo Enterprise addons build FAILED. Check the messages above.
  exit /b 1
)
endlocal
'@
Write-TextFile 'Run-EnterpriseAddons.bat' $runBat

# ------------------------------------------------------------ Verify-EnterpriseAddons.ps1
$verifyScript = @'
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
'@
Write-TextFile 'Verify-EnterpriseAddons.ps1' $verifyScript

# ------------------------------------------------------------ README_ENTERPRISE_ADDONS.md
$readme = @'
# Enterprise Addons - India Post Dashboard

This folder-level build adds four enterprise capabilities on top of the
existing Circle Office Haryana dashboard: PWA + offline action queue, a
review-calendar .ics export, WhatsApp review reminders, and AI dashboard
insights. All features are gated by ENTERPRISE_SETTINGS in
EnterpriseSettings.js and are DISABLED by default.

## What was added

| Part | Files | Purpose |
|------|-------|---------|
| 1 | .clasp.json, .claspignore | Clasp hygiene: skip docs/, exclude build/Node artifacts, keep GAS push safe |
| 1 | docs/manifest.json, docs/sw.js, docs/docs-pwa-icon.svg | PWA app-shell manifest, service worker, icon |
| 1 | EnterpriseSettings.js, EnterpriseUtils.js | Feature flags + shared helpers (ics escape/format, feature gating) |
| 2 | docs/offline-queue.js | Wraps apiCall_: queues mutating calls while offline, replays FIFO on reconnect, registers sw.js |
| 2 | docs/app.html (patched) | Manifest link, theme-color, offline label span, offline-queue include |
| 3 | EnterpriseService.gs | Server endpoints: exportReviewCalendarIcs, sendWhatsAppReviewReminders, getAiInsights |
| 3 | appsscript.json (patched) | Adds script.external_request scope for UrlFetchApp |
| 3 | docs/app.js (patched) | Client API methods for the three endpoints |
| 4 | worker-enterprise-routes.js | Optional Worker module: PWA header upgrades |
| 4 | Apply / Run / Verify scripts | Orchestration + verification (never push/deploy) |

## Configuration (EnterpriseSettings.js)

- WHATSAPP.enabled / apiBaseUrl / apiToken / senderNumber - WhatsApp provider.
- CALENDAR.enabled - .ics export for review-due records.
- AI_INSIGHTS.enabled / apiKey / model / endpoint - AI summary provider.
  Endpoint defaults to ENTERPRISE_AI_DEFAULT_ENDPOINT in EnterpriseService.gs.

Placeholder credentials are empty strings. Nothing is sent until you set real
values AND flip the matching enabled flag. Never commit real secrets.

## Offline queue (docs/offline-queue.js)

- Mutating calls (addItem, updateItem, deleteItem, markReviewDone, tasks,
  submissions, documents, approvals, settings) are queued in localStorage
  (key ipd_offline_queue_v1, capped at 200) when navigator.onLine is false.
- Read calls pass through untouched.
- On the online event the queue replays FIFO; each item is removed whether it
  succeeds or fails, so the queue can never deadlock.
- After a successful flush the app calls refreshData() and loadNotifications(true).

## Service worker (docs/sw.js)

- Precache: /app.html, /app.js, /assets/styles.css, /manifest.json,
  /docs-pwa-icon.svg.
- Bypass /macros/* so API calls always go to GAS.
- Runtime cache same-origin GETs; offline fallback to /app.html.

## Worker wiring (optional, Part 4)

worker.js already serves every file in docs/. To upgrade PWA headers:

  import { isEnterprisePath, enterpriseHeadersForPath } from './worker-enterprise-routes.js';

  // in fetch(), before the static-bundle fallback:
  if (isEnterprisePath(path)) {
    const resp = await fetchFromPages(path, url.search);
    const headers = new Headers(resp.headers);
    Object.entries(enterpriseHeadersForPath(path)).forEach(([k, v]) => headers.set(k, v));
    return new Response(resp.body, { status: resp.status, headers });
  }

Then redeploy the Worker. Without this, the PWA still works; the headers are
only an optimization.

## Build + verify (offline only)

- Double-click Run-EnterpriseAddons.bat, or run Apply-EnterpriseAddons.ps1.
- It runs Parts 1-3 then Verify-EnterpriseAddons.ps1.
- It never commits, pushes, runs clasp, or deploys.

## Deploy checklist (manual, in order)

1. git add -A; git commit -m 'feat: enterprise addons (PWA, offline queue, ics, whatsapp, ai)'; git push
   -> GitHub Pages rebuilds docs/.
2. clasp push --force
   -> pushes EnterpriseService.gs + EnterpriseSettings.js + EnterpriseUtils.js
      (docs/ and *.ps1/*.md are excluded via .claspignore).
3. clasp version '<message>'
   clasp deploy -i <worker-target-deployment-id> -V <newVersion> -d '<message>'
   -> GAS exec URL now serves the new endpoints.
4. Bump the cache-buster in docs/app.html (?v=...) so clients fetch the new
   app.js, then commit + push again.
5. Redeploy the Cloudflare Worker after wiring worker-enterprise-routes.js.

## Verification

Run Verify-EnterpriseAddons.ps1 any time after building. It checks all files
and key markers and exits non-zero on failure.

## Safety notes

- .claspignore excludes docs/**, sw.js, manifest.json, worker-enterprise-routes.js,
  deploy-worker-api.js, *.ps1 and *.md, so no Node/PowerShell/PWA file can ever
  be pushed to Apps Script.
- All generated content is ASCII-only and UTF-8 (no BOM) to survive Windows
  PowerShell 5.1 and Git line-ending handling.
- Every patched file is backed up to <name>.bak before modification.
'@
Write-TextFile 'README_ENTERPRISE_ADDONS.md' $readme

# ------------------------------------------------------------ .claspignore: append enterprise exclusions
$claspAbs = Join-Path $repoRoot '.claspignore'
$claspContent = [System.IO.File]::ReadAllText($claspAbs, $utf8)
$addLines = @('worker-enterprise-routes.js', 'sw.js', 'manifest.json')
$missing = @($addLines | Where-Object { -not ($claspContent -split "`r?`n" | ForEach-Object { $_.Trim() }) -contains $_ })
if ($missing.Count -gt 0) {
  Backup-Existing '.claspignore'
  $toAdd = ($missing -join $nl)
  $claspContent = $claspContent.TrimEnd("`r", "`n") + $nl + $toAdd + $nl
  [System.IO.File]::WriteAllText($claspAbs, $claspContent, $utf8)
  Write-Host ('Patched .claspignore: added ' + ($missing -join ', '))
} else {
  Write-Host '.claspignore already contains all enterprise exclusions.'
}

Write-Host ''
Write-Host 'Part 4 complete. Files: worker-enterprise-routes.js, Apply-EnterpriseAddons.ps1, Run-EnterpriseAddons.bat, Verify-EnterpriseAddons.ps1, README_ENTERPRISE_ADDONS.md (created); .claspignore (patched).'
