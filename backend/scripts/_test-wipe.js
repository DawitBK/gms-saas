const { Client } = require('pg');
require('dotenv').config({ path: '.env.development' });

const config = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  statement_timeout: 60000,
  connectionTimeoutMillis: 10000,
};

console.log('Config (no password):', { ...config, password: '***' });

async function run() {
  const client = new Client(config);
  await client.connect();
  console.log('Connected!');
  const res = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  console.log('Tables found:', res.rows.length);
  if (res.rows.length > 0) {
    console.log('Tables:', res.rows.map(r => r.table_name).join(', '));
  }
  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
