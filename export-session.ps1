# export-session.ps1
# One-command wrapper around export-session.py.
# Pushes the current opencode session to the PRIVATE repo
# vcharyanaco-tech/dashv1-sessions (never the public dashv1 repo).
#
# Usage:
#   .\export-session.ps1                          # export latest session + push (sanitized)
#   .\export-session.ps1 -List                    # list recent sessions
#   .\export-session.ps1 -Session ses_00ab...     # export a specific session
#   .\export-session.ps1 -NoPush                  # render locally, don't push
#   .\export-session.ps1 -NoSanitize              # KEEP API keys / tokens in the export
#   .\export-session.ps1 -Out C:\some\dir         # override working directory
#   .\export-session.ps1 -Help                    # show full script help

param(
    [string]$Session,
    [switch]$List,
    [switch]$NoPush,
    [switch]$NoSanitize,
    [string]$Out,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$py = "$PSScriptRoot\export-session.py"

# Prefer `python`, fall back to the Windows launcher `py`.
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) { $pythonCmd = Get-Command py -ErrorAction SilentlyContinue }
if (-not $pythonCmd) { throw "python not found on PATH" }

$forward = @()
if ($List)        { $forward += "--list" }
if ($NoPush)      { $forward += "--no-push" }
if ($NoSanitize)  { $forward += "--no-sanitize" }
if ($Session)     { $forward += "--session"; $forward += $Session }
if ($Out)         { $forward += "--out"; $forward += $Out }
if ($Help)        { $forward += "--help" }

& $pythonCmd.Source $py @forward
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
