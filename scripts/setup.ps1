# Sets up a fresh Windows machine (test PCs included) to build and test SAGE, then runs the quick check.
# Every download goes through mirrors in China (CLAUDE.md rule 7). Safe to run again: finished steps are skipped.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1              set up, then verify.ps1 -Quick
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -SkipVerify  set up only
#
# Needs beforehand: Git and Node.js 20 or newer (https://npmmirror.com/mirrors/node/, the .msi of an LTS release).
# Installs: uv (from the Aliyun PyPI mirror), pnpm (from npmmirror), Python 3.11 (by uv, from npmmirror),
# the platform's and the plugins' dependencies, and repairs Electron's incomplete unpacking (docs/status.md).
[CmdletBinding()]
param([switch]$SkipVerify)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is many times slower with the progress bar on
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Versions match the development machine; change them together with app/package.json's packageManager.
$UvVersion = "0.11.17"
$UvWheel = "https://mirrors.aliyun.com/pypi/packages/79/99/8af4a92b99a8a4823297c26df727fe957267e03e1196e3caa803c3f6ccb2/uv-0.11.17-py3-none-win_amd64.whl"
$UvWheelSha256 = "44ec1fe3af839f87370dcf0400c0cab917cc1ce697d563e860fc7d9ed72655e7"
$PnpmVersion = "10.15.0"
$NpmRegistry = "https://registry.npmmirror.com/"
$ElectronMirror = "https://npmmirror.com/mirrors/electron/"
# Windows' own tar (bsdtar) unpacks zip files; Git's tar, often first on PATH, does not.
$Tar = Join-Path $env:SystemRoot "System32\tar.exe"

function Step([string]$Name) { Write-Host "`n=== $Name ===" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "  $Text" -ForegroundColor Green }
function Run([string]$What, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}
function Has([string]$Command) { [bool](Get-Command $Command -ErrorAction SilentlyContinue) }
function Add-UserPath([string]$Directory) {
    if (($env:Path -split ";") -notcontains $Directory) { $env:Path = "$Directory;$env:Path" }
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $userPath) { $userPath = "" }
    if (($userPath -split ";") -notcontains $Directory) {
        [Environment]::SetEnvironmentVariable("Path", ($Directory + ";" + $userPath).TrimEnd(";"), "User")
        Ok "added $Directory to your PATH (new terminals pick it up)"
    }
}

Step "Git and Node.js"
if (-not (Has "git")) { throw "Git is not installed. Install it first, then run this script again." }
if (-not (Has "node")) {
    throw "Node.js is not installed. Install an LTS .msi (20 or newer) from https://npmmirror.com/mirrors/node/ and run this script again."
}
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { throw "Node.js $(node -v) is too old; install 20 or newer from https://npmmirror.com/mirrors/node/." }
Ok "git $((git --version) -replace 'git version ', ''), node $(node -v)"

Step "uv $UvVersion"
$uvOk = (Has "uv") -and ((uv --version) -match [regex]::Escape($UvVersion))
if ($uvOk) {
    Ok "already installed"
} else {
    # uv's own installer downloads from GitHub; its PyPI wheel holds the same uv.exe and the Aliyun mirror serves it.
    $uvDir = Join-Path $env:USERPROFILE ".local\bin"
    $temp = Join-Path $env:TEMP "sage-setup-uv"
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
    New-Item -ItemType Directory -Path $temp | Out-Null
    $wheel = Join-Path $temp "uv.zip"
    Invoke-WebRequest -Uri $UvWheel -OutFile $wheel -UseBasicParsing
    if ((Get-FileHash $wheel -Algorithm SHA256).Hash -ne $UvWheelSha256.ToUpper()) { throw "uv download is corrupt (checksum mismatch)" }
    Run "unpacking uv" { & $Tar -xf $wheel -C $temp }
    New-Item -ItemType Directory -Path $uvDir -Force | Out-Null
    foreach ($exe in "uv.exe", "uvx.exe") {
        $found = Get-ChildItem $temp -Recurse -Filter $exe | Select-Object -First 1
        if ($found) { Copy-Item $found.FullName (Join-Path $uvDir $exe) -Force }
    }
    Remove-Item $temp -Recurse -Force
    Add-UserPath $uvDir
    Ok "installed: $(& (Join-Path $uvDir 'uv.exe') --version)"
}

Step "pnpm $PnpmVersion"
# Not corepack: it downloads pnpm from registry.npmjs.org, which is slow or unreachable here.
# Ask for the version inside app/: a corepack shim already on PATH answers with app/package.json's packageManager there.
function PnpmVersionInApp {
    if (-not (Has "pnpm")) { return "" }
    Push-Location (Join-Path $repo "app")
    try { return (pnpm -v) } finally { Pop-Location }
}
if ((PnpmVersionInApp) -eq $PnpmVersion) {
    Ok "already installed"
} else {
    Run "npm install -g pnpm" { npm install -g "pnpm@$PnpmVersion" --registry=$NpmRegistry }
    Add-UserPath ((npm prefix -g).Trim())
    $installed = PnpmVersionInApp
    if ($installed -ne $PnpmVersion) { throw "pnpm $PnpmVersion was installed, but 'pnpm' on PATH answers $installed. Remove the other pnpm from PATH and run again." }
    Ok "installed: pnpm $installed"
}

Step "Python 3.11 and the backend's dependencies (app/python)"
# uv reads the Python download mirror and the Aliyun index from pyproject.toml.
Push-Location (Join-Path $repo "app")
try { Run "uv sync (app/python)" { uv sync --project python --frozen } } finally { Pop-Location }

Step "plugin and SDK dependencies (plugin/)"
Push-Location (Join-Path $repo "plugin")
try { Run "uv sync (plugin)" { uv sync --frozen } } finally { Pop-Location }

Step "frontend dependencies (app/, pnpm install)"
# confirmModulesPurge=false: pnpm would otherwise stop and ask before rebuilding node_modules.
Push-Location (Join-Path $repo "app")
try { Run "pnpm install" { pnpm install --frozen-lockfile --config.confirmModulesPurge=false } } finally { Pop-Location }

Step "Electron"
# On Node 24 Electron's own install script unpacks only the first file of its zip and reports no error;
# the app then fails with "Electron failed to install correctly". Unpack the zip again with Windows' tar.
$electronPkg = Get-ChildItem (Join-Path $repo "app\node_modules\.pnpm") -Directory -Filter "electron@*" |
    ForEach-Object { Join-Path $_.FullName "node_modules\electron" } |
    Where-Object { Test-Path (Join-Path $_ "package.json") } | Select-Object -First 1
if (-not $electronPkg) { throw "Electron is missing from app\node_modules; pnpm install did not finish." }
$electronVersion = (Get-Content (Join-Path $electronPkg "package.json") -Raw | ConvertFrom-Json).version
$dist = Join-Path $electronPkg "dist"
if ((Test-Path (Join-Path $dist "electron.exe")) -and (Test-Path (Join-Path $dist "resources")) -and (Test-Path (Join-Path $electronPkg "path.txt"))) {
    Ok "Electron $electronVersion is complete"
} else {
    $zipName = "electron-v$electronVersion-win32-x64.zip"
    $cache = Join-Path $env:LOCALAPPDATA "electron\Cache"
    $zip = $null
    if (Test-Path $cache) { $zip = Get-ChildItem $cache -Recurse -Filter $zipName | Select-Object -First 1 -ExpandProperty FullName }
    if (-not $zip) {
        $zip = Join-Path $env:TEMP $zipName
        Write-Host "  downloading $zipName from npmmirror"
        Invoke-WebRequest -Uri "$ElectronMirror$electronVersion/$zipName" -OutFile $zip -UseBasicParsing
    }
    if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
    New-Item -ItemType Directory -Path $dist | Out-Null
    Run "unpacking Electron" { & $Tar -xf $zip -C $dist }
    if (-not (Test-Path (Join-Path $dist "electron.exe"))) { throw "Electron unpacked, but electron.exe is missing from $dist" }
    # Electron's launcher reads the executable's name from path.txt (no trailing newline).
    [IO.File]::WriteAllText((Join-Path $electronPkg "path.txt"), "electron.exe")
    Ok "Electron $electronVersion unpacked"
}

if ($SkipVerify) {
    Write-Host "`nSetup finished (verification skipped)." -ForegroundColor Green
    exit 0
}
Step "quick check (scripts\verify.ps1 -Quick)"
Run "verify.ps1 -Quick" { powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\verify.ps1") -Quick }
Write-Host "`nSetup finished; quick check passed." -ForegroundColor Green
