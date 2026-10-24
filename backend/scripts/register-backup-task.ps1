<#
.SYNOPSIS
  Registers a Scheduled Task that runs GMS's existing `npm run db:backup:prod`
  nightly. The script (scripts/db-backup.js) already exists and works  -  this
  is the missing piece: nothing confirms it's actually scheduled on the live
  server today. RUN THIS ON THE LIVE
  SERVER.
#>

param(
  # Default corrected 2026-09-09 (was B:\Company_Systems, two roots out
  # of date -- running this unedited registered a task against a stale checkout).
  [string]$BackendPath = "B:\COMPANY_SYSTEMS\GMS\backend",
  [string]$TaskName = "ExampleCorp-GMS-DB-Backup",
  # Was 02:00, identical to DMS's default -- the two would have started
  # together every night against one Postgres instance on one physical disk.
  # GMS's dump is by far the largest of the three, so it gets its own slot.
  [string]$At = "02:20"
)

if (-not (Test-Path (Join-Path $BackendPath "package.json"))) {
  Write-Error "GMS backend not found at $BackendPath  -  pass -BackendPath to point at the real location on this box."
  exit 1
}

$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if (-not $npmCmd) {
  Write-Error "npm.cmd not found on PATH for this session  -  Task Scheduler runs with a minimal environment, so specify the full path if npm isn't globally on PATH for the account this task will run as."
  exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "A task named '$TaskName' already exists (State: $($existing.State))  -  it's already scheduled."
  Write-Host "Unregister it first if you want to re-register: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
  exit 0
}

$action  = New-ScheduledTaskAction -Execute $npmCmd.Source -Argument "run db:backup:prod" -WorkingDirectory $BackendPath
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Nightly gmsprod backup via db-backup.js. See PRODUCTION_GUIDE.md Section 5/Section 6." `
  -RunLevel Highest

Write-Host "Registered '$TaskName' (daily at $At). Verify with:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host ""
Write-Host "Test immediately: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Then check backups\ (repo root, not backend\backups\) for a new .sql file."
