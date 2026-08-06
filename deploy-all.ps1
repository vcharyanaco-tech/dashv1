# deploy-all.ps1
# Complete deployment pipeline:
#   1. Git commit + push (triggers GitHub Pages for docs/)
#   2. Push to Google Apps Script via clasp
#   3. Deploy Cloudflare Worker (proxies GAS to dashboardharyana.site)
#
# Usage:
#   .\deploy-all.ps1                             # auto commit message
#   .\deploy-all.ps1 "fix: task management"      # custom commit message
#
# First-time setup:
#   Set CLOUDFLARE_API_TOKEN env var:
#     [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN","<token>","User")
#   Or run: npx wrangler login

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

    # Pull + rebase to handle any remote-ahead scenario
    & $git pull --rebase origin main 2>&1 | Out-Null

    & $git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "  OK  Pushed to origin/main" -ForegroundColor Green
    Write-Host "      GitHub Actions auto-deploys docs/ to www.dashboardharyana.site" -ForegroundColor Gray
} else {
    Write-Host "  --  Nothing to commit (working tree clean)" -ForegroundColor Gray
    # Still push in case of unpushed commits
    & $git push origin main 2>&1 | Out-Null
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
        Write-Host "  WARN  clasp push returned non-zero. Run: clasp login" -ForegroundColor Red
        Write-Host ($claspResult | Out-String) -ForegroundColor DarkGray
    }
} catch {
    Write-Host "  WARN  clasp not found: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Install: npm install -g @google/clasp" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# 3. CLOUDFLARE WORKER  (REST API via deploy-worker-api.js)
# ============================================================
Write-Host "[3/3] Deploying Cloudflare Worker..." -ForegroundColor Yellow

# Check for token in User or Machine env vars
$cfToken = [System.Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User")
if (-not $cfToken) { $cfToken = [System.Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "Machine") }
if (-not $cfToken) { $cfToken = $env:CLOUDFLARE_API_TOKEN }

if (-not $cfToken) {
    Write-Host "  SKIP  CLOUDFLARE_API_TOKEN not set." -ForegroundColor Yellow
    Write-Host "  Set it once with:" -ForegroundColor Yellow
    Write-Host '    [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN","<token>","User")' -ForegroundColor DarkYellow
    Write-Host "  Get a token at: https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor DarkYellow
    $workerOk = $false
} else {
    $workerOk = $false
    try {
        $nodeOut = node "$PSScriptRoot\deploy-worker-api.js" $cfToken 2>&1
        if ($LASTEXITCODE -eq 0) {
            $workerOk = $true
            Write-Host "  OK  Worker deployed successfully" -ForegroundColor Green
            $nodeOut | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
            Write-Host "      Live: https://dashboardharyana.site/app.html" -ForegroundColor Cyan
        } else {
            Write-Host "  WARN  Worker deploy failed:" -ForegroundColor Red
            Write-Host ($nodeOut | Out-String) -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  WARN  node error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Deployment Summary" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Git + GitHub Pages    : OK" -ForegroundColor Green
Write-Host "  Google Apps Script    : $(if ($claspOk) { 'OK' } else { 'WARN (check above)' })" -ForegroundColor $(if ($claspOk) { "Green" } else { "Red" })
Write-Host "  Cloudflare Worker     : $(if ($workerOk) { 'OK' } else { 'Pending (set token or wait for CI)' })" -ForegroundColor $(if ($workerOk) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "Live URLs:" -ForegroundColor White
Write-Host "  App   -> https://dashboardharyana.site/app.html" -ForegroundColor Cyan
Write-Host "  Site  -> https://www.dashboardharyana.site" -ForegroundColor Cyan
Write-Host ""
