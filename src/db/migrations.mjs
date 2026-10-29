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

export default migrations;
