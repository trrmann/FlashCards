import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_PG_EXTERNAL_HOSTNAME,
  port: parseInt(process.env.DB_PG_PORT || '5432'),
  database: process.env.DB_PG_DATABASE,
  user: process.env.DB_PG_USER,
  password: process.env.DB_PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const result = await pool.query(
  'SELECT user_id, username, email, created_at FROM users ORDER BY created_at'
);
console.log('Current users in database:');
console.table(result.rows);

await pool.end();
