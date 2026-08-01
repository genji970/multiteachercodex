$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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
    Write-Step "Node.js 22를 사용자 폴더에 자동 설치합니다. 관리자 권한은 필요하지 않습니다."

    New-Item -ItemType Directory -Force -Path $AppDataRoot | Out-Null
    if (Test-Path $PortableNodeRoot) {
        Remove-Item -Recurse -Force $PortableNodeRoot
    }
    New-Item -ItemType Directory -Force -Path $PortableNodeRoot | Out-Null

    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt").Content
    $match = [regex]::Match($checksums, "node-v\d+\.\d+\.\d+-win-x64\.zip")
    if (-not $match.Success) {
        throw "최신 Node.js 22 Windows 패키지를 찾지 못했습니다."
    }

    $zipName = $match.Value
    $zipPath = Join-Path $env:TEMP $zipName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/$zipName" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $PortableNodeRoot -Force
    Remove-Item -Force $zipPath

    $nodeExe = Get-ChildItem -Path $PortableNodeRoot -Filter "node.exe" -Recurse |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $nodeExe) {
        throw "설치된 Node.js 실행 파일을 찾지 못했습니다."
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
    throw "package.json이 없습니다. 저장소 루트에서 run.cmd를 실행하세요."
}
if (-not (Test-Path ".\extension\manifest.json")) {
    throw "extension\manifest.json이 없습니다. git pull 후 다시 실행하세요."
}
if (-not (Test-Path ".\dist\cli.js")) {
    throw "dist\cli.js가 없습니다. 최신 저장소를 다시 받아주세요."
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
    Write-Step "필요한 npm 패키지를 자동 설치합니다."
    & $NpmCmd install --omit=dev --no-audit --no-fund --package-lock=false
    if ($LASTEXITCODE -ne 0) {
        throw "npm install에 실패했습니다. 네트워크와 npm 설정을 확인하세요."
    }
}

$env:MTC_AUTO_OPEN_BROWSER = "1"
$env:MTC_BROWSER_PROFILE_DIR = $BrowserProfileDir

if (Test-MultiTeacherServer) {
    Write-Step "이미 실행 중인 리뷰 서버를 재사용하고 ChatGPT Edge 창을 엽니다."
    & $NodeExe ".\dist\open-browser.js"
    exit $LASTEXITCODE
}

Write-Step "서버를 시작합니다. 이 창에 질문, 초안, 외부 검토, 전달 지침, 최종 답변이 모두 출력됩니다."
Write-Step "이 PowerShell 창은 ChatGPT를 사용하는 동안 닫지 마세요."
Write-Host ""

& $NodeExe ".\dist\cli.js" @args
exit $LASTEXITCODE
