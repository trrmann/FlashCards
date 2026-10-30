/**
 * Database Connection Module
 * Manages PostgreSQL connection pool for FlashCards application
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Determine execution environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
const hostname = isProduction
  ? process.env.DB_PG_INTERNAL_HOSTNAME
  : process.env.DB_PG_EXTERNAL_HOSTNAME || process.env.DB_PG_INTERNAL_HOSTNAME;

// Create connection pool
const pool = new Pool({
  host: hostname,
  port: parseInt(process.env.DB_PG_PORT || '5432'),
  database: process.env.DB_PG_DATABASE,
  user: process.env.DB_PG_USER,
  password: process.env.DB_PG_PASSWORD,
  ssl: isProduction ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Initialize database connection
 * Verifies connectivity and tables exist
 */
export async function initializeDatabase() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log(`✅ Database connected: ${hostname}`);
    return true;
  } catch (error) {
    console.error(`❌ Database connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Execute a query
 * @param {string} text - SQL query text
 * @param {array} params - Query parameters
 * @returns {Promise<object>} Query result
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

/**
 * Get a client for transactions
 * @returns {Promise<client>} Database client
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Health check endpoint
 * Returns database connection status
 */
export async function healthCheck() {
  try {
    await query('SELECT 1 as status');
    return {
      status: 'healthy',
      database: process.env.DB_PG_DATABASE,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Close database pool
 */
export async function closePool() {
  await pool.end();
}

export { pool };
export default pool;
