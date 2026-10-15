$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$frontendDir = Join-Path $repoRoot 'frontend'

Set-Location $frontendDir
$env:NODE_ENV = 'production'

npm start
