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

/**
 * Database Expiration Warning Utilities
 * Calculates and formats the database expiration date for display
 */

/**
 * Calculate days remaining until database expiration
 * @returns {Object} Object with daysRemaining and expirationDate
 */
export function getDbExpirationInfo() {
  const expirationDateStr = process.env.DB_PG_EXPIRE;

  if (!expirationDateStr) {
    return {
      daysRemaining: null,
      expirationDate: null,
      status: 'unknown',
    };
  }

  try {
    const expirationDate = new Date(expirationDateStr);
    const today = new Date();

    // Set to start of day for accurate day count
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);

    const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));

    let status = 'safe';
    if (daysRemaining <= 0) {
      status = 'expired';
    } else if (daysRemaining === 1) {
      status = 'critical-1day';
    } else if (daysRemaining <= 3) {
      status = 'critical';
    } else if (daysRemaining <= 10) {
      status = 'warning';
    }

    return {
      daysRemaining,
      expirationDate: expirationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      status,
    };
  } catch (error) {
    console.error('Error parsing DB expiration date:', error);
    return {
      daysRemaining: null,
      expirationDate: null,
      status: 'unknown',
    };
  }
}

/**
 * Get warning message based on days remaining
 * @returns {Object} Object with message and level
 */
export function getExpirationWarning() {
  const info = getDbExpirationInfo();

  if (info.status === 'safe' || info.status === 'unknown') {
    return { message: null, level: null };
  }

  if (info.status === 'expired') {
    return {
      message: `⚠️ DATABASE EXPIRED - Expires: ${info.expirationDate}. Contact support immediately!`,
      level: 'expired',
    };
  }

  if (info.status === 'critical-1day') {
    return {
      message: `🚨 DATABASE EXPIRES IN 1 DAY - ${info.expirationDate}. Action required immediately!`,
      level: 'critical-1day',
    };
  }

  if (info.status === 'critical') {
    return {
      message: `🔴 DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}. Action needed soon!`,
      level: 'critical',
    };
  }

  if (info.status === 'warning') {
    return {
      message: `⚠️ DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}`,
      level: 'warning',
    };
  }

  return { message: null, level: null };
}

export const testQuery = async () => {
  dotenv.config();

  const client = new pg.Client({
    connectionString: process.env.RENDER_DATABASE_URL,
  });

  await client.connect();

  console.log('\n=== ALL FLASHCARDS FOR USER "tmann" ===\n');
  const allCards = await client.query(
    `SELECT flashcard_id, question, answer, class, lesson, category FROM flashcards WHERE created_by = 'tmann' ORDER BY class, lesson, category, flashcard_id`
  );

  allCards.rows.forEach((row) => {
    console.log(
      `[${row.flashcard_id}] Q: "${row.question}" | A: "${row.answer}" | Class: "${row.class}" | Lesson: "${row.lesson}" | Category: "${row.category}"`
    );
  });

  console.log(
    `\n=== CARDS MATCHING FILTER: Class='English Connect' AND Lesson='Week 01' AND Category='vocabulary' ===\n`
  );
  const filtered = await client.query(
    `SELECT flashcard_id, question, class, lesson, category FROM flashcards WHERE created_by = 'tmann' AND class ILIKE 'English Connect' AND lesson ILIKE 'Week 01' AND category ILIKE 'vocabulary'`
  );

  if (filtered.rows.length === 0) {
    console.log('*** NO CARDS MATCH THIS FILTER ***');
  } else {
    filtered.rows.forEach((row) => {
      console.log(`[${row.flashcard_id}] "${row.question}" | Category: "${row.category}"`);
    });
  }

  console.log(`\n=== ALL CARDS IN BOX 1 FOR "tmann" ===\n`);
  const box1 = await client.query(
    `SELECT f.flashcard_id, f.question, f.class, f.lesson, f.category, p.current_box
   FROM flashcards f
   JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
   WHERE f.created_by = 'tmann' AND p.current_box = 1`
  );

  box1.rows.forEach((row) => {
    console.log(
      `[${row.flashcard_id}] "${row.question}" | Category: "${row.category}" | Box: ${row.current_box}`
    );
  });

  await client.end();
};
