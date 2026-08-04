$ErrorActionPreference = "Stop"
git add -A
git commit -m "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main
