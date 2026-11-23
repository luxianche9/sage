# Every software check of the repository: platform (frontend, backend, end-to-end) and plugins.
# Run before merging into main; nothing here touches real hardware.
#   .\scripts\verify.ps1            everything (about 15 minutes)
#   .\scripts\verify.ps1 -Quick     skip the end-to-end tests
[CmdletBinding()]
param([switch]$Quick)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Step([string]$Name, [string]$Directory, [scriptblock]$Command) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    Push-Location -LiteralPath (Join-Path $repo $Directory)
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)" }
    }
    finally { Pop-Location }
}

Step "platform: frontend" "app" { pnpm verify }
Step "platform: backend" "app" { pnpm verify:python }
if (-not $Quick) { Step "platform: end-to-end" "app" { pnpm test:e2e } }
Step "plugins + SDK" "plugin" { powershell -NoProfile -ExecutionPolicy Bypass -File tools\test.ps1 }
Write-Host "`nAll checks passed." -ForegroundColor Green
