#!/usr/bin/env bash
set -e

REPO="davenarchives/yorumi-cli"

# Determine install root
if [ -n "$XDG_DATA_HOME" ]; then
    INSTALL_ROOT="$XDG_DATA_HOME/YorumiCLI"
else
    INSTALL_ROOT="$HOME/.local/share/YorumiCLI"
fi

REPO_DIR="$INSTALL_ROOT/repo"

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

TOTAL_STEPS=4
CURRENT_STEP=0
CURRENT_FILLED=0
BAR_WIDTH=40

draw_progress() {
    local filled="$1"
    local label="$2"
    local pct=$((filled * 100 / BAR_WIDTH))
    local empty=$((BAR_WIDTH - filled))
    local bar=""
    for ((i = 0; i < filled; i++)); do bar+="█"; done
    for ((i = 0; i < empty; i++));  do bar+="░"; done
    printf "\r\033[2K  [%s] ${GREEN}%3d%%${RST} | %s" "$bar" "$pct" "$label"
}

complete_progress_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local target=$((BAR_WIDTH * CURRENT_STEP / TOTAL_STEPS))
    while [ "$CURRENT_FILLED" -lt "$target" ]; do
        CURRENT_FILLED=$((CURRENT_FILLED + 1))
        draw_progress "$CURRENT_FILLED" "$1"
        sleep 0.018
    done
    printf "\n"
}

run_progress_in() {
    local label="$1"
    local cwd="$2"
    shift 2
    local target=$((BAR_WIDTH * (CURRENT_STEP + 1) / TOTAL_STEPS))
    local out_file
    local err_file
    out_file="$(mktemp)"
    err_file="$(mktemp)"

    draw_progress "$CURRENT_FILLED" "$label"
    (
        cd "$cwd"
        "$@"
    ) > "$out_file" 2> "$err_file" &
    local pid=$!

    while kill -0 "$pid" 2> /dev/null; do
        if [ "$CURRENT_FILLED" -lt $((target - 1)) ]; then
            CURRENT_FILLED=$((CURRENT_FILLED + 1))
        fi
        draw_progress "$CURRENT_FILLED" "$label"
        sleep 0.09
    done

    if ! wait "$pid"; then
        printf "\n"
        write_err "$label failed."
        if [ -s "$err_file" ]; then
            cat "$err_file"
        elif [ -s "$out_file" ]; then
            cat "$out_file"
        fi
        rm -f "$out_file" "$err_file"
        exit 1
    fi

    rm -f "$out_file" "$err_file"
    complete_progress_step "$label"
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
complete_progress_step "Checking requirements"
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
mkdir -p "$INSTALL_ROOT"

if [ -d "$REPO_DIR" ]; then
    write_info "CLI repo already exists, pulling latest changes"
    run_progress_in "Updating CLI repository" "$REPO_DIR" git pull --ff-only
    write_success "CLI repo updated"
else
    write_info "Cloning CLI repo from github.com/$REPO"
    run_progress_in "Cloning CLI repository" "$INSTALL_ROOT" git clone "https://github.com/$REPO.git" "$REPO_DIR"
    write_success "CLI repo cloned"
fi

# ── Install CLI npm deps ──────────────────────────────────────────

write_header "Installing dependencies"
write_info "Running npm install in CLI..."
run_progress_in "Installing CLI npm packages" "$REPO_DIR" npm install --loglevel=error
(cd "$REPO_DIR" && npm link > /dev/null 2>&1)
write_success "CLI dependencies installed"
write_success "CLI globally linked"

# ── Done ──────────────────────────────────────────────────────────

complete_progress_step "Complete"
echo ""
write_success "Yorumi CLI installed successfully!"
echo ""
write_info "Run: yorumi-cli --help"
if ! command -v mpv &> /dev/null; then
    write_warn "Install mpv before running yorumi-cli."
fi
echo ""
