$ErrorActionPreference = 'Stop'

$installScript = Join-Path $env:TEMP 'yorumi-cli-install.ps1'
$installUrl = 'https://raw.githubusercontent.com/davenarchives/yorumi-cli/v0.1.3/install.ps1'

Invoke-WebRequest -Uri $installUrl -OutFile $installScript -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript -Ref 'v0.1.3'
