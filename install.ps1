param(
    [string]$Repo = "davenarchives/yorumi-cli",
    [string]$YorumiRepo = "davenarchives/Yorumi"
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "YorumiCLI"
$repoDir = Join-Path $installRoot "repo"
$yorumiDir = Join-Path $installRoot "yorumi"
$backendLink = Join-Path $installRoot "backend"

# ── Pretty output helpers ──────────────────────────────────────────

function Write-Label($label, $color, $message) {
    Write-Host "  $label  " -ForegroundColor Black -BackgroundColor $color -NoNewline
    Write-Host "  $message"
}

function Write-Success($message) { Write-Label "success" "Green"   $message }
function Write-Info($message)    { Write-Label "info"    "Cyan"    $message }
function Write-Warn($message)    { Write-Label "warning" "Yellow"  $message }
function Write-Err($message)     { Write-Label "error"   "Red"     $message }
function Write-Note($message)    { Write-Label "note"    "DarkGray" $message }

function Write-Header($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor White
}

# ── Progress bar ───────────────────────────────────────────────────

$script:totalSteps = 7
$script:currentStep = 0

function Step-Progress($label) {
    $script:currentStep++
    $pct = [math]::Floor(($script:currentStep / $script:totalSteps) * 100)
    $barWidth = 40
    $filled = [math]::Floor($barWidth * $script:currentStep / $script:totalSteps)
    $empty = $barWidth - $filled
    $bar = ("$([char]0x2588)" * $filled) + ("$([char]0x2591)" * $empty)

    Write-Host "`r  [$bar] " -NoNewline
    Write-Host "$pct%" -ForegroundColor Green -NoNewline
    Write-Host " | $label    " -NoNewline
    Write-Host ""
}

# ── Requirement check ──────────────────────────────────────────────

function Require-Command($name, $installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Err "$name was not found. $installHint"
        throw "$name is required."
    }
    Write-Success "$name found"
}

# ── Start ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  yorumi-cli installer" -ForegroundColor Magenta
Write-Host ""

Write-Header "Checking requirements"
Step-Progress "Checking requirements"
Require-Command "git" "Install Git from https://git-scm.com/download/win"
Require-Command "node" "Install Node.js from https://nodejs.org/"
Require-Command "npm" "Install Node.js from https://nodejs.org/"

if (Get-Command "mpv" -ErrorAction SilentlyContinue) {
    Write-Success "mpv found"
} else {
    Write-Warn "mpv was not found on PATH"
    Write-Note "Install it with: winget install --id shinchiro.mpv -e"
}

if (Get-Command "fzf" -ErrorAction SilentlyContinue) {
    Write-Success "fzf found"
} else {
    Write-Note "fzf not found (optional). Install for fuzzy menus: winget install junegunn.fzf"
}

# ── Clone / pull CLI repo ──────────────────────────────────────────

Write-Header "Installing Yorumi CLI"
Step-Progress "Cloning CLI repository"
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

if (Test-Path $repoDir) {
    Write-Info "CLI repo already exists, pulling latest changes"
    Push-Location $repoDir
    git pull --ff-only 2>&1 | Out-Null
    Pop-Location
    Write-Success "CLI repo updated"
} else {
    Write-Info "Cloning CLI repo from github.com/$Repo"
    git clone "https://github.com/$Repo.git" $repoDir 2>&1 | Out-Null
    Write-Success "CLI repo cloned"
}

if (-not (Test-Path $repoDir)) {
    Write-Err "Unable to clone https://github.com/$Repo.git"
    throw "Clone failed"
}

# ── Clone / pull Yorumi backend ────────────────────────────────────

Write-Header "Installing Yorumi backend support"
Step-Progress "Cloning backend repository"

if (Test-Path $yorumiDir) {
    Write-Info "Yorumi repo already exists, pulling latest changes"
    Push-Location $yorumiDir
    git pull --ff-only 2>&1 | Out-Null
    Pop-Location
    Write-Success "Yorumi repo updated"
} else {
    Write-Info "Cloning Yorumi repo from github.com/$YorumiRepo"
    git clone "https://github.com/$YorumiRepo.git" $yorumiDir 2>&1 | Out-Null
    Write-Success "Yorumi repo cloned"
}

$backendSource = Join-Path $yorumiDir "backend"
if (-not (Test-Path $backendSource)) {
    Write-Err "Unable to find backend folder at $backendSource"
    throw "Backend not found"
}

# ── Create junction ────────────────────────────────────────────────

Step-Progress "Linking backend"

if (Test-Path $backendLink) {
    $item = Get-Item $backendLink -Force
    if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") {
        Remove-Item $backendLink -Force
        Write-Info "Removed old backend junction"
    } elseif ($item.FullName -ne $backendSource) {
        Write-Err "$backendLink already exists and is not a junction. Remove it and rerun the installer."
        throw "Junction conflict"
    }
}

if (-not (Test-Path $backendLink)) {
    New-Item -ItemType Junction -Path $backendLink -Target $backendSource | Out-Null
}
Write-Success "Backend linked"

# ── Install backend npm deps ──────────────────────────────────────

Write-Header "Installing dependencies"
Step-Progress "Installing backend npm packages"
Write-Info "Running npm install in backend..."
Push-Location $backendLink
npm install --loglevel=error 2>&1 | Out-Null
Pop-Location
Write-Success "Backend dependencies installed"

# ── Install CLI npm deps ──────────────────────────────────────────

Step-Progress "Installing CLI npm packages"
Write-Info "Running npm install in CLI..."
Push-Location $repoDir
npm install --loglevel=error 2>&1 | Out-Null
npm link 2>&1 | Out-Null
Pop-Location
Write-Success "CLI dependencies installed"
Write-Success "CLI globally linked"

# ── Done ──────────────────────────────────────────────────────────

Step-Progress "Complete"
Write-Host ""
Write-Success "Yorumi CLI installed successfully!"
Write-Host ""
Write-Info "Run: yorumi-cli --help"
if (-not (Get-Command "mpv" -ErrorAction SilentlyContinue)) {
    Write-Warn "If mpv was just installed, reopen your terminal before running yorumi-cli."
}
Write-Host ""
