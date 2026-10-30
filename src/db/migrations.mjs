/**
 * Database Migrations
 * Handles schema changes and updates
 */

import { query } from './connection.mjs';

/**
 * List of all migrations to run
 * Each migration should be idempotent (safe to run multiple times)
 */
const migrations = [
  {
    name: 'add_last_page_visited_to_users',
    description: 'Add last_page_visited column to track user navigation',
    run: async () => {
      // Check if column already exists
      const checkResult = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'users' AND column_name = 'last_page_visited'`
      );

      if (checkResult.rows.length > 0) {
        console.log('✓ Column last_page_visited already exists');
        return;
      }

      // Add the column if it doesn't exist
      await query(
        `ALTER TABLE users 
         ADD COLUMN last_page_visited VARCHAR(255) DEFAULT '/' NOT NULL,
         ADD COLUMN last_visited_at TIMESTAMP DEFAULT NOW()`
      );
      console.log('✓ Added last_page_visited and last_visited_at columns to users table');
    },
  },
  {
    name: 'create_flashcards_table',
    description: 'Create flashcards table for storing flashcard entries',
    run: async () => {
      // Check if table already exists
      const checkResult = await query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'flashcards'
        )`
      );

      if (checkResult.rows[0].exists) {
        console.log('✓ Table flashcards already exists');
        return;
      }

      // Create the flashcards table
      await query(`
        CREATE TABLE flashcards (
          flashcard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          created_by UUID REFERENCES users(user_id) ON DELETE CASCADE,
          is_private BOOLEAN NOT NULL DEFAULT true,
          lesson VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✓ Created flashcards table');
    },
  },
  {
    name: 'rename_card_id_to_flashcard_id',
    description: 'Rename card_id column to flashcard_id for consistency',
    run: async () => {
      // Check if card_id column exists
      const cardIdCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'card_id'`
      );

      if (cardIdCheck.rows.length === 0) {
        console.log('✓ card_id column does not exist or already renamed');
        return;
      }

      // Check if flashcard_id already exists
      const flashcardIdCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'flashcard_id'`
      );

      if (flashcardIdCheck.rows.length > 0) {
        console.log('✓ flashcard_id already exists, dropping card_id if present');
        // Drop the old card_id column if both exist
        await query('ALTER TABLE flashcards DROP COLUMN card_id');
        return;
      }

      // Rename card_id to flashcard_id
      await query('ALTER TABLE flashcards RENAME COLUMN card_id TO flashcard_id');
      console.log('✓ Renamed card_id to flashcard_id');
    },
  },
  {
    name: 'create_flashcard_shares_table',
    description: 'Create table for sharing flashcard entries between users',
    run: async () => {
      // Check if table already exists
      const checkResult = await query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'flashcard_shares'
        )`
      );

      if (checkResult.rows[0].exists) {
        console.log('✓ Table flashcard_shares already exists');
        return;
      }

      // Create the shares table
      await query(`
        CREATE TABLE flashcard_shares (
          share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          recipient_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          recipient_status VARCHAR(20) NOT NULL DEFAULT 'pending',
          shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
          accepted_at TIMESTAMP,
          rejected_at TIMESTAMP,
          revoked_at TIMESTAMP,
          UNIQUE(owner_id, recipient_id, flashcard_id)
        )
      `);
      console.log('✓ Created flashcard_shares table');
    },
  },
  {
    name: 'add_privacy_columns_to_flashcards',
    description: 'Add privacy settings to flashcards table',
    run: async () => {
      // Check if columns already exist
      const isPrivateCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'is_private'`
      );

      const createdByCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'created_by'`
      );

      const lessonCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'lesson'`
      );

      // All columns exist
      if (
        isPrivateCheck.rows.length > 0 &&
        createdByCheck.rows.length > 0 &&
        lessonCheck.rows.length > 0
      ) {
        console.log('✓ Privacy columns already exist on flashcards table');
        return;
      }

      // Add columns that don't exist
      const columnsToAdd = [];

      if (isPrivateCheck.rows.length === 0) {
        columnsToAdd.push('is_private BOOLEAN NOT NULL DEFAULT true');
      }

      if (lessonCheck.rows.length === 0) {
        columnsToAdd.push('lesson VARCHAR(255)');
      }

      if (createdByCheck.rows.length === 0) {
        columnsToAdd.push('created_by UUID REFERENCES users(user_id) ON DELETE CASCADE');
      }

      if (columnsToAdd.length > 0) {
        await query(`ALTER TABLE flashcards ADD COLUMN ${columnsToAdd.join(', ADD COLUMN ')}`);
        console.log('✓ Added privacy and lesson columns to flashcards table');
      }
    },
  },
  {
    name: 'add_class_to_flashcards',
    description: 'Add class column to track which class flashcards belong to',
    run: async () => {
      // Check if column already exists
      const checkResult = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'class'`
      );

      if (checkResult.rows.length > 0) {
        console.log('✓ Column class already exists');
        return;
      }

      // Add the column if it doesn't exist
      await query(`ALTER TABLE flashcards ADD COLUMN class VARCHAR(255)`);
      console.log('✓ Added class column to flashcards table');
    },
  },
  {
    name: 'create_flashcard_leitner_progress_table',
    description: 'Create table for tracking Leitner box progress for each flashcard',
    run: async () => {
      // Check if table already exists
      const checkResult = await query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'flashcard_leitner_progress'
        )`
      );

      if (checkResult.rows[0].exists) {
        console.log('✓ Table flashcard_leitner_progress already exists');
        return;
      }

      // Create the table
      await query(
        `CREATE TABLE flashcard_leitner_progress (
          id SERIAL PRIMARY KEY,
          flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          current_box INTEGER NOT NULL DEFAULT 1 CHECK (current_box IN (1, 2, 3)),
          last_reviewed TIMESTAMP,
          next_review TIMESTAMP DEFAULT NOW(),
          times_correct INTEGER DEFAULT 0,
          times_incorrect INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(flashcard_id, user_id)
        )`
      );
      console.log('✓ Created flashcard_leitner_progress table');
    },
  },
  {
    name: 'add_none_of_above_tracking',
    description:
      'Add none_of_above_count to flashcard_leitner_progress for tracking None of Above presentations',
    run: async () => {
      // Check if column already exists
      const checkResult = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcard_leitner_progress' AND column_name = 'none_of_above_count'`
      );

      if (checkResult.rows.length > 0) {
        console.log('✓ Column none_of_above_count already exists');
        return;
      }

      // Add the column if it doesn't exist
      await query(
        `ALTER TABLE flashcard_leitner_progress 
         ADD COLUMN none_of_above_count INTEGER DEFAULT 0`
      );
      console.log('✓ Added none_of_above_count column to flashcard_leitner_progress table');
    },
  },
  {
    name: 'create_practice_history_table',
    description: 'Create table for tracking individual practice attempts',
    run: async () => {
      // Check if table already exists
      const checkResult = await query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'practice_history'
        )`
      );

      if (checkResult.rows[0].exists) {
        console.log('✓ Table practice_history already exists');
        return;
      }

      // Create the table
      await query(
        `CREATE TABLE practice_history (
          id SERIAL PRIMARY KEY,
          flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          leitner_box INTEGER NOT NULL CHECK (leitner_box IN (1, 2, 3)),
          correct BOOLEAN NOT NULL,
          response_time_ms INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )
        `
      );
      console.log('✓ Created practice_history table');
    },
  },
  {
    name: 'add_session_card_attempts_tracking',
    description: 'Add table for tracking multiple card attempts within a single session',
    run: async () => {
      // Check if table exists
      const checkResult = await query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'session_card_attempts'
        )`
      );

      if (checkResult.rows[0].exists) {
        console.log('✓ Table session_card_attempts already exists');
        return;
      }

      // Create the table
      await query(
        `CREATE TABLE session_card_attempts (
          id SERIAL PRIMARY KEY,
          flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          session_start_time TIMESTAMP NOT NULL,
          attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
          was_correct BOOLEAN NOT NULL,
          response_time_ms INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )`
      );

      // Create index separately for PostgreSQL compatibility
      await query(
        `CREATE INDEX idx_session_card ON session_card_attempts (user_id, flashcard_id, session_start_time)`
      );

      console.log('✓ Created session_card_attempts table');
    },
  },
  {
    name: 'add_session_streak_to_leitner_progress',
    description: 'Track consecutive correct answers within current session',
    run: async () => {
      // Check if column exists
      const checkResult = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcard_leitner_progress' AND column_name = 'session_streak'`
      );

      if (checkResult.rows.length > 0) {
        console.log('✓ Column session_streak already exists');
        return;
      }

      // Add the column
      await query(
        `ALTER TABLE flashcard_leitner_progress
         ADD COLUMN session_streak INTEGER DEFAULT 0`
      );
      console.log('✓ Added session_streak column');
    },
  },
  {
    name: 'add_difficulty_scoring_system',
    description: 'Add difficulty field to flashcards and tracking table for adaptive learning',
    run: async () => {
      // Check if difficulty column exists on flashcards
      const difficultyCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'flashcards' AND column_name = 'difficulty_score'`
      );

      if (difficultyCheck.rows.length > 0) {
        console.log('✓ Difficulty scoring already configured');
        return;
      }

      // Add difficulty_score column to flashcards (1.0 to 5.0 scale, default 3.0)
      await query(
        `ALTER TABLE flashcards
         ADD COLUMN difficulty_score DECIMAL(3, 2) DEFAULT 3.00 CHECK (difficulty_score >= 1.0 AND difficulty_score <= 5.0)`
      );

      // Add last_difficulty_update tracking
      await query(
        `ALTER TABLE flashcards
         ADD COLUMN last_difficulty_update TIMESTAMP DEFAULT NOW()`
      );

      // Add calculation_base column to track if difficulty is from shared (all users) or private (individual)
      await query(
        `ALTER TABLE flashcards
         ADD COLUMN difficulty_calc_base VARCHAR(10) DEFAULT 'individual' CHECK (difficulty_calc_base IN ('individual', 'shared'))`
      );

      console.log('✓ Added difficulty scoring system to flashcards table');

      // Create difficulty history table for tracking score changes over time
      await query(
        `CREATE TABLE IF NOT EXISTS difficulty_history (
          id SERIAL PRIMARY KEY,
          flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
          old_score DECIMAL(3, 2),
          new_score DECIMAL(3, 2),
          calculation_basis VARCHAR(255),
          sample_size INTEGER,
          success_rate DECIMAL(5, 2),
          created_at TIMESTAMP DEFAULT NOW()
        )`
      );

      // Create index for fast lookups
      await query(
        `CREATE INDEX IF NOT EXISTS idx_difficulty_history 
         ON difficulty_history (flashcard_id, created_at)`
      );

      console.log('✓ Created difficulty_history table');
    },
  },
];

/**
 * Run all pending migrations
 * @returns {Promise<object>} Migration results
 */
export async function runMigrations() {
  const results = {
    total: migrations.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  console.log(`\n🔄 Running ${migrations.length} migration(s)...`);

  for (const migration of migrations) {
    try {
      console.log(`\n📦 Migration: ${migration.name}`);
      console.log(`   ${migration.description}`);
      await migration.run();
      results.success += 1;
    } catch (error) {
      results.failed += 1;
      results.errors.push({
        migration: migration.name,
        error: error.message,
      });
      console.error(`✗ Migration failed: ${error.message}`);
    }
  }

  console.log(`\n✅ Migrations complete: ${results.success}/${results.total} successful`);

  if (results.failed > 0) {
    console.error(`❌ ${results.failed} migration(s) failed`);
    console.error(JSON.stringify(results.errors, null, 2));
  }

  return results;
}

// Add category column migration if not already added
const addCategoryMigration = {
  name: 'add_category_to_flashcards',
  description: 'Add category column to flashcards for practice filtering',
  run: async () => {
    const categoryCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'flashcards' AND column_name = 'category'`
    );

    if (categoryCheck.rows.length > 0) {
      console.log('✓ Category column already exists');
      return;
    }

    await query(`ALTER TABLE flashcards ADD COLUMN category VARCHAR(255)`);
    console.log('✓ Added category column to flashcards table');
  },
};

// Add it to migrations if not present
if (!migrations.some((m) => m.name === 'add_category_to_flashcards')) {
  migrations.push(addCategoryMigration);
}

export default migrations;
