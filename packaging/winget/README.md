# Winget Packaging

Yorumi CLI is not ready for a public `microsoft/winget-pkgs` submission from the current source zip alone.

Winget manifests require an installer that can be installed silently, or a true portable executable. The current Yorumi CLI install flow uses `install.ps1`, clones/downloads the repo, installs npm dependencies, and writes a command shim. That works for PowerShell, Scoop, and Chocolatey script packages, but it is not a valid standalone Winget installer artifact.

## Package identity

- Package identifier: `Yorumi.YorumiCLI`
- Package name: `Yorumi CLI`
- Publisher: `Daven Austhine Sumagang`
- License: `MIT`
- Homepage: `https://github.com/davenarchives/yorumi-cli`
- Release notes: `https://github.com/davenarchives/yorumi-cli/releases/tag/v0.1.1`

## Recommended next step

Create one of these release assets before submitting to Winget:

1. A silent Windows installer, such as Inno Setup or NSIS, that installs Yorumi CLI and supports silent switches.
2. A true portable Windows executable, such as a bundled `yorumi-cli.exe`, that does not need `npm install` after extraction.

After that, use:

```powershell
winget install wingetcreate
wingetcreate new
```

Use package identifier `Yorumi.YorumiCLI`, point `InstallerUrl` at the GitHub release asset, and let `wingetcreate` calculate the installer hash.
