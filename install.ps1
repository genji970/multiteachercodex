$ErrorActionPreference = "Stop"
$Target = Join-Path $HOME "multiteachercodex"
$Repo = "https://github.com/genji970/multiteachercodex.git"

if (Test-Path (Join-Path $Target ".git")) {
    Write-Host "[MultiTeacherCodex] Updating $Target"
    git -C $Target pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
} elseif (Test-Path $Target) {
    throw "$Target already exists but is not a Git repository. Rename or remove it first."
} else {
    Write-Host "[MultiTeacherCodex] Cloning into $Target"
    git clone $Repo $Target
    if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
}

& (Join-Path $Target "run.cmd")
exit $LASTEXITCODE
