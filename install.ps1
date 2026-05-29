param(
    [string]$Repo = "davenarchives/yorumi-cli"
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "YorumiCLI"
$repoDir = Join-Path $installRoot "repo"

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Require-Command($name, $installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name was not found. $installHint"
    }
}

Write-Step "Checking requirements"
Require-Command "git" "Install Git from https://git-scm.com/download/win"
Require-Command "node" "Install Node.js from https://nodejs.org/"
Require-Command "npm" "Install Node.js from https://nodejs.org/"

if (-not (Get-Command "mpv" -ErrorAction SilentlyContinue)) {
    Write-Host "mpv was not found on PATH." -ForegroundColor Yellow
    Write-Host "Install it with: winget install --id shinchiro.mpv -e" -ForegroundColor Yellow
}

Write-Step "Installing Yorumi CLI to $installRoot"
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

if (Test-Path $repoDir) {
    Push-Location $repoDir
    git pull --ff-only
    Pop-Location
} else {
    git clone "https://github.com/$Repo.git" $repoDir
}

if (-not (Test-Path $repoDir)) {
    throw "Unable to clone https://github.com/$Repo.git"
}

Write-Step "Installing npm dependencies"
Push-Location $repoDir
npm install
npm link
Pop-Location

Write-Step "Done"
Write-Host "Run: yorumi-cli --help" -ForegroundColor Green
Write-Host "If mpv was just installed, reopen your terminal before running yorumi-cli." -ForegroundColor Yellow
