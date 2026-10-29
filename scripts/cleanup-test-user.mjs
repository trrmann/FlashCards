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

const testUserId = '5536ad0f-2f1c-4282-9702-4ab18a0dc85e';

console.log('🧹 Cleaning up test user data...\n');

try {
  const client = await pool.connect();

  // Check what data exists for this user
  console.log('📋 Checking related data for test user:');

  const flashcards = await client.query(
    'SELECT COUNT(*) as count FROM flashcards WHERE user_id = $1',
    [testUserId]
  );
  console.log(`  - Flashcards: ${flashcards.rows[0].count}`);

  const boxes = await client.query(
    'SELECT COUNT(*) as count FROM leitner_boxes WHERE user_id = $1',
    [testUserId]
  );
  console.log(`  - Leitner boxes: ${boxes.rows[0].count}`);

  const quizzes = await client.query('SELECT COUNT(*) as count FROM quizzes WHERE user_id = $1', [
    testUserId,
  ]);
  console.log(`  - Quizzes: ${quizzes.rows[0].count}`);

  const importLogs = await client.query(
    'SELECT COUNT(*) as count FROM import_export_logs WHERE user_id = $1',
    [testUserId]
  );
  console.log(`  - Import/Export logs: ${importLogs.rows[0].count}`);

  console.log('\n🗑️  Deleting test user and all related data...');

  // Delete in order of foreign key dependencies
  await client.query('DELETE FROM import_export_logs WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted import/export logs');

  await client.query('DELETE FROM quiz_results WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted quiz results');

  await client.query(
    'DELETE FROM quiz_questions WHERE quiz_id IN (SELECT quiz_id FROM quizzes WHERE user_id = $1)',
    [testUserId]
  );
  console.log('  ✓ Deleted quiz questions');

  await client.query('DELETE FROM quizzes WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted quizzes');

  await client.query('DELETE FROM leitner_boxes WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted leitner boxes');

  await client.query('DELETE FROM flashcards WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted flashcards');

  await client.query('DELETE FROM users WHERE user_id = $1', [testUserId]);
  console.log('  ✓ Deleted user');

  console.log('\n✅ Cleanup complete!\n');

  // Verify
  const remaining = await client.query('SELECT user_id, username, email FROM users');
  console.log('Remaining users:');
  console.table(remaining.rows);

  client.release();
} catch (error) {
  console.error('❌ Error during cleanup:', error.message);
} finally {
  await pool.end();
}
