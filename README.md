# Yorumi CLI

```text
▄▄ ▄▄  ▄▄▄  ▄▄▄▄  ▄▄ ▄▄ ▄▄   ▄▄ ▄▄      ▄▄▄▄ ▄▄    ▄▄
▀███▀ ██▀██ ██▄█▄ ██ ██ ██▀▄▀██ ██ ▄▄▄ ██▀▀▀ ██    ██
  █   ▀███▀ ██ ██ ▀███▀ ██   ██ ██     ▀████ ██▄▄▄ ██
```

Tiny terminal anime watcher using Yorumi's hosted API and `mpv` for playback.

## Usage

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

Package-manager installs require published winget/scoop/choco manifests. Until those are submitted, use the PowerShell installer. For local development, use `npm link`.

```powershell
cd yorumi-cli
npm link
yorumi-cli
```

On Windows, the PowerShell installer attempts to install `mpv` with Winget when it is missing. The CLI uses `https://yorumi-sigma.vercel.app/api` by default.

```powershell
yorumi-cli -e 1 "Frieren"
```

The player opens as a normal 960x540 window by default. Resize it per run:

```powershell
yorumi-cli -e 1 "Frieren" --size 854x480
yorumi-cli -e 1 "Frieren" --size 1280x720
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
yorumi-cli "frieren" --episode 1 --api-base https://yorumi-sigma.vercel.app/api
yorumi-cli "frieren" --episode 1 --size 854x480
yorumi-cli "frieren" --anime-index 1 --episode 1 --print-url
```

Build:
Typecheck:

```powershell
npm run build
```

## Documentation Site

Preview the docs locally:

```powershell
npm run docs
```

Open:

```text
http://localhost:4173
```

Deploy with GitHub Pages:

1. Push this repository to GitHub.
2. Open repository Settings.
3. Go to Pages.
4. Source: Deploy from a branch.
5. Branch: `main`.
6. Folder: `/docs`.

The docs are static HTML/CSS/JS, so they also work on Netlify, Vercel, Cloudflare Pages, or any static host.

## Real Release Notes

For a public npm install flow like:

```powershell
npm install -g yorumi-cli
```

remove `"private": true` from `package.json`, publish the package, and keep the hosted Yorumi API online.

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
