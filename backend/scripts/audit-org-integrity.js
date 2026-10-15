#!/usr/bin/env node
'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.development'), override: true });

const printRows = (title, rows) => {
  console.log(`\n[audit] ${title}`);
  if (!rows.length) {
    console.log('[audit] none');
    return;
  }
  for (const row of rows) {
    console.log(row);
  }
};

const main = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    const tables = ['offices', 'departments', 'services', 'visits'];
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      console.log(`[audit] ${table}: ${result.rows[0].count}`);
    }

    const officeDuplicates = await client.query(`
      SELECT lower(name) AS key, COUNT(*)::int AS count, array_agg(id ORDER BY id) AS ids
      FROM offices
      GROUP BY lower(name)
      HAVING COUNT(*) > 1
      ORDER BY count DESC, key ASC
    `);

    const departmentDuplicates = await client.query(`
      SELECT office_id, lower(name) AS key, COUNT(*)::int AS count, array_agg(id ORDER BY id) AS ids
      FROM departments
      WHERE deleted_at IS NULL
      GROUP BY office_id, lower(name)
      HAVING COUNT(*) > 1
      ORDER BY count DESC, office_id ASC, key ASC
    `);

    const visitMappings = await client.query(`
      SELECT v.id AS visit_id, v.office_id, o.name AS office_name, v.department_id, d.name AS department_name
      FROM visits v
      LEFT JOIN offices o ON o.id = v.office_id
      LEFT JOIN departments d ON d.id = v.department_id
      WHERE v.deleted_at IS NULL
      ORDER BY v.id ASC
      LIMIT 25
    `);

    printRows('Duplicate offices by normalized name', officeDuplicates.rows);
    printRows('Duplicate departments within same office', departmentDuplicates.rows);
    printRows('Visit -> office/department sample mapping', visitMappings.rows);
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('[audit] Failed:', error.message || error);
  process.exit(1);
});
