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

# Push code to Apps Script
clasp push --force
Write-Host "Code pushed to Apps Script" -ForegroundColor Green

# Delete all previous deployments (skip @HEAD which is always present)
$deployments = clasp deployments 2>&1
$deploymentIds = @()
foreach ($line in $deployments) {
  if ($line -match '^\-\s+(\S+)\s+@(\d+)') {
    $deploymentIds += $Matches[1]
  }
}

if ($deploymentIds.Count -gt 0) {
  foreach ($id in $deploymentIds) {
    Write-Host "Deleting deployment: $id" -ForegroundColor DarkYellow
    clasp delete-deployment $id 2>&1 | Out-Null
  }
  Write-Host "All previous deployments deleted" -ForegroundColor Green
} else {
  Write-Host "No previous deployments found" -ForegroundColor Yellow
}

# Create new deployment
$output = clasp deploy --description "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1
Write-Host $output -ForegroundColor Cyan

# Extract the web app URL
$url = ($output | Select-String -Pattern 'https://.*\.googleapis\.com/devpost').Matches.Value
if (-not $url) {
  $url = ($output | Select-String -Pattern 'https://script\.google\.com.*[/"]').Matches.Value
}
if ($url) {
  Write-Host "`nWeb app URL: $url" -ForegroundColor Green
} else {
  Write-Host "`nDeployment complete. Check clasp deploy output above for the URL." -ForegroundColor Green
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
