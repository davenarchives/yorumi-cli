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

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

write_step() {
    echo -e "${CYAN}==> $1${NC}"
}

require_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}$1 was not found. $2${NC}"
        exit 1
    fi
}

write_step "Checking requirements"
require_command "git" "Please install git."
require_command "node" "Please install Node.js from https://nodejs.org/"
require_command "npm" "Please install npm."

if ! command -v mpv &> /dev/null; then
    echo -e "${YELLOW}mpv was not found on PATH.${NC}"
    echo -e "${YELLOW}You will need it for video playback. Install it via your package manager (e.g. apt, brew, pacman).${NC}"
fi

write_step "Installing Yorumi CLI to $INSTALL_ROOT"
mkdir -p "$INSTALL_ROOT"

if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR"
    git pull --ff-only
    cd - > /dev/null
else
    git clone "https://github.com/$REPO.git" "$REPO_DIR"
fi

write_step "Installing Yorumi backend support"
if [ -d "$YORUMI_DIR" ]; then
    cd "$YORUMI_DIR"
    git pull --ff-only
    cd - > /dev/null
else
    git clone "https://github.com/$YORUMI_REPO.git" "$YORUMI_DIR"
fi

BACKEND_SOURCE="$YORUMI_DIR/backend"
if [ ! -d "$BACKEND_SOURCE" ]; then
    echo -e "${RED}Unable to find backend folder at $BACKEND_SOURCE${NC}"
    exit 1
fi

if [ -e "$BACKEND_LINK" ] || [ -L "$BACKEND_LINK" ]; then
    if [ -L "$BACKEND_LINK" ]; then
        rm -f "$BACKEND_LINK"
    else
        echo -e "${RED}$BACKEND_LINK already exists and is not a symlink. Remove it and rerun the installer.${NC}"
        exit 1
    fi
fi

ln -s "$BACKEND_SOURCE" "$BACKEND_LINK"

write_step "Installing backend npm dependencies"
cd "$BACKEND_LINK"
npm install
cd - > /dev/null

write_step "Installing CLI npm dependencies"
cd "$REPO_DIR"
npm install
npm link
cd - > /dev/null

write_step "Done"
echo -e "${GREEN}Run: yorumi-cli --help${NC}"
echo -e "${YELLOW}If your global npm bin directory is not in your PATH, you may need to add it or restart your terminal.${NC}"
