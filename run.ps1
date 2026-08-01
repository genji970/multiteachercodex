$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [Console]::OutputEncoding
    chcp 65001 > $null
} catch {
    # Continue even when the host does not support changing the code page.
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDataRoot = Join-Path $env:LOCALAPPDATA "MultiTeacherCodex"
$PortableNodeRoot = Join-Path $AppDataRoot "node"
$BrowserProfileDir = Join-Path $AppDataRoot "browser-profile"
$HealthUrl = "http://127.0.0.1:8787/health"

function Write-Step([string]$Message) {
    Write-Host "[MultiTeacherCodex] $Message" -ForegroundColor Cyan
}

function Get-NodeMajorVersion {
    try {
        $version = (& node --version 2>$null).Trim().TrimStart("v")
        if (-not $version) { return 0 }
        return [int]($version.Split(".")[0])
    }
    catch {
        return 0
    }
}

function Install-PortableNode {
    Write-Step "Installing portable Node.js 22 in your user profile (no admin rights required)."

    New-Item -ItemType Directory -Force -Path $AppDataRoot | Out-Null
    if (Test-Path $PortableNodeRoot) {
        Remove-Item -Recurse -Force $PortableNodeRoot
    }
    New-Item -ItemType Directory -Force -Path $PortableNodeRoot | Out-Null

    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt").Content
    $match = [regex]::Match($checksums, "node-v\d+\.\d+\.\d+-win-x64\.zip")
    if (-not $match.Success) {
        throw "Could not locate the latest Node.js 22 Windows package."
    }

    $zipName = $match.Value
    $zipPath = Join-Path $env:TEMP $zipName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/$zipName" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $PortableNodeRoot -Force
    Remove-Item -Force $zipPath

    $nodeExe = Get-ChildItem -Path $PortableNodeRoot -Filter "node.exe" -Recurse |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $nodeExe) {
        throw "The installed Node.js executable was not found."
    }

    return Split-Path -Parent $nodeExe
}

function Resolve-NodeHome {
    if ((Get-NodeMajorVersion) -ge 20) {
        return Split-Path -Parent (Get-Command node -ErrorAction Stop).Source
    }
    return Install-PortableNode
}

function Test-MultiTeacherServer {
    try {
        $response = Invoke-RestMethod -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
        return $response.status -eq "ok"
    }
    catch {
        return $false
    }
}

Set-Location $ProjectRoot

if (-not (Test-Path ".\package.json")) {
    throw "package.json is missing. Run run.cmd from the repository root."
}
if (-not (Test-Path ".\extension\manifest.json")) {
    throw "extension\manifest.json is missing. Update the repository and try again."
}
if (-not (Test-Path ".\dist\cli.js")) {
    throw "dist\cli.js is missing. Update the repository and try again."
}

$NodeHome = Resolve-NodeHome
$env:Path = "$NodeHome;$env:Path"
$NodeExe = Join-Path $NodeHome "node.exe"
$NpmCmd = Join-Path $NodeHome "npm.cmd"

if (-not (Test-Path $NodeExe)) {
    $NodeExe = (Get-Command node -ErrorAction Stop).Source
}
if (-not (Test-Path $NpmCmd)) {
    $NpmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
}

$existingNodeOptions = [string]$env:NODE_OPTIONS
if ($existingNodeOptions -notmatch "--dns-result-order") {
    $env:NODE_OPTIONS = ($existingNodeOptions + " --dns-result-order=ipv4first").Trim()
}

Write-Step "Node $(& $NodeExe --version), npm $(& $NpmCmd --version)"

$runtimeDependencies = @(
    "node_modules\@modelcontextprotocol\sdk\package.json",
    "node_modules\dotenv\package.json",
    "node_modules\zod\package.json"
)
$dependenciesReady = $true
foreach ($dependency in $runtimeDependencies) {
    if (-not (Test-Path (Join-Path $ProjectRoot $dependency))) {
        $dependenciesReady = $false
        break
    }
}

if (-not $dependenciesReady) {
    Write-Step "Installing required npm packages."
    & $NpmCmd install --omit=dev --no-audit --no-fund --package-lock=false
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed. Check your network and npm configuration."
    }
}

$env:MTC_AUTO_OPEN_BROWSER = "1"
$env:MTC_BROWSER_PROFILE_DIR = $BrowserProfileDir

if (Test-MultiTeacherServer) {
    Write-Step "Reusing the running review server and opening ChatGPT."
    & $NodeExe ".\dist\open-browser.js"
    exit $LASTEXITCODE
}

Write-Step "Starting the review server."
Write-Step "This terminal will print the question, draft, external review, revision instruction, and final answer."
Write-Step "Keep this PowerShell window open while using ChatGPT."
Write-Host ""

& $NodeExe ".\dist\cli.js" @args
exit $LASTEXITCODE
