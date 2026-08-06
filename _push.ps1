$git = "C:\Program Files\Git\cmd\git.exe"
Set-Location $PSScriptRoot
& $git add -A
& $git commit -m "ci: deploy worker via node REST API script, no wrangler"
& $git pull --rebase origin main
& $git push origin main
Write-Host "Done"
