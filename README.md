# Yorumi CLI

```text
▄▄ ▄▄  ▄▄▄  ▄▄▄▄  ▄▄ ▄▄ ▄▄   ▄▄ ▄▄      ▄▄▄▄ ▄▄    ▄▄
▀███▀ ██▀██ ██▄█▄ ██ ██ ██▀▄▀██ ██ ▄▄▄ ██▀▀▀ ██    ██
  █   ▀███▀ ██ ██ ▀███▀ ██   ██ ██     ▀████ ██▄▄▄ ██
```

Tiny terminal anime watcher using Yorumi's hosted API and `mpv` for playback.

## Installation

### Windows

PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/davenarchives/yorumi-cli/main/install.ps1 | iex
```

The installer downloads `yorumi-cli`, installs private Node.js/npm and `fzf` runtimes when needed, installs dependencies, and adds the `yorumi-cli` command to PATH. Git and global Node.js/npm are optional on Windows.

Winget:

```powershell
winget install Yorumi.YorumiCLI
```

Scoop:

```powershell
scoop install yorumi-cli
```

Chocolatey:

```powershell
choco install yorumi-cli
```

Package-manager installs require published winget/scoop/choco manifests. Until those are submitted, use the PowerShell installer.

On Windows, the PowerShell installer attempts to install `mpv` with Winget when it is missing. The CLI uses `https://yorumi-sigma.vercel.app/api` by default.

```powershell
yorumi-cli -e 1 "Frieren"
```

Examples:

```powershell
yorumi-cli
yorumi-cli "One Piece"
yorumi-cli -e 1 "Frieren"
yorumi-cli --episode 1 "Frieren"
yorumi-cli -r "1-5" "Naruto"
yorumi-cli --range "1-5" "Naruto"
yorumi-cli "one piece" --episode 1120
```

## Interactive Menu

Yorumi CLI uses `fzf` or `rofi` for anime and episode selection. The Windows installer includes portable `fzf`; without `fzf` or `rofi`, the CLI exits with an installer hint instead of showing a numbered terminal menu.

```powershell
yorumi-cli
```

Flow:

1. Search anime.
2. Select anime.
3. Choose episode.
4. mpv opens the player window.
