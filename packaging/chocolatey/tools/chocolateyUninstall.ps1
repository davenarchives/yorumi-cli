$ErrorActionPreference = 'Stop'

$command = Get-Command yorumi-cli -ErrorAction SilentlyContinue
if ($command) {
  yorumi-cli --uninstall --yes
  return
}

$installRoot = Join-Path $env:LOCALAPPDATA 'YorumiCLI'
if (Test-Path $installRoot) {
  Remove-Item -LiteralPath $installRoot -Recurse -Force
}
