# export-session.ps1
# One-command wrapper around export-session.py.
# Pushes the current opencode session to the PRIVATE repo
# vcharyanaco-tech/dashv1-sessions (never the public dashv1 repo).
#
# Usage:
#   .\export-session.ps1                          # export latest session + push
#   .\export-session.ps1 -List                    # list recent sessions
#   .\export-session.ps1 -Session ses_00ab...     # export a specific session
#   .\export-session.ps1 -NoPush                  # render locally, don't push
#   .\export-session.ps1 -Sanitize                # redact API keys / tokens

param(
    [string]$Session,
    [switch]$List,
    [switch]$NoPush,
    [switch]$Sanitize,
    [string]$Out
)

$ErrorActionPreference = "Stop"
$py = "$PSScriptRoot\export-session.py"

$args = @()
if ($List)        { $args += "--list" }
if ($NoPush)      { $args += "--no-push" }
if ($Sanitize)    { $args += "--sanitize" }
if ($Session)     { $args += "--session"; $args += $Session }
if ($Out)         { $args += "--out"; $args += $Out }

& python $py @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
