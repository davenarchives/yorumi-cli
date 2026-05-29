#!/usr/bin/env bash
set -e

REPO="davenarchives/yorumi-cli"
YORUMI_REPO="davenarchives/Yorumi"

# Determine install root
if [ -n "$XDG_DATA_HOME" ]; then
    INSTALL_ROOT="$XDG_DATA_HOME/YorumiCLI"
else
    INSTALL_ROOT="$HOME/.local/share/YorumiCLI"
fi

REPO_DIR="$INSTALL_ROOT/repo"
YORUMI_DIR="$INSTALL_ROOT/yorumi"
BACKEND_LINK="$INSTALL_ROOT/backend"

# ── Color helpers ──────────────────────────────────────────────────

RST='\033[0m'
BG_GREEN='\033[42;30m'
BG_CYAN='\033[46;30m'
BG_YELLOW='\033[43;30m'
BG_RED='\033[41;30m'
BG_GRAY='\033[100;30m'
GREEN='\033[0;32m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'

write_success() { printf "  ${BG_GREEN} success ${RST}  %s\n" "$1"; }
write_info()    { printf "  ${BG_CYAN} info ${RST}  %s\n" "$1"; }
write_warn()    { printf "  ${BG_YELLOW} warning ${RST}  %s\n" "$1"; }
write_err()     { printf "  ${BG_RED} error ${RST}  %s\n" "$1"; }
write_note()    { printf "  ${BG_GRAY} note ${RST}  %s\n" "$1"; }

write_header() {
    echo ""
    printf "  ${WHITE}%s${RST}\n" "$1"
}

# ── Progress bar ───────────────────────────────────────────────────

TOTAL_STEPS=7
CURRENT_STEP=0

step_progress() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local pct=$((CURRENT_STEP * 100 / TOTAL_STEPS))
    local bar_width=40
    local filled=$((bar_width * CURRENT_STEP / TOTAL_STEPS))
    local empty=$((bar_width - filled))
    local bar=""
    for ((i = 0; i < filled; i++)); do bar+="█"; done
    for ((i = 0; i < empty; i++));  do bar+="░"; done
    printf "  [%s] ${GREEN}%3d%%${RST} | %s\n" "$bar" "$pct" "$1"
}

# ── Requirement check ──────────────────────────────────────────────

require_command() {
    if ! command -v "$1" &> /dev/null; then
        write_err "$1 was not found. $2"
        exit 1
    fi
    write_success "$1 found"
}

# ── Start ──────────────────────────────────────────────────────────

echo ""
printf "  ${MAGENTA}yorumi-cli installer${RST}\n"
echo ""

write_header "Checking requirements"
step_progress "Checking requirements"
require_command "git" "Please install git."
require_command "node" "Please install Node.js from https://nodejs.org/"
require_command "npm" "Please install npm."

if command -v mpv &> /dev/null; then
    write_success "mpv found"
else
    write_warn "mpv was not found on PATH"
    write_note "Install it via your package manager (e.g. apt, brew, pacman)"
fi

if command -v fzf &> /dev/null; then
    write_success "fzf found"
else
    write_note "fzf not found (optional). Install for fuzzy menus."
fi

# ── Clone / pull CLI repo ──────────────────────────────────────────

write_header "Installing Yorumi CLI"
step_progress "Cloning CLI repository"
mkdir -p "$INSTALL_ROOT"

if [ -d "$REPO_DIR" ]; then
    write_info "CLI repo already exists, pulling latest changes"
    cd "$REPO_DIR"
    git pull --ff-only > /dev/null 2>&1
    cd - > /dev/null
    write_success "CLI repo updated"
else
    write_info "Cloning CLI repo from github.com/$REPO"
    git clone "https://github.com/$REPO.git" "$REPO_DIR" > /dev/null 2>&1
    write_success "CLI repo cloned"
fi

# ── Clone / pull Yorumi backend ────────────────────────────────────

write_header "Installing Yorumi backend support"
step_progress "Cloning backend repository"

if [ -d "$YORUMI_DIR" ]; then
    write_info "Yorumi repo already exists, pulling latest changes"
    cd "$YORUMI_DIR"
    git pull --ff-only > /dev/null 2>&1
    cd - > /dev/null
    write_success "Yorumi repo updated"
else
    write_info "Cloning Yorumi repo from github.com/$YORUMI_REPO"
    git clone "https://github.com/$YORUMI_REPO.git" "$YORUMI_DIR" > /dev/null 2>&1
    write_success "Yorumi repo cloned"
fi

BACKEND_SOURCE="$YORUMI_DIR/backend"
if [ ! -d "$BACKEND_SOURCE" ]; then
    write_err "Unable to find backend folder at $BACKEND_SOURCE"
    exit 1
fi

# ── Create symlink ─────────────────────────────────────────────────

step_progress "Linking backend"

if [ -e "$BACKEND_LINK" ] || [ -L "$BACKEND_LINK" ]; then
    if [ -L "$BACKEND_LINK" ]; then
        rm -f "$BACKEND_LINK"
        write_info "Removed old backend symlink"
    else
        write_err "$BACKEND_LINK already exists and is not a symlink. Remove it and rerun the installer."
        exit 1
    fi
fi

ln -s "$BACKEND_SOURCE" "$BACKEND_LINK"
write_success "Backend linked"

# ── Install backend npm deps ──────────────────────────────────────

write_header "Installing dependencies"
step_progress "Installing backend npm packages"
write_info "Running npm install in backend..."
cd "$BACKEND_LINK"
npm install --loglevel=error > /dev/null 2>&1
cd - > /dev/null
write_success "Backend dependencies installed"

# ── Install CLI npm deps ──────────────────────────────────────────

step_progress "Installing CLI npm packages"
write_info "Running npm install in CLI..."
cd "$REPO_DIR"
npm install --loglevel=error > /dev/null 2>&1
npm link > /dev/null 2>&1
cd - > /dev/null
write_success "CLI dependencies installed"
write_success "CLI globally linked"

# ── Done ──────────────────────────────────────────────────────────

step_progress "Complete"
echo ""
write_success "Yorumi CLI installed successfully!"
echo ""
write_info "Run: yorumi-cli --help"
if ! command -v mpv &> /dev/null; then
    write_warn "Install mpv before running yorumi-cli."
fi
echo ""
