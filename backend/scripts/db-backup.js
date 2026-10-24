const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * GMS Database Backup Utility
 * 
 * Usage: node scripts/db-backup.js [development|production]
 */

// 1. Determine environment
const mode = process.argv[2] || 'development';
// Same contract as src/config/index.ts: production reads .env.production only,
// anything else reads .env only (there is no .env.development in GMS).
const envFile = mode === 'production' ? '.env.production' : '.env';

// 2. Load env manually to avoid dependency on the full backend bootstrapper.
// override:true so a stray machine-wide DB_* env var can't silently win over
// this file's own values.
const envPath = path.resolve(__dirname, '..', envFile);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

// 2b. Find pg_dump path (especially for Windows)
let pgDumpCmd = 'pg_dump';
const commonPgPaths = [
  'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe'
];

if (process.platform === 'win32') {
  const foundPath = commonPgPaths.find(p => fs.existsSync(p));
  if (foundPath) {
    pgDumpCmd = `"${foundPath}"`;
  }
}

const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';

if (!dbName || !dbUser || !dbPass) {
  console.error(`[ERROR] Missing DB credentials in ${envFile}`);
  process.exit(1);
}

// 3. Ensure backup directory exists in project root
const backupDir = path.resolve(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 4. Generate timestamped filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
const filename = `${dbName}_${mode}_${timestamp}.sql`;
const filepath = path.join(backupDir, filename);

console.log(`[BACKUP] Initializing backup for ${dbName} at ${dbHost}:${dbPort}...`);

try {
  // Use PGPASSWORD to avoid interactive prompt
  process.env.PGPASSWORD = dbPass;
  
  // Execute pg_dump
  const command = `${pgDumpCmd} -h ${dbHost} -p ${dbPort} -U ${dbUser} -f "${filepath}" ${dbName}`;
  
  console.log(`[BACKUP] Executing pg_dump...`);
  execSync(command, { stdio: 'inherit' });

  console.log(`\n[SUCCESS] Backup completed successfully.`);
  console.log(`[FILE] ${filepath}`);
  
  // Optional: Prune backups older than 30 days
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  
  files.forEach(file => {
    const fPath = path.join(backupDir, file);
    const stats = fs.statSync(fPath);
    if (now - stats.mtimeMs > thirtyDaysMs) {
      fs.unlinkSync(fPath);
      console.log(`[PRUNE] Deleted old backup: ${file}`);
    }
  });

} catch (error) {
  console.error(`\n[FAILED] Backup failed.`);
  console.error(`[REASON] ${error.message}`);
  process.exit(1);
} finally {
  // Clear sensitive password from memory
  delete process.env.PGPASSWORD;
}
