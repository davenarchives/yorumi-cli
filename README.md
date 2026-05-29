# Yorumi CLI

Tiny terminal anime watcher using Yorumi's AnimePahe scraper logic and `mpv` for playback.

## Usage

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
