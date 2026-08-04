# auto-commit.ps1
# Usage:
#   .\auto-commit.ps1                          # auto message: "auto: <timestamp>"
#   .\auto-commit.ps1 "fix: my task summary"   # custom commit message
#   .\auto-commit.ps1 -TaskSummary "fix: ..."  # named param
#
# What it does:
#   1. Updates SESSION.md Last-updated timestamp
#   2. git add -A
#   3. git commit
#   4. git push origin main
#   5. Patches SESSION.md Recent-commits with real SHA (second commit + push)

param(
    [Parameter(Position=0)]
    [string]$TaskSummary = ""
)

$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\cmd\git.exe"
Set-Location $PSScriptRoot

# ── 1. Build commit message ───────────────────────────────────────────────────
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMsg = if ($TaskSummary -ne "") { $TaskSummary } else { "auto: $timestamp" }

# ── 2. Update SESSION.md timestamp ───────────────────────────────────────────
$sessionFile = Join-Path $PSScriptRoot "SESSION.md"
if (Test-Path $sessionFile) {
    $lines = Get-Content $sessionFile
    $lines = $lines | ForEach-Object {
        if ($_ -match '^Last updated:') { "Last updated: $timestamp" } else { $_ }
    }
    $lines | Set-Content $sessionFile
}

# ── 3. Stage everything ───────────────────────────────────────────────────────
& $git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

# ── 4. Check if there is anything to commit ──────────────────────────────────
$statusOut = & $git status --porcelain
if (-not $statusOut) {
    Write-Host "Nothing to commit - working tree clean." -ForegroundColor Yellow
    exit 0
}

# ── 5. Commit ─────────────────────────────────────────────────────────────────
& $git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
$newSha = (& $git rev-parse --short HEAD).Trim()

# ── 6. Push ───────────────────────────────────────────────────────────────────
& $git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

# ── 7. Patch SESSION.md Recent-commits with real SHA (separate commit) ────────
if ((Test-Path $sessionFile) -and ($TaskSummary -ne "")) {
    $lines = Get-Content $sessionFile
    $newLines = [System.Collections.Generic.List[string]]::new()
    $inserted = $false
    foreach ($line in $lines) {
        $newLines.Add($line)
        if (-not $inserted -and $line -match '^## Recent commits') {
            $newLines.Add("- ``$newSha`` $commitMsg")
            $inserted = $true
        }
    }
    if ($inserted) {
        $newLines | Set-Content $sessionFile
        & $git add SESSION.md
        $statusAfter = & $git status --porcelain
        if ($statusAfter) {
            & $git commit -m "session: log [$newSha] in SESSION.md"
            & $git push origin main
        }
    }
}

Write-Host ""
Write-Host "OK Committed + pushed: [$newSha] $commitMsg" -ForegroundColor Green
