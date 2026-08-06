# deploy-all.ps1
# Complete deployment pipeline:
#   1. Git commit + push (triggers GitHub Pages for docs/)
#   2. Push to Google Apps Script via clasp
#   3. Deploy Cloudflare Worker (proxies GAS to dashboardharyana.site)
#
# Usage:
#   .\deploy-all.ps1                             # auto commit message
#   .\deploy-all.ps1 "fix: task management"      # custom commit message

param(
    [Parameter(Position=0)]
    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\cmd\git.exe"
Set-Location $PSScriptRoot

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMsg = if ($CommitMessage -ne "") { $CommitMessage } else { "auto: $timestamp" }

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " India Post Dashboard - Full Deployment Pipeline" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. GIT COMMIT + PUSH  (triggers GitHub Pages for docs/)
# ============================================================
Write-Host "[1/3] Git commit + push..." -ForegroundColor Yellow

& $git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$statusOut = & $git status --porcelain
if ($statusOut) {
    & $git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

    $newSha = (& $git rev-parse --short HEAD).Trim()
    Write-Host "  OK  Committed: [$newSha] $commitMsg" -ForegroundColor Green

    & $git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "  OK  Pushed to origin/main" -ForegroundColor Green
    Write-Host "      GitHub Actions will auto-deploy docs/ to www.dashboardharyana.site" -ForegroundColor Gray
} else {
    Write-Host "  --  Nothing to commit (working tree clean)" -ForegroundColor Gray
}

Write-Host ""

# ============================================================
# 2. GOOGLE APPS SCRIPT  (clasp push)
# ============================================================
Write-Host "[2/3] Pushing to Google Apps Script (clasp)..." -ForegroundColor Yellow

$claspOk = $false
try {
    $claspResult = clasp push --force 2>&1
    if ($LASTEXITCODE -eq 0) {
        $claspOk = $true
        Write-Host "  OK  Code pushed to Apps Script" -ForegroundColor Green
        Write-Host "      GAS @HEAD deployment updated automatically" -ForegroundColor Gray
    } else {
        Write-Host "  WARN  clasp push returned non-zero (may need: clasp login)" -ForegroundColor Red
        Write-Host ($claspResult | Out-String) -ForegroundColor DarkGray
    }
} catch {
    Write-Host "  WARN  clasp not found: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Install: npm install -g @google/clasp" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# 3. CLOUDFLARE WORKER  (wrangler deploy)
# ============================================================
Write-Host "[3/3] Deploying Cloudflare Worker..." -ForegroundColor Yellow

$workerOk = $false
try {
    $wranglerOut = npx wrangler deploy 2>&1
    if ($LASTEXITCODE -eq 0) {
        $workerOk = $true
        Write-Host "  OK  Worker deployed successfully" -ForegroundColor Green
        $liveUrl = $wranglerOut | Select-String -Pattern "https://[^\s]+" | `
            ForEach-Object { $_.Matches.Value } | Select-Object -First 1
        if ($liveUrl) {
            Write-Host "      Worker URL: $liveUrl" -ForegroundColor Gray
        }
        Write-Host "      Live: https://dashboardharyana.site/app.html" -ForegroundColor Cyan
    } else {
        Write-Host "  WARN  wrangler deploy failed" -ForegroundColor Red
        Write-Host ($wranglerOut | Out-String) -ForegroundColor DarkGray
        Write-Host "  Fix: npx wrangler login  (first-time auth)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN  wrangler not found: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Install: npm install -g wrangler  OR use: npx wrangler deploy" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Deployment summary" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Git push + GitHub Pages : OK" -ForegroundColor $(if ($statusOut -or !$statusOut) { "Green" } else { "Gray" })
Write-Host "  Google Apps Script      : $(if ($claspOk) { 'OK' } else { 'WARN - check above' })" -ForegroundColor $(if ($claspOk) { "Green" } else { "Red" })
Write-Host "  Cloudflare Worker       : $(if ($workerOk) { 'OK' } else { 'WARN - check above' })" -ForegroundColor $(if ($workerOk) { "Green" } else { "Red" })
Write-Host ""
Write-Host "Live URLs:" -ForegroundColor White
Write-Host "  App    -> https://dashboardharyana.site/app.html" -ForegroundColor Cyan
Write-Host "  Site   -> https://www.dashboardharyana.site" -ForegroundColor Cyan
Write-Host ""
