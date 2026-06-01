$ErrorActionPreference = 'Stop'

$installScript = Join-Path $env:TEMP 'yorumi-cli-install.ps1'
$installUrl = 'https://raw.githubusercontent.com/davenarchives/yorumi-cli/v0.1.2/install.ps1'

Get-ChocolateyWebFile `
  -PackageName 'yorumi-cli' `
  -FileFullPath $installScript `
  -Url $installUrl

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript -Ref 'v0.1.2'
