$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot 'backend'

Set-Location $backendDir
$env:NODE_ENV = 'production'

# This script and start-worker.ps1 are a matched pair for a split API/worker
# deployment. Both ENABLE_QUEUE_WORKERS and ENABLE_OUTBOX_POLLING default to
# true in .env.production, so running the pair as intended used to leave the
# API process ALSO consuming queues and polling the outbox alongside the
# dedicated worker — two processes racing the same jobs. That is precisely the
# hazard backend/deploy/ecosystem.config.js's own header warns about:
# duplicate guest emails and SMS, and duplicate UniFi credential provisioning
# attempts against the same visit.
#
# The API serves HTTP. The worker runs jobs. Turned off explicitly here, rather
# than in .env.production, so that running the backend on its own (no worker,
# the single-process default) still processes its own queues.
$env:ENABLE_QUEUE_WORKERS = 'false'
$env:ENABLE_OUTBOX_POLLING = 'false'

npm start
