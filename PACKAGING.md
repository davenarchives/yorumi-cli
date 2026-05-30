# Packaging Yorumi CLI

This file tracks what must happen before the package-manager install commands work.

## PowerShell Installer

Works after this repository is public and `install.ps1` is available at:

```powershell
iwr -useb https://raw.githubusercontent.com/davenarchives/yorumi-cli/main/install.ps1 | iex
```

Update the username/repository in `install.ps1` if the final GitHub path is different.

The Windows installer should work without Git installed by falling back to the GitHub `main.zip` archive. It should also work without global Node.js/npm by installing a private Node.js runtime under `%LOCALAPPDATA%\YorumiCLI`.

## Winget

Target command:

```powershell
winget install Yorumi.YorumiCLI
```

Required:

1. Create a GitHub release with a version tag.
2. Provide a stable installer artifact or zip.
3. Submit a manifest to `microsoft/winget-pkgs`.
4. Use package identifier `Yorumi.YorumiCLI`.

## Scoop

Target command:

```powershell
scoop install yorumi-cli
```

Required:

1. Create a Scoop manifest JSON.
2. Point it at a GitHub release zip.
3. Publish it in your own bucket or submit to a bucket.

## Chocolatey

Target command:

```powershell
choco install yorumi-cli
```

Required:

1. Create a Chocolatey package.
2. Include install/uninstall scripts.
3. Push it to Chocolatey Community Repository.

## npm

Target command:

```powershell
npm install -g yorumi-cli
```

Required:

1. Remove `"private": true` from `package.json`.
2. Keep the hosted Yorumi API online because the CLI is API-only.
3. Run `npm publish --access public`.
