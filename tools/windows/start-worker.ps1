$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot 'backend'

Set-Location $backendDir
$env:NODE_ENV = 'production'
# The other half of the pair: start-backend.ps1 turns both of these OFF so the
# API process does not race this one for the same jobs. Keep the two in step —
# if this script is not being run, the backend must be started without those
# overrides so it processes its own queues.
$env:ENABLE_QUEUE_WORKERS = 'true'
$env:ENABLE_OUTBOX_POLLING = 'true'

npm run outbox:worker
