#!/usr/bin/env node

/**
 * Migration Script: Add Lesson and Sharing Features
 * Adds lesson tracking and privacy controls to flashcards
 * Usage: node src/scripts/js/modules/add-lesson-and-sharing.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

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

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║ Adding Lesson & Sharing Features               ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Add lesson column to flashcards
    console.log('[1/3] Adding lesson tracking to flashcards...');
    try {
      await client.query(`
        ALTER TABLE flashcards 
        ADD COLUMN IF NOT EXISTS lesson VARCHAR(255);
      `);
      console.log('✅ Added lesson column\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ Column already exists\n');
      } else {
        throw error;
      }
    }

    // Add is_public column to flashcards
    console.log('[2/3] Adding privacy control to flashcards...');
    try {
      await client.query(`
        ALTER TABLE flashcards 
        ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
      `);
      console.log('✅ Added is_public column\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ Column already exists\n');
      } else {
        throw error;
      }
    }

    // Create lessons table for better organization
    console.log('[3/3] Creating lessons table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS lessons (
          lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
        CREATE INDEX IF NOT EXISTS idx_lessons_name ON lessons(user_id, name);
      `);
      console.log('✅ Created lessons table\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ Table already exists\n');
      } else {
        throw error;
      }
    }

    // Add lesson_id FK to flashcards
    console.log('[4/4] Adding lesson reference to flashcards...');
    try {
      await client.query(`
        ALTER TABLE flashcards 
        ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(lesson_id) ON DELETE SET NULL;
      `);
      console.log('✅ Added lesson_id column\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ Column already exists\n');
      } else {
        throw error;
      }
    }

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║ Migration Complete!                            ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Show updated schema
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'flashcards'
      ORDER BY ordinal_position;
    `);

    console.log('Flashcards table schema:');
    result.rows.forEach((row) => {
      console.log(`  • ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Schema migration successful!');
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
