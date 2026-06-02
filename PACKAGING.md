# Packaging Yorumi CLI

This file tracks what must happen before the package-manager install commands work.

## PowerShell Installer

Works after this repository is public and `install.ps1` is available at:

```powershell
iwr -useb https://raw.githubusercontent.com/davenarchives/yorumi-cli/main/install.ps1 | iex
```

Update the username/repository in `install.ps1` if the final GitHub path is different.

The Windows installer should work without Git installed by falling back to the GitHub `main.zip` archive. It should also work without global Node.js/npm by installing a private Node.js runtime under `%LOCALAPPDATA%\YorumiCLI`.

It should install portable `fzf.exe` into `%LOCALAPPDATA%\YorumiCLI\bin` so non-dev users always get the interactive picker.

## Winget

Target command:

```powershell
winget install Yorumi.YorumiCLI
```

Required:

1. Create a GitHub release with a version tag.
2. Provide a stable silent installer artifact or true portable executable.
3. Submit a manifest to `microsoft/winget-pkgs`.
4. Use package identifier `Yorumi.YorumiCLI`.

Current status: blocked. The current PowerShell installer works for manual installs and Chocolatey, but Winget needs a silent EXE/MSI/MSIX or portable executable. See `packaging/winget/README.md`.

## Scoop

Target command:

```powershell
scoop install yorumi-cli
```

Required:

1. Create a Scoop manifest JSON.
2. Point it at a GitHub release zip.
3. Fill in the release zip SHA256.
4. Publish it in your own bucket or submit to a bucket.

Current manifest: `packaging/scoop/yorumi-cli.json`.
Bucket manifest: `bucket/yorumi-cli.json`.

Local manifest test:

```powershell
scoop install .\packaging\scoop\yorumi-cli.json
yorumi-cli --help
scoop uninstall yorumi-cli
```

Make the short command work:

1. Keep a copy of the manifest at `bucket/yorumi-cli.json`.
2. Push this repository to GitHub.
3. Users add this repository as a Scoop bucket once:

```powershell
scoop bucket add yorumi https://github.com/davenarchives/yorumi-cli
scoop install yorumi-cli
```

To make `scoop install yorumi-cli` work without adding a custom bucket, submit the manifest to a public bucket such as Scoop Extras and wait for it to be accepted.

## Chocolatey

Target command:

```powershell
choco install yorumi-cli
```

Required:

1. Create a Chocolatey package.
2. Include install/uninstall scripts.
3. Push it to Chocolatey Community Repository.

Current package scaffold: `packaging/chocolatey/`.

## npm

Target command:

```powershell
npm install -g yorumi-cli
```

Required:

1. Remove `"private": true` from `package.json`.
2. Keep the hosted Yorumi API online because the CLI is API-only.
3. Run `npm publish --access public`.
