#!/usr/bin/env node

/**
 * Database Initialization Script for FlashCards
 * Initializes PostgreSQL database schema and creates required tables
 * Usage: node scripts/init-db.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Database connection configuration
// For local execution, use external hostname; for Render execution, use internal hostname
const isLocalExecution = !process.env.RENDER;
const hostname = isLocalExecution
  ? process.env.DB_PG_EXTERNAL_HOSTNAME || process.env.DB_PG_INTERNAL_HOSTNAME
  : process.env.DB_PG_INTERNAL_HOSTNAME;

const pool = new Pool({
  host: hostname,
  port: parseInt(process.env.DB_PG_PORT || '5432'),
  database: process.env.DB_PG_DATABASE,
  user: process.env.DB_PG_USER,
  password: process.env.DB_PG_PASSWORD,
  ssl: isLocalExecution ? { rejectUnauthorized: false } : false,
});

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

async function initializeDatabase() {
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
      const sqlName = ['Extensions', 'Users Table', 'Flashcards Table', 'Leitner Boxes Table', 'Quizzes Table', 'Quiz Questions Table', 'Quiz Results Table', 'Import/Export Logs Table'][i];

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

// Run initialization
initializeDatabase();
