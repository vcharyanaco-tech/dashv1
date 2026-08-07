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