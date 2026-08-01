$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtensionDir = Join-Path $ProjectRoot "extension"
$ServerUrl = "http://127.0.0.1:8787/health"
$AppDataRoot = Join-Path $env:LOCALAPPDATA "MultiTeacherCodex"
$PortableNodeRoot = Join-Path $AppDataRoot "node"
$EdgeProfileDir = Join-Path $AppDataRoot "edge-profile"

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
    Write-Step "Node.js 22를 사용자 폴더에 설치합니다. 관리자 권한은 필요하지 않습니다."

    New-Item -ItemType Directory -Force -Path $AppDataRoot | Out-Null
    if (Test-Path $PortableNodeRoot) {
        Remove-Item -Recurse -Force $PortableNodeRoot
    }
    New-Item -ItemType Directory -Force -Path $PortableNodeRoot | Out-Null

    $checksumUrl = "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt"
    $checksumText = (Invoke-WebRequest -UseBasicParsing -Uri $checksumUrl).Content
    $match = [regex]::Match($checksumText, "node-v(?<version>\d+\.\d+\.\d+)-win-x64\.zip")
    if (-not $match.Success) {
        throw "최신 Node.js 22 Windows 패키지 이름을 확인하지 못했습니다."
    }

    $zipName = $match.Value
    $zipPath = Join-Path $env:TEMP $zipName
    $downloadUrl = "https://nodejs.org/dist/latest-v22.x/$zipName"

    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $zipPath
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
    $major = Get-NodeMajorVersion
    if ($major -ge 20) {
        $nodeCommand = Get-Command node -ErrorAction Stop
        return Split-Path -Parent $nodeCommand.Source
    }

    return Install-PortableNode
}

function Test-MultiTeacherServer {
    try {
        $response = Invoke-RestMethod -UseBasicParsing -Uri $ServerUrl -TimeoutSec 2
        return $response.status -eq "ok"
    }
    catch {
        return $false
    }
}

function Resolve-EdgeExecutable {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    $command = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    throw "Microsoft Edge를 찾지 못했습니다. Edge를 설치한 뒤 다시 실행하세요."
}

Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ExtensionDir "manifest.json"))) {
    throw "extension\manifest.json이 없습니다. 최신 저장소를 다시 clone하거나 git pull을 실행하세요."
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
    Write-Step "서버 의존성을 설치합니다."
    & $NpmCmd install --omit=dev --no-audit --no-fund --package-lock=false
    if ($LASTEXITCODE -ne 0) {
        throw "npm install에 실패했습니다."
    }
}

if (-not (Test-MultiTeacherServer)) {
    Write-Step "리뷰 서버를 새 PowerShell 창에서 시작합니다. 첫 실행이면 그 창에서 API 제공자를 설정하세요."

    $escapedProjectRoot = $ProjectRoot.Replace("'", "''")
    $escapedNodeHome = $NodeHome.Replace("'", "''")
    $escapedNodeExe = $NodeExe.Replace("'", "''")
    $serverCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$escapedProjectRoot'
`$env:Path = '$escapedNodeHome;' + `$env:Path
& '$escapedNodeExe' '.\dist\cli.js'
"@
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($serverCommand))

    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", $encodedCommand
    ) | Out-Null

    while (-not (Test-MultiTeacherServer)) {
        Start-Sleep -Milliseconds 800
    }
}
else {
    Write-Step "기존 리뷰 서버를 재사용합니다."
}

$EdgeExe = Resolve-EdgeExecutable
New-Item -ItemType Directory -Force -Path $EdgeProfileDir | Out-Null

Write-Step "확장이 자동 로드된 Edge에서 ChatGPT를 엽니다. 질문은 한 번만 입력하면 됩니다."

$edgeArguments = @(
    "--user-data-dir=`"$EdgeProfileDir`"",
    "--disable-extensions-except=`"$ExtensionDir`"",
    "--load-extension=`"$ExtensionDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "https://chatgpt.com/"
)

Start-Process -FilePath $EdgeExe -ArgumentList $edgeArguments | Out-Null

Write-Host ""
Write-Host "완료: 새로 열린 Edge 창에서 ChatGPT에 로그인하고 평소처럼 질문하세요." -ForegroundColor Green
Write-Host "초안 → 외부 모델 검토 → ChatGPT 수정이 자동으로 진행되고 최종 답변만 표시됩니다." -ForegroundColor Green
