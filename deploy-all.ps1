# deploy-all.ps1
# Complete deployment pipeline:
#   1. Git commit + push (triggers GitHub Pages for docs/)
#   2. Push to Google Apps Script via clasp
#   3. Redeploy the live Apps Script deployment (pinned versions don't auto-follow @HEAD)
#   4. Deploy Cloudflare Worker (proxies GAS to dashboardharyana.site)
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

# Runs git while keeping its normal stderr chatter from becoming a terminating
# error (git writes progress/"From https://..." to stderr, which PowerShell 5.1
# surfaces as NativeCommandError under $ErrorActionPreference = "Stop").
function Invoke-Git {
    param([string[]]$GitArgs)
    $ErrorActionPreference = "Continue"
    $out = & $git @GitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($out) { $out | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray } }
    return $code
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMsg = if ($CommitMessage -ne "") { $CommitMessage } else { "auto: $timestamp" }

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " India Post Dashboard - Full Deployment Pipeline" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. GIT COMMIT + PUSH  (triggers GitHub Pages for docs/)
# ============================================================
Write-Host "[1/4] Git commit + push..." -ForegroundColor Yellow

$code = Invoke-Git @("add", "-A")
if ($code -ne 0) { throw "git add failed (exit $code)" }

$statusOut = & $git status --porcelain
if ($statusOut) {
    $code = Invoke-Git @("commit", "-m", $commitMsg)
    if ($code -ne 0) { throw "git commit failed (exit $code)" }

    $newSha = (& $git rev-parse --short HEAD).Trim()
    Write-Host "  OK  Committed: [$newSha] $commitMsg" -ForegroundColor Green

    # Pull + rebase to handle any remote-ahead scenario
    Invoke-Git @("pull", "--rebase", "origin", "main") | Out-Null

    $code = Invoke-Git @("push", "origin", "main")
    if ($code -ne 0) { throw "git push failed (exit $code)" }
    Write-Host "  OK  Pushed to origin/main" -ForegroundColor Green
    Write-Host "      GitHub Actions auto-deploys docs/ to www.dashboardharyana.site" -ForegroundColor Gray
} else {
    Write-Host "  --  Nothing to commit (working tree clean)" -ForegroundColor Gray
    # Still push in case of unpushed commits
    Invoke-Git @("push", "origin", "main") | Out-Null
}

Write-Host ""

# ============================================================
# 2. GOOGLE APPS SCRIPT  (clasp push)
# ============================================================
Write-Host "[2/4] Pushing to Google Apps Script (clasp)..." -ForegroundColor Yellow

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

# ============================================================
# 3. REDEPLOY LIVE APPS SCRIPT DEPLOYMENT
#    A pinned deployment (the one docs/app.js calls) stays on the
#    old version after clasp push. Redeploy it so live users get
#    the new code. The deployment ID is parsed from docs/app.js
#    so this stays in sync automatically.
# ============================================================
$gasDeployOk = $false
if ($claspOk) {
    Write-Host "[3/4] Redeploying live Apps Script deployment..." -ForegroundColor Yellow
    $appJsPath = Join-Path $PSScriptRoot "docs\app.js"
    $gasDeployId = $null
    if (Test-Path $appJsPath) {
        $appJs = Get-Content $appJsPath -Raw
        $m = [regex]::Match($appJs, '/macros/s/([A-Za-z0-9_-]+)/exec')
        if ($m.Success) { $gasDeployId = $m.Groups[1].Value }
    }
    if ($gasDeployId) {
        try {
            $deployOut = clasp deploy --deploymentId $gasDeployId --description "deploy-all $timestamp" 2>&1
            if ($LASTEXITCODE -eq 0) {
                $gasDeployOk = $true
                Write-Host "  OK  Redeployed deployment $gasDeployId" -ForegroundColor Green
                Write-Host "      Live: https://dashboardharyana.site/macros/s/$gasDeployId/exec" -ForegroundColor Gray
            } else {
                Write-Host "  WARN  clasp deploy failed:" -ForegroundColor Red
                Write-Host ($deployOut | Out-String) -ForegroundColor DarkGray
            }
        } catch {
            Write-Host "  WARN  clasp deploy error: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  WARN  Could not find the Apps Script deployment id in docs/app.js" -ForegroundColor Red
    }
    Write-Host ""
}

# ============================================================
# 4. CLOUDFLARE WORKER  (REST API via deploy-worker-api.js)
# ============================================================
Write-Host "[4/4] Deploying Cloudflare Worker..." -ForegroundColor Yellow

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
Write-Host "  Git + GitHub Pages        : OK" -ForegroundColor Green
Write-Host "  Google Apps Script        : $(if ($claspOk) { 'OK' } else { 'WARN (check above)' })" -ForegroundColor $(if ($claspOk) { "Green" } else { "Red" })
Write-Host "  Apps Script redeploy      : $(if ($gasDeployOk) { 'OK' } else { 'SKIP (not pushed or no id)' })" -ForegroundColor $(if ($gasDeployOk) { "Green" } else { "Yellow" })
Write-Host "  Cloudflare Worker         : $(if ($workerOk) { 'OK' } else { 'Pending (set token or wait for CI)' })" -ForegroundColor $(if ($workerOk) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "Live URLs:" -ForegroundColor White
Write-Host "  App   -> https://dashboardharyana.site/app.html" -ForegroundColor Cyan
Write-Host "  Site  -> https://www.dashboardharyana.site" -ForegroundColor Cyan
Write-Host ""
