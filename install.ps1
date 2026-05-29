param(
    [string]$Repo = "davenarchives/yorumi-cli"
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "YorumiCLI"
$repoDir = Join-Path $installRoot "repo"

# ── Pretty output helpers ──────────────────────────────────────────

function Write-Label($label, $color, $message) {
    Clear-ProgressLine
    Write-Host "  $label  " -ForegroundColor Black -BackgroundColor $color -NoNewline
    Write-Host "  $message"
    Redraw-ProgressLine
}

function Write-Success($message) { Write-Label "success" "Green"   $message }
function Write-Info($message)    { Write-Label "info"    "Cyan"    $message }
function Write-Warn($message)    { Write-Label "warning" "Yellow"  $message }
function Write-Err($message)     { Write-Label "error"   "Red"     $message }
function Write-Note($message)    { Write-Label "note"    "DarkGray" $message }

function Write-Header($message) {
    Clear-ProgressLine
    Write-Host ""
    Write-Host $message -ForegroundColor White
    Redraw-ProgressLine
}

# ── Progress bar ───────────────────────────────────────────────────

$script:totalSteps = 4
$script:currentStep = 0
$script:currentUnits = 0
$script:progressUnits = 100
$script:escape = [char]27
$script:progressActive = $false
$script:progressLabel = ""

function Clear-ProgressLine {
    if ($script:progressActive) {
        [Console]::Write("`r$($script:escape)[2K")
    }
}

function Redraw-ProgressLine {
    if ($script:progressActive) {
        Draw-Progress $script:currentUnits $script:progressLabel
    }
}

function Draw-Progress($units, $label) {
    $script:progressActive = $true
    $script:progressLabel = $label
    $pct = [math]::Floor(($units / $script:progressUnits) * 100)
    $columns = 100
    try {
        if ([Console]::WindowWidth -gt 0) { $columns = [Console]::WindowWidth }
    } catch {}

    $labelText = " | $label"
    $barWidth = [Math]::Min(34, [Math]::Max(12, $columns - $labelText.Length - 14))
    $filled = [math]::Floor($barWidth * $units / $script:progressUnits)
    $empty = $barWidth - $filled
    $bar = ("$([char]0x2588)" * $filled) + ("-" * $empty)
    $line = "  [$bar] $($script:escape)[32m$('{0,3}%' -f $pct)$($script:escape)[0m$labelText"

    [Console]::Write("`r$($script:escape)[2K$line")
}

function Complete-ProgressStep($label) {
    $script:currentStep++
    $target = [math]::Floor($script:progressUnits * $script:currentStep / $script:totalSteps)
    while ($script:currentUnits -lt $target) {
        $script:currentUnits++
        Draw-Progress $script:currentUnits $label
        Start-Sleep -Milliseconds 18
    }
    Draw-Progress $script:currentUnits $label
}

function Invoke-ProgressCommand($label, $file, [string[]]$arguments, $workingDirectory) {
    Draw-Progress $script:currentUnits $label
    $target = [math]::Floor($script:progressUnits * ($script:currentStep + 1) / $script:totalSteps)

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
            if ($script:currentUnits -lt ($target - 1)) {
                $script:currentUnits++
            }
            Draw-Progress $script:currentUnits $label
            Start-Sleep -Milliseconds 90
        }

        $details = Receive-Job $job 2>&1 | Out-String
        if ($job.State -ne "Completed") {
            Clear-ProgressLine
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
Clear-ProgressLine
$script:progressActive = $false
Write-Host ""
Write-Success "Yorumi CLI installed successfully!"
Write-Host ""
Write-Info "Run: yorumi-cli --help"
if (-not (Get-Command "mpv" -ErrorAction SilentlyContinue)) {
    Write-Warn "If mpv was just installed, reopen your terminal before running yorumi-cli."
}
Write-Host ""
