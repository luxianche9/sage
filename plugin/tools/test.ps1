[CmdletBinding()]
param(
    # "all", "sdk" or a plugin folder name under plugin\ (e.g. comm_link).
    [string]$Target = "all"
)

# Local tests only: the SDK suite plus each plugin's tests (which include the
# dry-run compliance suite). Nothing here talks to real hardware.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)  # plugin\
$known = @(Get-ChildItem -LiteralPath $root -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "pyproject.toml") } |
    ForEach-Object { $_.Name })
if ($Target -notin @("all", "sdk") -and $Target -notin $known) {
    throw "Unknown target '$Target'. Use all, sdk or one of: $($known -join ', ')"
}
$paths = @(switch ($Target) {
    "all" { @("..\sdk") + $known }
    "sdk" { "..\sdk" }
    default { $Target }
})

Push-Location -LiteralPath $root
try {
    # -c: the paths span ..\sdk and plugin\, so name the config (asyncio mode) explicitly.
    & uv run pytest @paths -c pyproject.toml -q -p no:cacheprovider
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Target -ne "sdk") {
        $adapters = if ($Target -eq "all") { $known } else { @($Target) }
        foreach ($adapter in $adapters) {
            Write-Host "[check] teststand_adapter_$adapter"
            & uv run python -m teststand_device_sdk --adapter "teststand_adapter_$adapter" --check --log-level warning
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    }
}
finally {
    Pop-Location
}
