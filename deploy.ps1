$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Pushing to Git ===" -ForegroundColor Cyan
git add -A
$changes = git status --porcelain
if ($changes) {
  git commit -m "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  git push origin main
  Write-Host "Pushed to origin/main" -ForegroundColor Green
} else {
  Write-Host "No changes to commit" -ForegroundColor Yellow
}

Write-Host "`n=== Deploying to Apps Script ===" -ForegroundColor Cyan

# Push code - @HEAD deployment auto-serves latest code at a fixed URL
clasp push --force
Write-Host "Code pushed to Apps Script" -ForegroundColor Green

# Show the @HEAD deployment URL (unchanged across deploys)
$deployments = clasp deployments 2>&1
foreach ($line in $deployments) {
  if ($line -match '^\-\s+(\S+)\s+@HEAD') {
    $headId = $Matches[1]
    Write-Host "`nWeb app URL: https://script.google.com/macros/s/$headId/exec" -ForegroundColor Green
    break
  }
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
