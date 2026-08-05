# sync.ps1
# Usage:
#   .\sync.ps1          # fetch + fast-forward to origin/main (discards local edits)
#
# Keeps the local clone always in sync with origin/main. Run before any
# work / push so the clone matches the live deployment (GitHub Pages site
# and Apps Script are both deployed from origin/main).

param(
    [switch]$Hard
)

$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\cmd\git.exe"
Set-Location $PSScriptRoot

Write-Host "Fetching origin..." -ForegroundColor Cyan
& $git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$localHead = (& $git rev-parse HEAD).Trim()
$remoteHead = (& $git rev-parse origin/main).Trim()

if ($localHead -eq $remoteHead) {
    Write-Host "Already up to date: $localHead" -ForegroundColor Green
    exit 0
}

$statusOut = & $git status --porcelain
if ($statusOut -and -not $Hard) {
    Write-Host "Working tree has local changes. Use -Hard to discard them and sync." -ForegroundColor Yellow
    Write-Host $statusOut
    exit 1
}

Write-Host "Syncing $localHead -> $remoteHead" -ForegroundColor Cyan
if ($Hard) {
    & $git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) { throw "git reset failed" }
    & $git clean -fd
} else {
    & $git merge --ff-only origin/main
    if ($LASTEXITCODE -ne 0) { throw "git merge --ff-only failed" }
}

& $git log --oneline -3
Write-Host "OK synced to $remoteHead" -ForegroundColor Green
