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
// For local execution, use external hostname; for Render execution, use internal hostname
//const isLocalExecution = !process.env.RENDER;
const hostname = isProduction
  ? process.env.DB_PG_INTERNAL_HOSTNAME
  : process.env.DB_PG_EXTERNAL_HOSTNAME || process.env.DB_PG_INTERNAL_HOSTNAME;
//const hostname = isLocalExecution
//  ? process.env.DB_PG_EXTERNAL_HOSTNAME || process.env.DB_PG_INTERNAL_HOSTNAME
//  : process.env.DB_PG_INTERNAL_HOSTNAME;

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
// Database connection configuration

//const pool = new Pool({
//  host: hostname,
//  port: parseInt(process.env.DB_PG_PORT || '5432'),
//  database: process.env.DB_PG_DATABASE,
//  user: process.env.DB_PG_USER,
//  password: process.env.DB_PG_PASSWORD,
//  ssl: isLocalExecution ? { rejectUnauthorized: false } : false,
//});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Initialize database connection
 * Verifies connectivity and tables exist
 */
export async function initializeDatabaseConnection() {
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
/**
 * Database Initialization Script for FlashCards
 * Initializes PostgreSQL database schema and creates required tables
 * Usage: node src/scripts/js/modules/db/connection.mjs
 */

// Load environment variables
dotenv.config();

// SQL to create extensions
const extensionsSQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
`;

// SQL to create users table
const usersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

// SQL to create flashcards table
const flashcardsTableSQL = `
CREATE TABLE IF NOT EXISTS flashcards (
  card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  difficulty INT CHECK (difficulty >= 1 AND difficulty <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_category ON flashcards(category, user_id);
`;

// SQL to create leitner_boxes table
const leitnerBoxesTableSQL = `
CREATE TABLE IF NOT EXISTS leitner_boxes (
  box_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
  box_number INT NOT NULL CHECK (box_number >= 1 AND box_number <= 3),
  review_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  last_reviewed TIMESTAMP,
  next_review TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_leitner_boxes_user_id ON leitner_boxes(user_id);
CREATE INDEX IF NOT EXISTS idx_leitner_boxes_box_number ON leitner_boxes(user_id, box_number);
CREATE INDEX IF NOT EXISTS idx_leitner_boxes_next_review ON leitner_boxes(user_id, next_review);
`;

// SQL to create quizzes table
const quizzesTableSQL = `
CREATE TABLE IF NOT EXISTS quizzes (
  quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
`;

// SQL to create quiz_questions table
const quizQuestionsTableSQL = `
CREATE TABLE IF NOT EXISTS quiz_questions (
  quiz_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id, order_index);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_card_id ON quiz_questions(card_id);
`;

// SQL to create quiz_results table
const quizResultsTableSQL = `
CREATE TABLE IF NOT EXISTS quiz_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  total_questions INT NOT NULL,
  correct_answers INT NOT NULL,
  taken_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz_id ON quiz_results(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_taken_at ON quiz_results(user_id, taken_at DESC);
`;

// SQL to create import_export_logs table
const importExportLogsTableSQL = `
CREATE TABLE IF NOT EXISTS import_export_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('IMPORT', 'EXPORT')),
  file_name VARCHAR(255),
  cards_processed INT DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_export_logs_user_id ON import_export_logs(user_id, created_at DESC);
`;

// All SQL statements to execute
const allSQL = [
  extensionsSQL,
  usersTableSQL,
  flashcardsTableSQL,
  leitnerBoxesTableSQL,
  quizzesTableSQL,
  quizQuestionsTableSQL,
  quizResultsTableSQL,
  importExportLogsTableSQL,
];

async function initializeDatabaseSchema() {
  const client = await pool.connect();

  try {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║ FlashCards Database Initialization             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log(`[INFO] Connecting to database...`);
    console.log(`Host: ${process.env.DB_PG_INTERNAL_HOSTNAME}`);
    console.log(`Database: ${process.env.DB_PG_DATABASE}`);
    console.log(`User: ${process.env.DB_PG_USER}\n`);

    // Execute all SQL
    for (let i = 0; i < allSQL.length; i++) {
      const sqlName = [
        'Extensions',
        'Users Table',
        'Flashcards Table',
        'Leitner Boxes Table',
        'Quizzes Table',
        'Quiz Questions Table',
        'Quiz Results Table',
        'Import/Export Logs Table',
      ][i];

      try {
        process.stdout.write(`[${i + 1}/${allSQL.length}] ${sqlName}... `);
        await client.query(allSQL[i]);
        console.log('✅');
      } catch (error) {
        console.log('⚠️');
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║ Database Initialization Complete!              ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`Created ${result.rows.length} tables:`);
    result.rows.forEach((row) => {
      console.log(`  ✅ ${row.table_name}`);
    });

    console.log('\n✅ Database ready for use!');
  } catch (error) {
    console.error('\n❌ Database initialization failed:');
    console.error(error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
export { initializeDatabaseSchema };
