# GMS Production Deployment & Maintenance Guide

**Comprehensive Manual for Internal Server Operations**

**Version:** 1.0
**Last Updated:** June 16, 2026
**Target:** Internal Server Deployment & Maintenance

---

## 📋 Table of Contents

1. [Initial Server Setup](#1-initial-server-setup)
2. [Production Deployment Commands](#2-production-deployment-commands)
3. [Application Startup &amp; Process Management](#3-application-startup--process-management)
4. [Logging &amp; Error Tracking](#4-logging--error-tracking)
5. [Database Backup &amp; Recovery](#5-database-backup--recovery)
6. [Automated Backup Scheduler](#6-automated-backup-scheduler)
7. [Debugging Production Issues](#7-debugging-production-issues)
8. [Code Changes Without DB Loss](#8-code-changes-without-db-loss)
9. [Adding New Features](#9-adding-new-features)
10. [Common Production Errors](#10-common-production-errors)
11. [Performance Monitoring](#11-performance-monitoring)
12. [Security Best Practices](#12-security-best-practices)

---

## 1. Initial Server Setup

### Prerequisites

**Server Requirements:**

- OS: Ubuntu 20.04+ / CentOS 8+ / Windows Server 2019+
- CPU: 4+ cores
- RAM: 8GB+ (16GB recommended)
- Disk: 100GB+ SSD
- Node.js: v22.x
- PostgreSQL: 14+
- Redis: 6+

### Step 1: Install Dependencies

**On Ubuntu/Debian:**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

**On Windows Server:**

```powershell
# Install Node.js 22 from https://nodejs.org/
# Install PostgreSQL from https://www.postgresql.org/download/windows/
# Install Redis from https://github.com/tporadowski/redis/releases

# Install PM2 globally
npm install -g pm2
npm install -g pm2-windows-startup

# Configure PM2 to start on boot
pm2-startup install
```

---

## 2. Production Deployment Commands

### Complete Initial Setup Script (Linux/Ubuntu)

```bash
#!/bin/bash
# ===========================================================================
# GMS Production Initial Setup Script
# ===========================================================================
# Run this script ONCE on fresh server to set up everything from scratch
# ===========================================================================

set -e  # Exit on error

echo "=== GMS Production Setup Starting ==="

# 1. Clone repository (if not already cloned)
if [ ! -d "/opt/gms" ]; then
    cd /opt
    git clone https://github.com/your-org/gms.git gms
    cd gms
else
    cd /opt/gms
    git pull origin main
fi

# 2. Install backend dependencies
cd /opt/gms/backend
npm ci --production=false

# 3. Create production database
sudo -u postgres psql -c "CREATE DATABASE gmsprod;" || echo "Database already exists"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'change-me-prod-password';"

# 4. Verify .env.production is correct
echo "Checking .env.production..."
if [ -f ".env.production" ]; then
    echo "✓ .env.production found"
else
    echo "✗ .env.production NOT found! Copy from .env.example and configure."
    exit 1
fi

# 5. Run migrations
npm run migrate:prod

# 6. Seed database (core roles and the bootstrap administrator)
node scripts/run-sequelize-cli.js production db:seed --seed 000-core-seeder.js

# 7. Build TypeScript
npm run build

# 8. Install frontend dependencies and build
cd /opt/gms/frontend
npm ci
npm run build

# 9. Setup PM2 ecosystem
cd /opt/gms
pm2 start backend/deploy/ecosystem.config.js
pm2 save
pm2 startup

echo "=== GMS Production Setup Complete ==="
echo "Next steps:"
echo "1. Login to https://your-domain/gms as admin@gms.local / GMSAdmin@2026"
echo "2. Upload organizational Excel file via Structure Seeding"
echo "3. Verify everything works"
```

**Save as:** `/opt/gms/scripts/prod-setup.sh`

**Run:**

```bash
chmod +x /opt/gms/scripts/prod-setup.sh
sudo /opt/gms/scripts/prod-setup.sh
```

---

### Complete Initial Setup Script (Windows Server)

```powershell
# ===========================================================================
# GMS Production Initial Setup Script (Windows)
# ===========================================================================
# Run this script ONCE on fresh server to set up everything from scratch
# ===========================================================================

Write-Host "=== GMS Production Setup Starting ===" -ForegroundColor Green

# 1. Navigate to installation directory
$InstallDir = "C:\GMS"
if (-Not (Test-Path $InstallDir)) {
    Write-Host "Creating directory: $InstallDir"
    New-Item -ItemType Directory -Path $InstallDir
    cd $InstallDir
    git clone https://github.com/your-org/gms.git .
} else {
    cd $InstallDir
    git pull origin main
}

# 2. Install backend dependencies
cd "$InstallDir\backend"
npm ci --production=false

# 3. Create production database
$env:PGPASSWORD = "change-me-prod-password"
psql -U postgres -c "CREATE DATABASE gmsprod;" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database already exists (this is OK)"
}

# 4. Verify .env.production exists
if (-Not (Test-Path ".env.production")) {
    Write-Host "ERROR: .env.production not found!" -ForegroundColor Red
    Write-Host "Copy from .env.example and configure before running this script."
    exit 1
}

# 5. Run migrations
npm run migrate:prod

# 6. Seed database
node scripts/run-sequelize-cli.js production db:seed --seed 000-core-seeder.js

# 7. Build TypeScript
npm run build

# 8. Install frontend dependencies and build
cd "$InstallDir\frontend"
npm ci
npm run build

# 9. Setup PM2
cd $InstallDir
pm2 start backend/deploy/ecosystem.config.js
pm2 save
pm2-startup install

Write-Host "=== GMS Production Setup Complete ===" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. Login to https://portal.examplecorp.com/gms as admin@gms.local"
Write-Host "2. Upload organizational Excel file"
Write-Host "3. Verify everything works"
```

**Save as:** `C:\GMS\scripts\prod-setup.ps1`

**Run (as Administrator):**

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
C:\GMS\scripts\prod-setup.ps1
```

---

## 3. Application Startup & Process Management

### Using PM2 (Recommended for Production)

PM2 is a production-grade process manager that:

- ✅ Auto-restarts on crashes
- ✅ Monitors CPU/memory usage
- ✅ Manages logs
- ✅ Supports clustering
- ✅ Starts on server boot

#### PM2 Ecosystem Configuration

**Location:** `backend/deploy/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'gms-api',
      script: 'scripts/run-with-env.js',
      args: 'production dist/main.js',
      cwd: '/opt/gms/backend',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/gms/api-error.log',
      out_file: '/var/log/gms/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'gms-outbox',
      script: 'scripts/run-with-env.js',
      args: 'production dist/bin/outbox.worker.js',
      cwd: '/opt/gms/backend',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/gms/outbox-error.log',
      out_file: '/var/log/gms/outbox-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

#### Essential PM2 Commands

```bash
# Start application
pm2 start deploy/ecosystem.config.js

# Stop application
pm2 stop all

# Restart application (0 downtime)
pm2 reload all

# View status
pm2 status

# View logs (real-time)
pm2 logs

# View logs for specific app
pm2 logs gms-api
pm2 logs gms-outbox

# View last 100 lines
pm2 logs --lines 100

# Monitor CPU/memory
pm2 monit

# Save current PM2 state (persists across reboots)
pm2 save

# Setup auto-start on boot
pm2 startup
# Then follow the displayed command (run as sudo)

# Delete all apps from PM2
pm2 delete all

# View detailed info
pm2 show gms-api
```

---

## 4. Logging & Error Tracking

### Log File Locations

**PM2 Logs (default):**

```
~/.pm2/logs/gms-api-error.log
~/.pm2/logs/gms-api-out.log
~/.pm2/logs/gms-outbox-error.log
~/.pm2/logs/gms-outbox-out.log
```

**Custom Logs (if configured in ecosystem.config.js):**

```
/var/log/gms/api-error.log
/var/log/gms/api-out.log
/var/log/gms/outbox-error.log
/var/log/gms/outbox-out.log
```

**Application Logs (Winston/Pino):**

```
backend/logs/combined.log    # All logs
backend/logs/error.log        # Errors only
backend/logs/app-%DATE%.log  # Rotated daily logs
```

### How to Read Logs

#### 1. **View Logs in Real-Time**

```bash
# All PM2 apps
pm2 logs

# Specific app
pm2 logs gms-api

# Follow (like tail -f)
pm2 logs --raw

# Show errors only
pm2 logs --err
```

#### 2. **Search Logs for Errors**

```bash
# Search for specific error
grep -i "error" ~/.pm2/logs/gms-api-error.log

# Search with context (5 lines before/after)
grep -C 5 "database connection" ~/.pm2/logs/gms-api-error.log

# Find all "500" errors
grep "500" ~/.pm2/logs/gms-api-out.log

# Count occurrences
grep -c "ECONNREFUSED" ~/.pm2/logs/gms-api-error.log
```

#### 3. **View Recent Errors**

```bash
# Last 50 lines
tail -n 50 ~/.pm2/logs/gms-api-error.log

# Last 50 lines, live update
tail -f ~/.pm2/logs/gms-api-error.log

# Last 100 lines from combined log
tail -n 100 backend/logs/combined.log
```

#### 4. **Filter Logs by Date/Time**

```bash
# Errors between specific times
awk '/2026-06-16 14:00/,/2026-06-16 15:00/' ~/.pm2/logs/gms-api-error.log

# Today's errors
grep "$(date +%Y-%m-%d)" ~/.pm2/logs/gms-api-error.log
```

---

### Understanding Log Formats

#### Winston/Pino Log Format

```json
{
  "level": "error",
  "message": "Database connection failed",
  "timestamp": "2026-06-16T14:23:45.123Z",
  "stack": "Error: connect ECONNREFUSED 127.0.0.1:5432\n    at TCPConnectWrap.afterConnect...",
  "context": {
    "userId": 123,
    "requestId": "abc-123-def"
  }
}
```

**Key Fields:**

- `level`: `error`, `warn`, `info`, `debug`
- `message`: Human-readable description
- `stack`: Full error stack trace (how to find code location)
- `context`: Additional metadata

---

### Locating Errors in Code

**Example Error Log:**

```
Error: User not found
    at UserService.findById (/opt/gms/backend/dist/modules/users/user.service.js:245:15)
    at UserController.getUser (/opt/gms/backend/dist/modules/users/user.controller.js:89:42)
    at Layer.handle [as handle_request] (/opt/gms/backend/node_modules/express/lib/router/layer.js:95:5)
```

**How to Read Stack Trace:**

1. **First line after "Error:"** shows where the error originated

   - File: `user.service.js`
   - Line: `245`
   - Column: `15`
2. **Locate in Source Code:**

   ```bash
   # TypeScript source (for editing)
   nano /opt/gms/backend/src/modules/users/user.service.ts +245

   # Or use VS Code
   code /opt/gms/backend/src/modules/users/user.service.ts:245
   ```
3. **Find the Function:**

   - Function: `findById` in `UserService` class
4. **Context:**

   - Called from: `UserController.getUser` at line 89

**Debugging Steps:**

1. Open the source file at the line number
2. Check what the code is doing at that point
3. Add more logging around that area:
   ```typescript
   logger.info('Finding user by ID', { userId });
   const user = await this.repository.findById(userId);
   if (!user) {
     logger.warn('User not found', { userId });
     throw new Error('User not found');
   }
   ```
4. Rebuild and deploy

---

### Common Log Patterns to Watch

#### 1. **Database Connection Errors**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Meaning:** PostgreSQL is not running or not accepting connections

**Check:**

```bash
sudo systemctl status postgresql
pg_isready -h 127.0.0.1 -p 5432
```

#### 2. **Authentication Errors**

```
Error: password authentication failed for user "postgres"
```

**Meaning:** Wrong database password in `.env.production`

**Fix:**

```bash
# Update .env.production with correct password
nano /opt/gms/backend/.env.production

# Restart app
pm2 reload all
```

#### 3. **Out of Memory Errors**

```
<--- Last few GCs --->
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Meaning:** App exceeded memory limit

**Fix:**

```bash
# Increase memory limit in ecosystem.config.js
max_memory_restart: '2G'  # Increase from 1G to 2G

# Or increase Node.js heap size
node --max-old-space-size=4096 dist/main.js
```

#### 4. **Port Already in Use**

```
Error: listen EADDRINUSE: address already in use :::7200
```

**Meaning:** Another process is using port 5000

**Find and kill:**

```bash
# Find process using port 5000
lsof -i :7200
# Or
netstat -tulpn | grep 5000

# Kill process
kill -9 <PID>

# Restart PM2
pm2 reload all
```

---

## 5. Database Backup & Recovery

### Manual Backup

#### Create Backup

```bash
# Full database dump
pg_dump -U postgres -h 127.0.0.1 -p 5432 gmsprod > /backup/gms/gmsprod-$(date +%Y%m%d-%H%M%S).sql

# Compressed backup (recommended)
pg_dump -U postgres -h 127.0.0.1 -p 5432 gmsprod | gzip > /backup/gms/gmsprod-$(date +%Y%m%d-%H%M%S).sql.gz

# With password from env
PGPASSWORD=change-me-prod-password pg_dump -U postgres -h 127.0.0.1 -p 5432 gmsprod | gzip > /backup/gms/gmsprod-$(date +%Y%m%d-%H%M%S).sql.gz
```

#### Using npm Script

```bash
cd /opt/gms/backend

# Backup production database
npm run db:backup:prod
```

**Backup Location:**

```
backups/gmsprod_production_YYYYMMDD-HHMMSS.sql
```

(Not `backend/backups/` — `scripts/db-backup.js` resolves its output path two
directories up from `backend/scripts/`, i.e. the repo root, not inside
`backend/`. This doc previously said `backend/backups/`, which doesn't match
where the script actually writes; fixed here so an operator checking the
documented location doesn't conclude backups aren't running when they're one
level up. Also note: the script writes plain uncompressed `.sql`, not
`.sql.gz` — the gzip examples below are for a manual `pg_dump`, not what
`npm run db:backup:prod` produces.)

---

### Restore from Backup

#### 1. **Restore Compressed Backup**

```bash
# Drop existing database (⚠️ DESTRUCTIVE)
PGPASSWORD=change-me-prod-password psql -U postgres -h 127.0.0.1 -p 5432 -c "DROP DATABASE IF EXISTS gmsprod;"

# Create fresh database
PGPASSWORD=change-me-prod-password psql -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE gmsprod;"

# Restore from compressed backup
gunzip < /backup/gms/gmsprod-20260616-143000.sql.gz | PGPASSWORD=change-me-prod-password psql -U postgres -h 127.0.0.1 -p 5432 gmsprod
```

#### 2. **Restore Uncompressed Backup**

```bash
PGPASSWORD=change-me-prod-password psql -U postgres -h 127.0.0.1 -p 5432 gmsprod < /backup/gms/gmsprod-20260616-143000.sql
```

---

### Backup Best Practices

1. **Keep Multiple Backups**

   - Daily: Last 7 days
   - Weekly: Last 4 weeks
   - Monthly: Last 12 months
2. **Verify Backups**

   ```bash
   # Test restore on a separate database
   PGPASSWORD=change-me-prod-password psql -U postgres -c "CREATE DATABASE gmsprod_test;"
   gunzip < /backup/gms/gmsprod-latest.sql.gz | PGPASSWORD=change-me-prod-password psql -U postgres gmsprod_test
   PGPASSWORD=change-me-prod-password psql -U postgres -c "DROP DATABASE gmsprod_test;"
   ```
3. **Store Off-Server**

   - Copy to remote server via rsync or scp
   - Upload to cloud storage (AWS S3, Azure Blob, etc.)
4. **Monitor Backup Size**

   ```bash
   ls -lh /backup/gms/*.sql.gz
   ```

---

## 6. Automated Backup Scheduler

### Linux/Ubuntu - Cron Job

#### Create Backup Script

```bash
sudo nano /opt/gms/scripts/backup-db.sh
```

```bash
#!/bin/bash
# ============================================
# GMS Automatic Database Backup Script
# ============================================

BACKUP_DIR="/backup/gms"
DB_NAME="gmsprod"
DB_USER="postgres"
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_PASSWORD="change-me-prod-password"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/$DB_NAME-$TIMESTAMP.sql.gz"
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Perform backup
export PGPASSWORD=$DB_PASSWORD
pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME | gzip > $BACKUP_FILE

# Check if backup succeeded
if [ $? -eq 0 ]; then
    echo "[$(date)] Backup successful: $BACKUP_FILE" >> $BACKUP_DIR/backup.log
  
    # Delete backups older than retention period
    find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "[$(date)] Old backups cleaned (retention: $RETENTION_DAYS days)" >> $BACKUP_DIR/backup.log
else
    echo "[$(date)] Backup FAILED!" >> $BACKUP_DIR/backup.log
    exit 1
fi

# Optional: Upload to remote server or cloud
# rsync -avz $BACKUP_FILE user@backup-server:/backups/gms/
```

```bash
# Make executable
sudo chmod +x /opt/gms/scripts/backup-db.sh

# Test manually
sudo /opt/gms/scripts/backup-db.sh
```

---

#### Schedule with Cron

```bash
# Edit crontab
crontab -e

# Add these lines:

# Daily backup at 2 AM
0 2 * * * /opt/gms/scripts/backup-db.sh

# Weekly backup at 3 AM on Sundays
0 3 * * 0 /opt/gms/scripts/backup-db.sh

# Hourly backup (for critical production)
0 * * * * /opt/gms/scripts/backup-db.sh
```

**Verify Cron Job:**

```bash
crontab -l
```

**Monitor Backup Log:**

```bash
tail -f /backup/gms/backup.log
```

---

### Windows Server - Task Scheduler

#### Create Backup Script

**Save as:** `C:\GMS\scripts\backup-db.ps1`

```powershell
# ============================================
# GMS Automatic Database Backup Script
# ============================================

$BackupDir = "C:\GMS\backups"
$DBName = "gmsprod"
$DBUser = "postgres"
$DBHost = "127.0.0.1"
$DBPort = "5432"
$DBPassword = "change-me-prod-password"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupFile = "$BackupDir\$DBName-$Timestamp.sql.gz"
$RetentionDays = 30

# Create backup directory
if (-Not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir
}

# Perform backup
$env:PGPASSWORD = $DBPassword
pg_dump -U $DBUser -h $DBHost -p $DBPort $DBName | gzip > $BackupFile

if ($LASTEXITCODE -eq 0) {
    Add-Content "$BackupDir\backup.log" "$(Get-Date) - Backup successful: $BackupFile"
  
    # Delete old backups
    Get-ChildItem $BackupDir -Filter "*.sql.gz" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item
    Add-Content "$BackupDir\backup.log" "$(Get-Date) - Old backups cleaned (retention: $RetentionDays days)"
} else {
    Add-Content "$BackupDir\backup.log" "$(Get-Date) - Backup FAILED!"
    exit 1
}
```

---

#### Schedule with Task Scheduler

```powershell
# Create scheduled task for daily backup at 2 AM
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File C:\GMS\scripts\backup-db.ps1"
$Trigger = New-ScheduledTaskTrigger -Daily -At 2am
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "GMS Database Backup" -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings
```

**Verify Task:**

```powershell
Get-ScheduledTask -TaskName "GMS Database Backup"
```

---

## 7. Debugging Production Issues

### Step-by-Step Debugging Process

#### 1. **Identify the Problem**

**Symptoms:**

- Application crashes
- Slow response times
- Users can't login
- Features not working

**First Steps:**

```bash
# Check application status
pm2 status

# Check recent logs
pm2 logs --lines 100

# Check system resources
top
# Or
htop

# Check disk space
df -h
```

---

#### 2. **Find Error in Logs**

```bash
# Search for errors in last hour
pm2 logs --err --lines 1000 | grep -i "error"

# Find specific error
pm2 logs | grep "User not found"

# Check database connection errors
pm2 logs | grep -i "ECONNREFUSED\|database\|postgresql"

# Check authentication errors
pm2 logs | grep -i "unauthorized\|forbidden\|jwt\|token"
```

---

#### 3. **Locate Error in Code**

**Example Error:**

```
Error: User not found
    at UserService.findById (/opt/gms/backend/dist/modules/users/user.service.js:245:15)
    at UserController.getUser (/opt/gms/backend/dist/modules/users/user.controller.js:89:42)
```

**Find Source File:**

```bash
# The error is in UserService.findById at line 245
# Source file (TypeScript):
nano /opt/gms/backend/src/modules/users/user.service.ts +245

# Or with VS Code
code /opt/gms/backend/src/modules/users/user.service.ts:245
```

---

#### 4. **Add Debug Logging**

**Before:**

```typescript
async findById(id: number): Promise<User> {
  const user = await this.repository.findById(id);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}
```

**After (with logging):**

```typescript
async findById(id: number): Promise<User> {
  logger.info('Finding user by ID', { userId: id });
  
  const user = await this.repository.findById(id);
  
  if (!user) {
    logger.warn('User not found in database', { userId: id });
    throw new Error('User not found');
  }
  
  logger.info('User found successfully', { userId: id, email: user.email });
  return user;
}
```

---

#### 5. **Rebuild and Deploy**

```bash
cd /opt/gms/backend

# Rebuild TypeScript
npm run build

# Restart application (0 downtime)
pm2 reload all

# Watch logs
pm2 logs
```

---

#### 6. **Test the Fix**

```bash
# Test API endpoint
curl -X GET http://127.0.0.1:7200/api/v1/users/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check logs for new debug messages
pm2 logs | grep "Finding user by ID"
```

---

### Common Debugging Techniques

#### 1. **Enable Debug Mode**

```bash
# Set in .env.production
LOG_LEVEL=debug

# Restart
pm2 reload all
```

#### 2. **Test Database Connection**

```bash
PGPASSWORD=change-me-prod-password psql -U postgres -h 127.0.0.1 -p 5432 -d gmsprod -c "SELECT 1;"
```

#### 3. **Test Redis Connection**

```bash
redis-cli ping
# Should return: PONG
```

#### 4. **Check Network Connectivity**

```bash
# Test external API
curl https://api.africastalking.com/version

# Test UniFi Controller
curl -k https://192.168.6.2:12445/api/v1/developer/devices \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 5. **Monitor Real-Time Metrics**

```bash
# PM2 monitoring
pm2 monit

# Database connections
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'gmsprod';"

# Redis memory
redis-cli info memory
```

---

## 8. Code Changes Without DB Loss

### Safe Code Deployment Process

#### The Golden Rule

**✅ NEVER run migrations that drop tables/columns in production without a backup**

**✅ ALWAYS test on staging first**

**✅ ALWAYS backup before deploying**

---

### Deployment Workflow

#### Step 1: Backup Current State

```bash
# Full backup
cd /opt/gms/backend
npm run db:backup:prod

# Verify backup exists
ls -lh backups/
```

---

#### Step 2: Pull Latest Code

```bash
cd /opt/gms

# Stash any local changes
git stash

# Pull latest from repository
git pull origin main

# Restore local changes if needed
git stash pop
```

---

#### Step 3: Update Dependencies (if needed)

```bash
cd /opt/gms/backend
npm ci

cd /opt/gms/frontend
npm ci
```

---

#### Step 4: Check for New Migrations

```bash
cd /opt/gms/backend

# List pending migrations
npm run migrate:prod -- --list

# Review migration files
ls -la src/core/db/migrations/
```

**⚠️ CRITICAL:** Review each new migration file to ensure it:

- ✅ Does NOT drop tables
- ✅ Does NOT drop columns with data
- ✅ Uses `ADD COLUMN` instead of altering existing columns
- ✅ Has proper `down()` function for rollback

---

#### Step 5: Run Migrations

```bash
# Run new migrations
npm run migrate:prod

# Check migration status
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "SELECT * FROM \"SequelizeMeta\" ORDER BY name DESC LIMIT 5;"
```

---

#### Step 6: Build Application

```bash
# Backend
cd /opt/gms/backend
npm run build

# Frontend (if UI changes)
cd /opt/gms/frontend
npm run build
```

---

#### Step 7: Deploy with Zero Downtime

```bash
# PM2 reload (0 downtime)
pm2 reload all

# Watch logs for errors
pm2 logs --lines 50
```

---

#### Step 8: Verify Deployment

```bash
# Check health endpoint
curl http://127.0.0.1:7200/health

# Check recent logs
pm2 logs --lines 20

# Test critical endpoints
curl -X POST http://127.0.0.1:7200/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gms.local","password":"GMSAdmin@2026"}'
```

---

### What if Something Goes Wrong?

#### Rollback Steps

**1. Revert Code:**

```bash
cd /opt/gms

# Check git history
git log --oneline -n 10

# Revert to previous commit
git reset --hard <commit-hash>

# Rebuild
cd backend && npm run build
pm2 reload all
```

**2. Revert Migrations (if migration caused issue):**

```bash
cd /opt/gms/backend

# Undo last migration
npm run migrate:undo:prod

# Undo specific migration
npx sequelize-cli db:migrate:undo --name <migration-name> --env production
```

**3. Restore Database from Backup:**

```bash
# Drop and restore (⚠️ DESTRUCTIVE)
PGPASSWORD=change-me-prod-password psql -U postgres -c "DROP DATABASE gmsprod;"
PGPASSWORD=change-me-prod-password psql -U postgres -c "CREATE DATABASE gmsprod;"
gunzip < backups/gmsprod-latest.sql.gz | PGPASSWORD=change-me-prod-password psql -U postgres gmsprod
```

---

### Safe Migration Patterns

#### ✅ SAFE: Add New Column

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'phone_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'phone_verified');
  }
};
```

#### ✅ SAFE: Add New Table

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      // ... other columns
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('audit_logs');
  }
};
```

#### ⚠️ RISKY: Rename Column (requires data migration)

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Add new column
    await queryInterface.addColumn('users', 'full_name', {
      type: Sequelize.STRING(255)
    });
  
    // Step 2: Copy data from old column
    await queryInterface.sequelize.query(
      'UPDATE users SET full_name = first_name WHERE full_name IS NULL'
    );
  
    // Step 3: Drop old column (ONLY after verifying data copied)
    // DO NOT include in same migration - deploy in separate release
    // await queryInterface.removeColumn('users', 'first_name');
  },
  down: async (queryInterface) => {
    // Rollback logic
  }
};
```

#### ❌ DANGEROUS: Drop Table

```javascript
// NEVER DO THIS IN PRODUCTION WITHOUT EXPLICIT BACKUP AND APPROVAL
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.dropTable('old_data');  // ❌ Data loss!
  }
};
```

---

## 9. Adding New Features

### Development Workflow

#### Step 1: Set Up Local Development

```bash
# Clone repository
git clone https://github.com/your-org/gms.git
cd gms

# Create development branch
git checkout -b feature/new-feature-name

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Use local development database (gmsdev, not gmsprod!)
cd backend
cp .env.example .env.development
# Edit .env.development to use gmsdev
```

---

#### Step 2: Develop Feature

**Example: Add a new "Notes" field to visits**

**1. Create Migration:**

```bash
cd backend
npx sequelize-cli migration:create --name add-notes-to-visits
```

**2. Edit Migration File:**

```javascript
// backend/src/core/db/migrations/YYYYMMDD-add-notes-to-visits.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('visits', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('visits', 'notes');
  }
};
```

**3. Run Migration Locally:**

```bash
npm run migrate
```

**4. Update Model:**

```typescript
// backend/src/infrastructure/database/models/Visit.ts
export class Visit extends Model {
  declare id: number;
  declare guest_id: number;
  declare host_id: number;
  declare status: string;
  declare notes?: string;  // ✅ Add this
  // ... other fields
}
```

**5. Update Service Logic:**

```typescript
// backend/src/modules/visits/visit.service.ts
async createVisit(data: CreateVisitDTO): Promise<Visit> {
  const visit = await Visit.create({
    guest_id: data.guestId,
    host_id: data.hostId,
    status: 'PENDING',
    notes: data.notes,  // ✅ Add this
    // ... other fields
  });
  return visit;
}
```

**6. Update Frontend (if needed):**

```typescript
// frontend/features/visits/components/CreateVisitForm.tsx
<textarea
  name="notes"
  placeholder="Add visit notes"
  value={formData.notes}
  onChange={handleChange}
/>
```

---

#### Step 3: Test Locally

```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev

# Test the feature in browser
# http://localhost:7201
```

---

#### Step 4: Commit and Push

```bash
git add .
git commit -m "feat: add notes field to visits"
git push origin feature/new-feature-name

# Create pull request on GitHub/GitLab
```

---

#### Step 5: Deploy to Production

**After PR is approved and merged:**

```bash
# On production server
cd /opt/gms

# Backup database
cd backend && npm run db:backup:prod

# Pull latest code
git pull origin main

# Run migration
npm run migrate:prod

# Build
npm run build

# Deploy
pm2 reload all

# Verify
pm2 logs --lines 20
```

---

### Feature Development Best Practices

1. **Always use feature branches**

   - `feature/add-notes-field`
   - `bugfix/fix-login-issue`
   - `hotfix/critical-security-patch`
2. **Write tests (if test framework is set up)**

   ```bash
   npm test
   ```
3. **Follow code style**

   - Use ESLint/Prettier
   - Match existing patterns
4. **Document changes**

   - Update README if needed
   - Add inline code comments
   - Update API docs (Swagger)
5. **Never commit secrets**

   - `.env` files should be in `.gitignore`
   - Use environment variables

---

## 10. Common Production Errors

### Error Catalog & Solutions

#### 1. **Database Connection Refused**

**Error:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause:** PostgreSQL is not running

**Solution:**

```bash
# Check status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Enable on boot
sudo systemctl enable postgresql

# Verify
pg_isready -h 127.0.0.1 -p 5432
```

---

#### 2. **Password Authentication Failed**

**Error:**

```
Error: password authentication failed for user "postgres"
```

**Cause:** Wrong password in `.env.production`

**Solution:**

```bash
# Update password
sudo -u postgres psql
ALTER USER postgres PASSWORD 'change-me-prod-password';
\q

# Update .env.production
nano /opt/gms/backend/.env.production
# Set: DB_PASSWORD=change-me-prod-password

# Restart app
pm2 reload all
```

---

#### 3. **Port Already in Use**

**Error:**

```
Error: listen EADDRINUSE: address already in use :::7200
```

**Cause:** Another process is using port 5000

**Solution:**

```bash
# Find process
lsof -i :7200
# Or
netstat -tulpn | grep 5000

# Kill process
kill -9 <PID>

# Restart PM2
pm2 reload all
```

---

#### 4. **Out of Memory**

**Error:**

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Cause:** Node.js exceeded memory limit

**Solution:**

```bash
# Increase memory in ecosystem.config.js
nano /opt/gms/backend/deploy/ecosystem.config.js

# Change:
max_memory_restart: '2G'  # Increase from 1G

# Restart
pm2 reload all

# Or increase Node.js heap
node --max-old-space-size=4096 dist/main.js
```

---

#### 5. **Migration Failed**

**Error:**

```
Error: column "email" of relation "users" already exists
```

**Cause:** Migration was already run or partially applied

**Solution:**

```bash
# Check migration status
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "SELECT * FROM \"SequelizeMeta\";"

# If migration is in table but failed, manually fix and mark as done
# Or undo migration
npm run migrate:undo:prod

# Then re-run
npm run migrate:prod
```

---

#### 6. **Redis Connection Failed**

**Error:**

```
Error: Redis connection to 127.0.0.1:6379 failed
```

**Cause:** Redis is not running

**Solution:**

```bash
# Start Redis
sudo systemctl start redis

# Check status
redis-cli ping
# Should return: PONG

# Restart app
pm2 reload all
```

---

#### 7. **UniFi Controller Unreachable**

**Error:**

```
Error: connect ETIMEDOUT 192.168.6.2:12445
```

**Cause:** UniFi Access controller is down or network issue

**Solution:**

```bash
# Verify network connectivity
ping 192.168.6.2

# Test API endpoint
curl -k https://192.168.6.2:12445/api/v1/developer/devices \
  -H "Authorization: Bearer YOUR_API_KEY"

# If controller is down, GMS will fall back to internal credentials
# Check .env.production:
# UNIFI_STUB_MODE=false (for real integration)
# UNIFI_STUB_MODE=true (for testing without controller)
```

---

#### 8. **JWT Token Expired**

**Error:**

```
Error: jwt expired
```

**Cause:** User's session expired

**Solution:**

- This is expected behavior
- User must login again
- Adjust token expiry in `.env.production`:
  ```
  JWT_EXPIRES_IN=1h  # Increase if needed
  JWT_REFRESH_EXPIRES_IN=7d
  ```

---

#### 9. **Disk Space Full**

**Error:**

```
Error: ENOSPC: no space left on device
```

**Solution:**

```bash
# Check disk usage
df -h

# Find large files
du -h /opt/gms | sort -rh | head -20

# Clean up
# - Old logs: rm /var/log/gms/*.log.old
# - Old backups: find /backup/gms -mtime +30 -delete
# - PM2 logs: pm2 flush

# Clear package caches
npm cache clean --force
```

---

#### 10. **Bulk Import Errors**

**Error:**

```
Office not found: "Gelan"
Department not found: "IT Department"
```

**Cause:** Spelling mismatch or missing office/department in Excel

**Solution:**

1. Check Excel file for typos
2. Ensure offices are created before departments
3. Ensure departments are created before services
4. Check for trailing spaces in names
5. Verify office names match exactly between sheets

**Better:** The latest code fixes handle this automatically by being more forgiving with:

- Trimming whitespace
- Ignoring "-" placeholders
- Providing better error messages

---

## 11. Performance Monitoring

### Key Metrics to Monitor

#### 1. **Application Health**

```bash
# PM2 status
pm2 status

# Memory usage
pm2 list

# CPU/Memory details
pm2 show gms-api
```

---

#### 2. **Database Performance**

```bash
# Active connections
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "
  SELECT count(*), state 
  FROM pg_stat_activity 
  WHERE datname = 'gmsprod' 
  GROUP BY state;"

# Slow queries
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
  FROM pg_stat_activity 
  WHERE state != 'idle' 
  ORDER BY duration DESC;"

# Database size
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "
  SELECT pg_size_pretty(pg_database_size('gmsprod'));"
```

---

#### 3. **Redis Performance**

```bash
# Redis info
redis-cli info

# Memory usage
redis-cli info memory

# Connected clients
redis-cli info clients

# Hit rate
redis-cli info stats
```

---

#### 4. **System Resources**

```bash
# CPU and memory
top

# Or use htop (more user-friendly)
htop

# Disk usage
df -h

# Network connections
netstat -an | grep :7200 | wc -l
```

---

### Performance Optimization Tips

1. **Enable Redis Caching**

   - Cache frequently accessed data
   - Set appropriate TTLs
2. **Database Indexing**

   - Ensure indexes on frequently queried columns
   - Check query performance with EXPLAIN
3. **PM2 Clustering**

   - Use multiple instances for load balancing
   - Set `instances: 'max'` in ecosystem.config.js
4. **Log Rotation**

   - Prevent log files from growing too large
   - Use logrotate or PM2's built-in rotation
5. **Monitor Outbox Queue**

   ```bash
   PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "
     SELECT status, count(*) 
     FROM outbox_events 
     GROUP BY status;"
   ```

---

## 12. Security Best Practices

### 1. **Environment Variables**

✅ **DO:**

- Store secrets in `.env.production` (never commit to Git)
- Use strong, random JWT secrets (at least 32 characters)
- Change default passwords

❌ **DON'T:**

- Commit `.env` files to Git
- Use the same secrets in dev and production
- Share secrets over insecure channels

---

### 2. **Database Security**

```bash
# Use strong passwords
ALTER USER postgres PASSWORD 'Complex!Pass@2026#Secure';

# Restrict network access (pg_hba.conf)
# Only allow localhost
nano /etc/postgresql/14/main/pg_hba.conf

# Add:
host    gmsprod    postgres    127.0.0.1/32    md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

### 3. **Firewall Configuration**

```bash
# Ubuntu/Debian - UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Block direct access to Node.js (use nginx proxy instead)
# Do NOT: sudo ufw allow 5000/tcp
```

---

### 4. **HTTPS/SSL**

Use a reverse proxy (nginx) with SSL:

```nginx
# /etc/nginx/sites-available/gms
server {
    listen 443 ssl;
    server_name portal.examplecorp.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /gms/ {
        proxy_pass http://127.0.0.1:7201/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:7200/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

### 5. **Regular Updates**

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies (check for security vulnerabilities)
cd /opt/gms/backend
npm audit
npm audit fix

cd /opt/gms/frontend
npm audit
npm audit fix
```

---

### 6. **Backup Security**

```bash
# Encrypt backups
gpg --encrypt --recipient your-email@example.com /backup/gms/gmsprod-latest.sql.gz

# Store off-server
# Upload to AWS S3, Azure Blob, or remote server
```

---

### 7. **Monitor Failed Login Attempts**

```bash
# Check audit logs for failed logins
PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "
  SELECT * FROM audit_logs 
  WHERE action = 'LOGIN_FAILED' 
  ORDER BY created_at DESC 
  LIMIT 20;"
```

---

---

## 13. Service Duration and Visit Scheduling

### How Service Duration Works

**Key Concept**: The `duration_minutes` field on each service controls the actual duration of visits booked for that service, **not** the timeslot intervals.

#### Service Duration Configuration

When creating or editing a service in the admin panel:

```typescript
{
  name: "Quick Consultation",
  duration_minutes: 30,  // ✅ This controls visit duration
  department_id: 1,
  office_id: 1,
  host_ids: [10, 20]
}
```

#### How It Affects Visit Scheduling

**Timeslot Generation:**

- Host availability rules generate timeslots at fixed intervals (default 60 minutes)
- Example: A host sets availability from 9:00 AM to 12:00 PM
- System creates slots: [9:00-10:00], [10:00-11:00], [11:00-12:00]

**Visit Booking:**

- When a guest books a 30-minute service at 9:00 AM:
  ```typescript
  scheduled_start: "2026-06-16 09:00:00"
  scheduled_end:   "2026-06-16 09:30:00"  // ✅ Uses service duration_minutes
  ```
- The timeslot [9:00-10:00] is marked as booked
- The visit itself only occupies 9:00-9:30

**Benefits:**

- Flexible scheduling based on service type
- Accurate visit duration tracking
- Better capacity planning and reporting
- SLA deadlines based on actual service duration

#### Examples

**Example 1: 30-Minute Service**

```
Service: "Quick IT Support" (30 minutes)
Timeslot: 2:00 PM - 3:00 PM
Visit Scheduled: 2:00 PM - 2:30 PM ✅
```

**Example 2: 2-Hour Service**

```
Service: "Executive Briefing" (120 minutes)
Timeslot: 10:00 AM - 11:00 AM
Visit Scheduled: 10:00 AM - 12:00 PM ✅
Note: Extends beyond single slot boundary
```

**Example 3: Default Duration**

```
Service: "General Meeting" (no duration_minutes set)
Default: 30 minutes
Timeslot: 1:00 PM - 2:00 PM
Visit Scheduled: 1:00 PM - 1:30 PM ✅
```

#### Configuration Reference

**Default Duration:**

```typescript
// backend/src/config/visit-policy.config.ts
DEFAULT_SLOT_DURATION_MINUTES: 60  // Default for timeslot generation
```

**Service Duration Validation:**

```typescript
// backend/src/modules/services/service.schema.ts
duration_minutes: z.number()
  .int('Duration must be a whole number')
  .positive('Duration must be greater than zero')
  .max(480, 'Service duration cannot exceed 8 hours')  // Max 8 hours
  .optional()
```

**Database Default:**

```sql
-- Service model default
duration_minutes INTEGER NOT NULL DEFAULT 30
```

#### Important Notes

1. **Timeslot Booking**: Once a timeslot is booked for any visit, it cannot be used by another guest, regardless of the service duration.
2. **Rescheduling**: When a visit is rescheduled to a new timeslot, the system recalculates `scheduled_end` based on the service's `duration_minutes`.
3. **Reassignment**: When a visit is reassigned to a different host with a new timeslot, the duration is preserved from the original service.
4. **Bulk Import**: When importing services via Excel, ensure the "Duration (Mins)" column is properly set for each service.

#### Troubleshooting

**Issue**: Visits show incorrect duration

**Solution**:

1. Check the service `duration_minutes` field:

   ```bash
   PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "SELECT id, name, duration_minutes FROM services WHERE id = <service_id>;"
   ```
2. Update if needed:

   ```bash
   PGPASSWORD=change-me-prod-password psql -U postgres -d gmsprod -c "UPDATE services SET duration_minutes = 45 WHERE id = <service_id>;"
   ```
3. Existing visits keep their original scheduled_end. Only new bookings use the updated duration.

**Issue**: Service duration validation errors

**Solution**: Ensure duration is between 1 and 480 minutes (8 hours):

- Minimum: 1 minute
- Maximum: 480 minutes (8 hours)
- Must be a positive integer

---
