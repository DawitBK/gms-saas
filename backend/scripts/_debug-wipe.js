// Debug version of wipe to find why it fails
const { Client } = require('pg');
const envPath = '.env.development';
require('dotenv').config({ path: envPath });

const config = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  statement_timeout: 60000,
  connectionTimeoutMillis: 10000,
};

console.log('Testing runSingleQuery pattern...');
console.log('Config:', { ...config, password: '***' });

async function runSingleQuery(query, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const client = new Client({
      ...config,
      statement_timeout: 60000,
      connectionTimeoutMillis: 10000,
    });
    try {
      console.log(`[attempt ${i+1}] connecting...`);
      await client.connect();
      console.log(`[attempt ${i+1}] connected, running query...`);
      const res = await client.query(query);
      console.log(`[attempt ${i+1}] query done, ending client...`);
      await client.end();
      console.log(`[attempt ${i+1}] client ended OK`);
      return res;
    } catch (err) {
      try { await client.end(); } catch {}
      if (i === retries - 1) throw err;
      console.log(`[attempt ${i+1}] FAILED: ${err.message} (code: ${err.code})`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

runSingleQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)
  .then(res => {
    console.log('Success! Tables:', res.rows.length);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal:', err.message, err.code);
    process.exit(1);
  });
