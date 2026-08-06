# deploy.ps1 — wrapper, calls deploy-all.ps1
# For the full pipeline (git + clasp + Cloudflare), run deploy-all.ps1 directly.
param([string]$CommitMessage = "")
& "$PSScriptRoot\deploy-all.ps1" $CommitMessage
