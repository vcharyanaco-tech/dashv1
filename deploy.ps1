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

clasp push --force
Write-Host "Code pushed. Existing deployment URL unchanged." -ForegroundColor Green

Write-Host "`n=== Done ===" -ForegroundColor Cyan
