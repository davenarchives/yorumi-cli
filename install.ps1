param(
    [string]$Repo = "davenarchives/yorumi-cli"
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "YorumiCLI"
$repoDir = Join-Path $installRoot "repo"

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

$script:totalSteps = 4
$script:currentStep = 0
$script:currentFilled = 0
$script:barWidth = 40

function Draw-Progress($filled, $label) {
    $pct = [math]::Floor(($filled / $script:barWidth) * 100)
    $empty = $script:barWidth - $filled
    $bar = ("$([char]0x2588)" * $filled) + ("$([char]0x2591)" * $empty)

    Write-Host "`r  [$bar] " -NoNewline
    Write-Host ("{0,3}%" -f $pct) -ForegroundColor Green -NoNewline
    Write-Host " | $label    " -NoNewline
}

function Complete-ProgressStep($label) {
    $script:currentStep++
    $target = [math]::Floor($script:barWidth * $script:currentStep / $script:totalSteps)
    while ($script:currentFilled -lt $target) {
        $script:currentFilled++
        Draw-Progress $script:currentFilled $label
        Start-Sleep -Milliseconds 18
    }
    Write-Host ""
}

function Invoke-ProgressCommand($label, $file, [string[]]$arguments, $workingDirectory) {
    Draw-Progress $script:currentFilled $label
    $target = [math]::Floor($script:barWidth * ($script:currentStep + 1) / $script:totalSteps)

    try {
        $job = Start-Job -ScriptBlock {
            param($command, $commandArgs, $cwd)
            $ErrorActionPreference = "Stop"
            Set-Location $cwd
            & $command @commandArgs
            if ($LASTEXITCODE -ne 0) {
                throw "$command exited with code $LASTEXITCODE"
            }
        } -ArgumentList $file, $arguments, $workingDirectory

        while ($job.State -eq "Running") {
            if ($script:currentFilled -lt ($target - 1)) {
                $script:currentFilled++
            }
            Draw-Progress $script:currentFilled $label
            Start-Sleep -Milliseconds 90
        }

        $details = Receive-Job $job 2>&1 | Out-String
        if ($job.State -ne "Completed") {
            Write-Host ""
            Write-Err "$label failed."
            if ($details) { Write-Host $details.Trim() }
            throw "$label failed"
        }
    } finally {
        if ($job) { Remove-Job $job -Force -ErrorAction SilentlyContinue }
    }

    Complete-ProgressStep $label
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
Complete-ProgressStep "Checking requirements"
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
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

if (Test-Path $repoDir) {
    Write-Info "CLI repo already exists, pulling latest changes"
    Invoke-ProgressCommand "Updating CLI repository" "git" @("pull", "--ff-only") $repoDir
    Write-Success "CLI repo updated"
} else {
    Write-Info "Cloning CLI repo from github.com/$Repo"
    Invoke-ProgressCommand "Cloning CLI repository" "git" @("clone", "https://github.com/$Repo.git", $repoDir) $installRoot
    Write-Success "CLI repo cloned"
}

if (-not (Test-Path $repoDir)) {
    Write-Err "Unable to clone https://github.com/$Repo.git"
    throw "Clone failed"
}

# ── Install CLI npm deps ──────────────────────────────────────────

Write-Header "Installing dependencies"
Write-Info "Running npm install in CLI..."
Invoke-ProgressCommand "Installing CLI npm packages" "npm.cmd" @("install", "--loglevel=error") $repoDir
Push-Location $repoDir
npm link 2>&1 | Out-Null
Pop-Location
Write-Success "CLI dependencies installed"
Write-Success "CLI globally linked"

# ── Done ──────────────────────────────────────────────────────────

Complete-ProgressStep "Complete"
Write-Host ""
Write-Success "Yorumi CLI installed successfully!"
Write-Host ""
Write-Info "Run: yorumi-cli --help"
if (-not (Get-Command "mpv" -ErrorAction SilentlyContinue)) {
    Write-Warn "If mpv was just installed, reopen your terminal before running yorumi-cli."
}
Write-Host ""
