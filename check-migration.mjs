import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: process.env.DB_PG_EXTERNAL_HOSTNAME,
  port: 5432,
  database: process.env.DB_PG_DATABASE,
  user: process.env.DB_PG_USER,
  password: process.env.DB_PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const res = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns 
  WHERE table_name = 'flashcards'
  ORDER BY ordinal_position
`);
console.log('✓ Flashcards table columns:');
res.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`));
await client.end();
