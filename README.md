# Yorumi CLI

Tiny terminal anime watcher using Yorumi's AnimePahe scraper logic and `mpv` for playback.

## Usage

## Installation

### Windows

PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/davenarchives/yorumi-cli/main/install.ps1 | iex
```

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

Package-manager installs require published winget/scoop/choco manifests. Until those are submitted, use the PowerShell installer or local `npm link`.

```powershell
cd yorumi-cli
npm link
yorumi-cli
```

The scripts use the backend's existing `tsx` install, so run `npm install --prefix ../backend` first if backend dependencies are not installed yet. Install `mpv` for the media player popup behavior, then reopen your terminal so PATH refreshes. Keep Yorumi's backend running so the CLI can use its stream proxy.

```powershell
winget install mpv
npm run dev --prefix backend
```

In a second terminal:

```powershell
cd "C:\Github Repos\Yorumi\yorumi-cli"
npm link
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
yorumi-cli "frieren" --episode 1 --api-base http://localhost:3001/api
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

For a real public install flow like:

```powershell
npm install -g yorumi-cli
```

the CLI needs to stop importing `../backend` directly. Either move the shared AnimePahe scraper into this package or make the CLI call a deployed Yorumi API with `--api-base`.

## Interactive Menu

If `fzf` or `rofi` is installed, Yorumi CLI uses it for anime and episode selection. If neither is installed, it falls back to the built-in numbered menu.

```powershell
yorumi-cli
```

Flow:

1. Search anime.
2. Select anime.
3. Choose episode.
4. mpv opens the player window.
